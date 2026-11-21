"""Анализ песни: ссылка/файл -> Deezer (метаданные + 30-сек превью) -> librosa.

analyze_song(song_url, file_path) -> dict
Ключи: title, artist, source_url, preview_url, audio_path, bpm, mode, key, energy, valence,
       genre, year, beats[сек], sections[сек], source ("deezer" | "file" | "fallback").

Полные чужие песни не храним: только официальное превью Deezer (30 сек) или файл пользователя.
"""
from __future__ import annotations

import html
import logging
import re
import tempfile
import time
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx

log = logging.getLogger(__name__)

DEEZER = "https://api.deezer.com"
UA = {"User-Agent": "Mozilla/5.0 (limelight diary)"}
TIMEOUT = 15
SR = 11025
MAX_SEC = 30.0

# Профили Крумханзля-Кесслер для определения лада
MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]
NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

_JUNK = re.compile(
    r"\((official|music|lyric|lyrics|audio|video|hd|4k|клип|премьера)[^)]*\)|\[[^\]]*\]|"
    r"official (music )?video|lyrics?|\| ?spotify|слушать онлайн.*|- ?youtube",
    re.I,
)


# ---------- 1. что за песня ----------

def _clean(s: str) -> str:
    s = html.unescape(s or "")
    s = _JUNK.sub("", s)
    return re.sub(r"\s+", " ", s).strip(" -–—|·")


def _page_title(c: httpx.Client, url: str) -> str:
    r = c.get(url, headers=UA, follow_redirects=True)
    m = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', r.text) or re.search(
        r"<title>(.*?)</title>", r.text, re.S
    )
    return m.group(1) if m else ""


def _identify(c: httpx.Client, url: str) -> tuple[str | None, str]:
    """Возвращает (deezer_track_id | None, поисковый запрос «артист трек»)."""
    host = urlparse(url).netloc.lower()

    if "deezer" in host:
        if "link.deezer" in host or "deezer.page.link" in host:  # короткие ссылки
            url = str(c.get(url, follow_redirects=True).url)
        m = re.search(r"/track/(\d+)", url)
        if m:
            return m.group(1), ""

    if "youtube" in host or "youtu.be" in host:
        j = c.get("https://www.youtube.com/oembed", params={"url": url, "format": "json"}).json()
        title, author = _clean(j.get("title", "")), _clean(re.sub(r" - Topic$", "", j.get("author_name", "")))
        # «Артист - Трек» в названии ролика, иначе берём канал как артиста
        return None, title if " - " in title else f"{author} {title}"

    if "spotify" in host:
        j = c.get("https://open.spotify.com/oembed", params={"url": url}).json()
        track = _clean(j.get("title", ""))
        # артиста в oEmbed нет, он есть в og:description страницы: «Artist · Song · 2019»
        try:
            r = c.get(url, headers=UA, follow_redirects=True)
            m = re.search(r'<meta[^>]+property="og:description"[^>]+content="([^"]+)"', r.text)
            artist = html.unescape(m.group(1)).split("·")[0].strip() if m else ""
        except Exception:
            artist = ""
        return None, f"{artist} {track}".strip()

    if "music.yandex" in host or "music.apple" in host or "soundcloud" in host:
        return None, _clean(_page_title(c, url))

    # не ссылка, а текст «Артист - Песня»
    if not host:
        return None, _clean(url)
    return None, _clean(_page_title(c, url))


def _deezer_track(c: httpx.Client, track_id: str | None, query: str) -> dict | None:
    if track_id:
        t = c.get(f"{DEEZER}/track/{track_id}").json()
        if "error" not in t:
            return t
    if not query:
        return None
    for q in (query, re.sub(r"\b(feat|ft)\.?.*", "", query, flags=re.I)):
        data = c.get(f"{DEEZER}/search", params={"q": q, "limit": 5}).json().get("data") or []
        with_preview = [t for t in data if t.get("preview")]
        if with_preview:
            return c.get(f"{DEEZER}/track/{with_preview[0]['id']}").json()
    return None


