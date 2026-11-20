"""Оркестрация POST /api/days: вход -> анализ (параллельно) -> style_engine -> озвучка -> папка дня."""
from __future__ import annotations

import asyncio
import json
import logging
import tempfile
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
from .text_analysis import analyze_text

log = logging.getLogger(__name__)

SONG_KEYS = ("bpm", "mode", "energy", "valence", "genre", "year", "beats", "sections")


@dataclass
class Upload:
    filename: str
    data: bytes
    content_type: str | None = None


def _ext(name: str, default: str) -> str:
    suf = Path(name or "").suffix.lower()
    return suf if suf and len(suf) <= 5 else default


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

    with tempfile.TemporaryDirectory(prefix="day_") as tmp:
        tmpd = Path(tmp)
        photo_paths = []
        for i, ph in enumerate(photos, 1):
            p = tmpd / f"photo_{i:02d}{_ext(ph.filename, '.jpg')}"
            p.write_bytes(ph.data)
            photo_paths.append(str(p))
        song_path = None
        if song_file:
            song_path = str(tmpd / f"song{_ext(song_file.filename, '.mp3')}")
            Path(song_path).write_bytes(song_file.data)

        # 1. три анализа параллельно; каждый с fallback, чтобы день сохранился в любом случае
        (ta, title, caption, llm_src), song_raw, photo_an = await asyncio.gather(
            analyze_text(text),
            _safe(run_in_threadpool(analyze_song, song_url, song_path), {"source": "fallback"}, "analyze_song"),
            _safe(run_in_threadpool(analyze_photos, photo_paths), [], "analyze_photos"),
        )
        song_raw = song_raw or {"source": "fallback"}

        # 2. визуальная система
        style, voice, explanation = build_style(ta, photo_an, song_raw, caption=caption)

        folder = await _unique_folder(storage, date, title, day_id)

        # 3. озвучка
        voice_path = str(tmpd / "voice.mp3")
        voice_out = await _safe(run_in_threadpool(synthesize_voice, text, voice, voice_path), "", "synthesize_voice")
        voice_url = None
        if voice_out and Path(voice_out).is_file():
            voice_url = await storage.put_file(f"{folder}/voice.mp3", Path(voice_out).read_bytes(), "audio/mpeg")

        # 4. файлы папки дня
        photo_urls = []
        for i, (ph, path) in enumerate(zip(photos, photo_paths), 1):
            name = f"{folder}/photos/{i:02d}{Path(path).suffix}"
            photo_urls.append(await storage.put_file(name, ph.data, ph.content_type))

        preview_url = song_raw.get("preview_url")
        audio_path = song_raw.get("audio_path")
        if audio_path and Path(audio_path).is_file():
            # превью/файл кладём к себе: стабильная ссылка + CORS для WebAudio
            preview_url = await storage.put_file(
                f"{folder}/song{_ext(audio_path, '.mp3')}", Path(audio_path).read_bytes()
            )

        has_song = bool(song_url or song_file)
        song = None
        if has_song:
            song = {
                "title": song_raw.get("title") or (song_file.filename if song_file else None),
                "artist": song_raw.get("artist"),
                "source_url": song_raw.get("source_url") or song_url,
                "preview_url": preview_url,
                "analysis": {k: song_raw[k] for k in SONG_KEYS if song_raw.get(k) is not None},
            }

    await storage.put_file(f"{folder}/text.txt", text.encode("utf-8"), "text/plain; charset=utf-8")
    if song:
        await storage.put_file(
            f"{folder}/song.json", json.dumps(song, ensure_ascii=False, indent=1).encode(), "application/json"
        )

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
        "meta": {"llm": llm_src, "song_source": song_raw.get("source", "fallback")},
        "created_at": datetime.now(ASTANA_TZ).isoformat(),
    }
    # «рецепт» дня тоже кладём в папку: что вошло, какие правила сработали
    await storage.put_file(
        f"{folder}/day.json", json.dumps(row, ensure_ascii=False, indent=1).encode(), "application/json"
    )
    return await storage.insert_day(row)
