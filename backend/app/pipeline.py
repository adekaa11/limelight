"""Оркестрация POST /api/days: вход -> анализ (параллельно) -> style_engine -> озвучка -> папка дня."""
from __future__ import annotations

import asyncio
import json
import logging
import tempfile
import time
import uuid
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from fastapi.concurrency import run_in_threadpool

from .analyzers.music import analyze_song
from .analyzers.photo import analyze_photos
from .analyzers.voice import synthesize_voice
from .config import ASTANA_TZ
from .slug import folder_name
from .storage import Storage
from .style_engine import build_style
from . import text_analysis
from .text_analysis import analyze_text

log = logging.getLogger(__name__)

FALLBACK_VOICE = "ru-RU-SvetlanaNeural"
SONG_KEYS = ("bpm", "mode", "energy", "valence", "genre", "year", "beats", "sections")


@dataclass
class Upload:
    filename: str
    data: bytes
    content_type: str | None = None


def _ext(name: str, default: str) -> str:
    suf = Path(name or "").suffix.lower()
    return suf if suf and len(suf) <= 5 else default


MAX_SIDE = 1600


def normalize_photo(data: bytes) -> bytes:
    """Любое фото (в т.ч. HEIC с iPhone) -> JPEG: поворот по EXIF, длинная сторона до 1600 px.
    Плееру на телефоне не нужны 12-мегапиксельные кадры, а повёрнутые боком фото ломают композицию."""
    import io

    from PIL import Image, ImageOps

    try:
        from pillow_heif import register_heif_opener

        register_heif_opener()
    except ImportError:
        pass
    img = ImageOps.exif_transpose(Image.open(io.BytesIO(data)))
    if img.mode not in ("RGB", "L"):
        img = img.convert("RGB")
    img.thumbnail((MAX_SIDE, MAX_SIDE))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    return out.getvalue()


async def _safe(coro, default, what: str):
    try:
        return await coro
    except Exception as e:
        log.exception("%s упал: %s", what, e)
        return default


async def _unique_folder(storage: Storage, date: str, title: str, day_id: str) -> str:
    folder = folder_name(date, title)
    if await _safe(storage.list_files(folder), [], "list_files"):
        folder = f"{folder}-{day_id[:4]}"
    return folder


class _Timer:
    """Замер этапов: попадает в meta.timings, видно, где теряется время на слабом CPU."""

    def __init__(self) -> None:
        self.t0 = time.monotonic()
        self.marks: dict[str, float] = {}

    async def run(self, name: str, coro):
        t = time.monotonic()
        try:
            return await coro
        finally:
            self.marks[name] = round(time.monotonic() - t, 1)

    def total(self) -> dict[str, float]:
        return {**self.marks, "total": round(time.monotonic() - self.t0, 1)}


async def _prepare_photos(photos: list[Upload], tmpd: Path) -> tuple[list[str], list[dict]]:
    """Нормализация (HEIC, EXIF, 1600 px) и анализ цвета."""
    paths = []
    for i, ph in enumerate(photos, 1):
        try:
            ph.data = await run_in_threadpool(normalize_photo, ph.data)
            ph.content_type, ext = "image/jpeg", ".jpg"
        except Exception as e:  # не картинка или битый файл: сохраняем как есть
            log.warning("фото %s не нормализовано: %s", ph.filename, e)
            ext = _ext(ph.filename, ".jpg")
        p = tmpd / f"photo_{i:02d}{ext}"
        p.write_bytes(ph.data)
        paths.append(str(p))
    analysis = await _safe(run_in_threadpool(analyze_photos, paths), [], "analyze_photos") if paths else []
    return paths, analysis


async def _voice(text: str, voice: dict, path: str, explanation: list[str]) -> tuple[dict, str]:
    out = ""
    for attempt in range(3):  # сервис озвучки иногда не отдаёт звук с первого раза
        out = await _safe(run_in_threadpool(synthesize_voice, text, voice, path), "", "synthesize_voice")
        if out:
            break
        await asyncio.sleep(1.5 * (attempt + 1))
    if not out and (voice["name"] != FALLBACK_VOICE or voice["pitch"] != "+0Hz"):
        # голос или высота не приняты сервисом: тот же темп, базовый голос, без сдвига высоты
        voice = {**voice, "name": FALLBACK_VOICE, "pitch": "+0Hz"}
        explanation.append(f"голос не принят сервисом -> {FALLBACK_VOICE}, темп {voice['rate']}")
        out = await _safe(run_in_threadpool(synthesize_voice, text, voice, path), "", "synthesize_voice")
    return voice, out