def _first_year(c: httpx.Client, artist: str, title: str) -> int | None:
    """Год первого релиза записи по MusicBrainz: Deezer часто отдаёт переиздание или сборник."""
    try:
        q = f'recording:"{title}" AND artist:"{artist}"'
        r = c.get(
            "https://musicbrainz.org/ws/2/recording",
            params={"query": q, "fmt": "json", "limit": 10},
            headers={"User-Agent": "LimeLightDiary/0.1 (hackathon project)"},
            timeout=8,
        )
        years = [
            int(rec["first-release-date"][:4])
            for rec in r.json().get("recordings", [])
            if rec.get("score", 0) >= 90 and (rec.get("first-release-date") or "")[:4].isdigit()
        ]
        return min(years) if years else None
    except Exception as e:
        log.info("MusicBrainz: %s", e)
        return None


def _album_meta(c: httpx.Client, track: dict) -> tuple[str | None, int | None]:
    year = None
    rd = track.get("release_date") or (track.get("album") or {}).get("release_date") or ""
    if rd[:4].isdigit() and rd[:4] != "0000":
        year = int(rd[:4])
    genre = None
    album_id = (track.get("album") or {}).get("id")
    if album_id:
        a = c.get(f"{DEEZER}/album/{album_id}").json()
        genres = (a.get("genres") or {}).get("data") or []
        genre = genres[0]["name"].lower() if genres else None
        ard = a.get("release_date") or ""
        if ard[:4].isdigit() and (year is None or int(ard[:4]) < year):
            year = int(ard[:4])
    return genre, year


# ---------- 2. как звучит ----------

def _norm(x: float, lo: float, hi: float) -> float:
    return float(max(0.0, min(1.0, (x - lo) / (hi - lo))))


def analyze_audio(path: str, hint_bpm: float | None = None) -> dict:
    """librosa: темп, биты, части песни, лад, энергия, валентность. ~1-2 сек на 30-сек превью."""
    import librosa  # тяжёлый импорт только когда нужен
    import numpy as np

    y, sr = librosa.load(path, sr=SR, mono=True, duration=MAX_SEC)
    if y.size < sr * 3:
        raise ValueError("слишком короткий звук")
    duration = float(len(y) / sr)

    # темп и биты
    # hop 256 при 11 кГц = шаг 23 мс; темп уточняем по среднему интервалу между битами,
    # иначе beat_track отдаёт значения сетки (117.5, 129.2...)
    hop = 256
    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    if hint_bpm and 50 <= hint_bpm <= 220:
        # темп из Deezer как опора: librosa часто ошибается в 1.25-2 раза на электронике
        tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop,
                                                     start_bpm=float(hint_bpm), tightness=400)
    else:
        tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=hop)
    bpm = float(np.atleast_1d(tempo)[0])
    beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    if len(beat_times) > 8:
        d = np.diff(beat_times)
        med = float(np.median(d))
        d = d[np.abs(d - med) < 0.2 * med]
        if len(d) > 4:
            bpm = 60.0 / float(d.mean())
    beats = beat_times.round(3).tolist()

    # лад: CQT-хромограмма -> медиана по битам (гасит ударные дешевле, чем HPSS) -> 24 профиля Крумханзля
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    if len(beat_frames) > 4:
        prof = np.median(librosa.util.sync(chroma, beat_frames // 2, aggregate=np.median), axis=1)
    else:
        prof = chroma.mean(axis=1)
    best = (-2.0, "major", 0)
    for i in range(12):
        for mode, tmpl in (("major", MAJOR_PROFILE), ("minor", MINOR_PROFILE)):
            r = float(np.corrcoef(prof, np.roll(tmpl, i))[0, 1])
            if r > best[0]:
                best = (r, mode, i)
    _, mode, tonic = best

    # части песни: кластеризация по тембру и гармонии, границы в секундах
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    feats = np.vstack([librosa.util.normalize(mfcc, axis=1), chroma])
    k = int(max(2, min(5, round(duration / 8))))
    bounds = librosa.segment.agglomerative(feats, k)
    sections = sorted({0.0, *librosa.frames_to_time(bounds, sr=sr).round(2).tolist()})
    sections = [s for i, s in enumerate(sections) if i == 0 or s - sections[i - 1] >= 3.0]

    # энергия: громкость (RMS в дБ) + плотность атак
    rms_db = float(librosa.amplitude_to_db(librosa.feature.rms(y=y)).mean())
    onset_rate = float(len(librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr, hop_length=hop)) / duration)
    energy = 0.6 * _norm(rms_db, -38, -10) + 0.4 * _norm(onset_rate, 0.5, 5.0)

    # валентность (эвристика): мажор, темп, яркость спектра
    centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr).mean())
    valence = 0.45 * (1.0 if mode == "major" else 0.0) + 0.3 * _norm(bpm, 60, 150) + 0.25 * _norm(centroid, 1200, 3500)

    # тихая песня с темпом > 150 — почти всегда удвоение (Norah Jones давала 177 вместо 88)
    if bpm > 150 and energy < 0.55 and len(beats) > 8:
        bpm /= 2
        b0, b1 = beats[0::2], beats[1::2]
        frames = librosa.time_to_frames(np.array(beats), sr=sr, hop_length=hop)
        frames = np.clip(frames, 0, len(onset_env) - 1)
        strength0, strength1 = onset_env[frames[0::2]].mean(), onset_env[frames[1::2]].mean()
        beats = b0 if strength0 >= strength1 else b1  # оставляем более сильную долю

    return {
        "bpm": round(bpm, 1),
        "mode": mode,
        "key": f"{NOTES[tonic]} {'major' if mode == 'major' else 'minor'}",
        "energy": round(energy, 2),
        "valence": round(valence, 2),
        "beats": beats,
        "sections": sections,
        "duration": round(duration, 2),
    }


