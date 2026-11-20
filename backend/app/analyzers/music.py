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
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx

log = logging.getLogger(__name__)

DEEZER = "https://api.deezer.com"
UA = {"User-Agent": "Mozilla/5.0 (proyavka diary)"}
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


def analyze_audio(path: str) -> dict:
    """librosa: темп, биты, части песни, лад, энергия, валентность. ~1-2 сек на 30-сек превью."""
    import librosa  # тяжёлый импорт только когда нужен
    import numpy as np

    y, sr = librosa.load(path, sr=SR, mono=True, duration=MAX_SEC)
    if y.size < sr * 3:
        raise ValueError("слишком короткий звук")
    duration = float(len(y) / sr)

    # темп и биты
    onset_env = librosa.onset.onset_strength(y=y, sr=sr)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr)
    bpm = float(np.atleast_1d(tempo)[0])
    beats = librosa.frames_to_time(beat_frames, sr=sr).round(3).tolist()

    # лад: CQT-хромограмма -> медиана по битам (гасит ударные дешевле, чем HPSS) -> 24 профиля Крумханзля
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr)
    if len(beat_frames) > 4:
        prof = np.median(librosa.util.sync(chroma, beat_frames, aggregate=np.median), axis=1)
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
    onset_rate = float(len(librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)) / duration)
    energy = 0.6 * _norm(rms_db, -38, -10) + 0.4 * _norm(onset_rate, 0.5, 5.0)

    # валентность (эвристика): мажор, темп, яркость спектра
    centroid = float(librosa.feature.spectral_centroid(y=y, sr=sr).mean())
    valence = 0.45 * (1.0 if mode == "major" else 0.0) + 0.3 * _norm(bpm, 60, 150) + 0.25 * _norm(centroid, 1200, 3500)

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
    try:
        with httpx.Client(timeout=TIMEOUT, headers=UA, follow_redirects=True) as c:
            track_id, query = _identify(c, song_url.strip())
            track = _deezer_track(c, track_id, query)
            if not track or not track.get("preview"):
                log.warning("Deezer не нашёл трек: %r", query or track_id)
                return _fallback(song_url, {"title": query or None})
            genre, year = _album_meta(c, track)
            meta = {
                "title": track.get("title_short") or track.get("title"),
                "artist": (track.get("artist") or {}).get("name"),
                "source_url": song_url,
                "preview_url": track["preview"],
                "genre": genre,
                "year": year,
                "deezer_id": track.get("id"),
            }
            audio = c.get(track["preview"])
            audio.raise_for_status()
        tmp = Path(tempfile.mkdtemp(prefix="song_")) / "preview.mp3"
        tmp.write_bytes(audio.content)
        res = analyze_audio(str(tmp))
        return {**meta, "audio_path": str(tmp), "source": "deezer", **res}
    except Exception as e:
        log.warning("analyze_song: %s: %s", type(e).__name__, e)
        return _fallback(song_url, meta)


if __name__ == "__main__":  # python -m app.analyzers.music "ссылка или Артист - Песня"
    import json
    import sys

    out = analyze_song(sys.argv[1] if len(sys.argv) > 1 else None, None)
    out["beats"] = out.get("beats", [])[:8]
    print(json.dumps(out, ensure_ascii=False, indent=1))