async def create_day(
    storage: Storage,
    text: str,
    photos: list[Upload],
    song_url: str | None,
    song_file: Upload | None,
    date: str | None,
) -> dict:
    day_id = str(uuid.uuid4())
    date = date or datetime.now(ASTANA_TZ).date().isoformat()
    tm = _Timer()

    with tempfile.TemporaryDirectory(prefix="day_") as tmp:
        tmpd = Path(tmp)
        song_path = None
        if song_file:
            song_path = str(tmpd / f"song{_ext(song_file.filename, '.mp3')}")
            Path(song_path).write_bytes(song_file.data)

        # 1. текст, песня и фото параллельно; у каждого fallback, день сохранится в любом случае
        (ta, title, caption, llm_src), song_raw, (photo_paths, photo_an) = await asyncio.gather(
            tm.run("text", analyze_text(text)),
            tm.run("song", _safe(run_in_threadpool(analyze_song, song_url, song_path), {"source": "fallback"}, "analyze_song")),
            tm.run("photos", _prepare_photos(photos, tmpd)),
        )
        song_raw = song_raw or {"source": "fallback"}

        # 2. визуальная система (мгновенно, без сети)
        style, voice, explanation = build_style(ta, photo_an, song_raw, caption=caption)
        folder = await _unique_folder(storage, date, title, day_id)

        # 3. озвучка и загрузка файлов параллельно
        async def upload_photos() -> list[str]:
            return list(await asyncio.gather(*(
                storage.put_file(f"{folder}/photos/{i:02d}{Path(path).suffix}", ph.data, ph.content_type)
                for i, (ph, path) in enumerate(zip(photos, photo_paths), 1)
            )))

        async def upload_song() -> str | None:
            audio_path = song_raw.get("audio_path")
            if audio_path and Path(audio_path).is_file():
                # превью/файл кладём к себе: стабильная ссылка + CORS для WebAudio
                return await storage.put_file(f"{folder}/song{_ext(audio_path, '.mp3')}", Path(audio_path).read_bytes())
            return song_raw.get("preview_url")

        async def voice_and_upload() -> tuple[dict, str | None]:
            v, out = await _voice(text, voice, str(tmpd / "voice.mp3"), explanation)
            url = None
            if out and Path(out).is_file():
                url = await storage.put_file(f"{folder}/voice.mp3", Path(out).read_bytes(), "audio/mpeg")
            return v, url

        photo_urls, preview_url, (voice, voice_url), _ = await asyncio.gather(
            tm.run("upload_photos", upload_photos()),
            tm.run("upload_song", upload_song()),
            tm.run("voice", voice_and_upload()),
            storage.put_file(f"{folder}/text.txt", text.encode("utf-8"), "text/plain; charset=utf-8"),
        )

        song = None
        if song_url or song_file:
            song = {
                "title": song_raw.get("title") or (song_file.filename if song_file else None),
                "artist": song_raw.get("artist"),
                "source_url": song_raw.get("source_url") or song_url,
                "preview_url": preview_url,
                "analysis": {k: song_raw[k] for k in SONG_KEYS if song_raw.get(k) is not None},
            }

    row = {
        "id": day_id,
        "date": date,
        "title": title,
        "text": text,
        "photos": photo_urls,
        "song": song,
        "text_analysis": ta,
        "photo_analysis": photo_an,
        "style": style,
        "voice": {**voice, "url": voice_url},
        "explanation": explanation,
        "folder": folder,
        "video_url": None,
        "meta": {"llm": llm_src, "song_source": song_raw.get("source", "fallback"),
                 **({"llm_error": text_analysis.last_error} if llm_src == "fallback" else {}),
                 "timings": {**tm.total(), **{f"song_{k}": v for k, v in (song_raw.get("timings") or {}).items()}}},
        "created_at": datetime.now(ASTANA_TZ).isoformat(),
    }
    # «рецепт» дня и метаданные песни тоже кладём в папку
    extra = [storage.put_file(f"{folder}/day.json", json.dumps(row, ensure_ascii=False, indent=1).encode(), "application/json")]
    if song:
        extra.append(storage.put_file(f"{folder}/song.json", json.dumps(song, ensure_ascii=False, indent=1).encode(), "application/json"))
    await asyncio.gather(*extra)
    return await storage.insert_day(row)