# ---------- вход ----------

def _fallback(song_url: str | None, extra: dict | None = None) -> dict:
    return {
        "title": None, "artist": None, "source_url": song_url, "preview_url": None,
        "bpm": 0, "beats": [], "sections": [], "source": "fallback", **(extra or {}),
    }


def analyze_song(song_url: str | None, file_path: str | None) -> dict:
    # файл пользователя: анализируем его, без Deezer
    if file_path:
        try:
            res = analyze_audio(file_path)
            name = Path(file_path).stem
            return {"title": None if name == "song" else name, "artist": None, "source_url": song_url,
                    "preview_url": None, "audio_path": file_path, "genre": None, "year": None,
                    "source": "file", **res}
        except Exception as e:
            log.warning("анализ файла не удался: %s", e)
            return _fallback(song_url)

    if not song_url:
        return _fallback(None)

    meta: dict = {}
    t0 = time.monotonic()
    tm: dict[str, float] = {}
    try:
        with httpx.Client(timeout=TIMEOUT, headers=UA, follow_redirects=True) as c:
            track_id, query = _identify(c, song_url.strip())
            track = _deezer_track(c, track_id, query)
            if not track or not track.get("preview"):
                log.warning("Deezer не нашёл трек: %r", query or track_id)
                return _fallback(song_url, {"title": query or None})
            tm["search"] = round(time.monotonic() - t0, 1)
            genre, year = _album_meta(c, track)
            artist_name = (track.get("artist") or {}).get("name") or ""
            mb_year = _first_year(c, artist_name, track.get("title_short") or track.get("title") or "")
            if mb_year and (year is None or mb_year < year):
                year = mb_year
            meta = {
                "title": track.get("title_short") or track.get("title"),
                "artist": (track.get("artist") or {}).get("name"),
                "source_url": song_url,
                "preview_url": track["preview"],
                "genre": genre,
                "year": year,
                "deezer_id": track.get("id"),
                "deezer_bpm": track.get("bpm") or None,
            }
            tm["meta"] = round(time.monotonic() - t0 - tm["search"], 1)
            t1 = time.monotonic()
            audio = c.get(track["preview"])
            audio.raise_for_status()
            tm["download"] = round(time.monotonic() - t1, 1)
        tmp = Path(tempfile.mkdtemp(prefix="song_")) / "preview.mp3"
        tmp.write_bytes(audio.content)
        t2 = time.monotonic()
        res = analyze_audio(str(tmp), hint_bpm=float(track.get("bpm") or 0) or None)
        tm["librosa"] = round(time.monotonic() - t2, 1)
        return {**meta, "audio_path": str(tmp), "source": "deezer", "timings": tm, **res}
    except Exception as e:
        log.warning("analyze_song: %s: %s", type(e).__name__, e)
        return _fallback(song_url, meta)


if __name__ == "__main__":  # python -m app.analyzers.music "ссылка или Артист - Песня"
    import json
    import sys

    out = analyze_song(sys.argv[1] if len(sys.argv) > 1 else None, None)
    out["beats"] = out.get("beats", [])[:8]
    print(json.dumps(out, ensure_ascii=False, indent=1))
