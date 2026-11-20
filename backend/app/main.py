"""FastAPI: API цифрового дневника. Контракт: docs/api-contract.md."""
from __future__ import annotations

import io
import logging
import re
import zipfile
from datetime import date as date_cls
from typing import Annotated, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .config import settings
from .models import Day, StylePreviewIn
from .pipeline import Upload, create_day
from .storage import LocalStorage, get_storage
from .style_engine import build_style

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

app = FastAPI(title="Проявка API", version="0.1.0", description="Цифровой дневник: текст + фото + музыка -> воспоминание")

_exact = [o for o in settings.cors_origins if "*" not in o]
_wild = [re.escape(o).replace(r"\*", "[a-z0-9-]+") for o in settings.cors_origins if "*" in o]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_exact,
    allow_origin_regex="^(" + "|".join(_wild) + ")$" if _wild else None,
    allow_methods=["*"],
    allow_headers=["*"],
)

storage = get_storage()


@app.on_event("startup")
def _warm_up_librosa() -> None:
    """Прогрев в фоне: импорт librosa и JIT numba занимают десятки секунд на слабом CPU Render.
    Делаем это сразу после старта, а не на первом пользовательском дне."""
    import threading

    def run() -> None:
        try:
            import numpy as np

            from .analyzers.music import SR, analyze_audio

            import soundfile as sf
            import tempfile

            with tempfile.NamedTemporaryFile(suffix=".wav") as f:
                t = np.arange(SR * 4) / SR
                sf.write(f.name, 0.3 * np.sin(2 * np.pi * 220 * t), SR)
                analyze_audio(f.name)
            logging.getLogger(__name__).info("librosa прогрета")
        except Exception as e:  # прогрев не обязателен
            logging.getLogger(__name__).warning("прогрев librosa: %s", e)

    threading.Thread(target=run, daemon=True).start()
if isinstance(storage, LocalStorage):
    app.mount("/files", StaticFiles(directory=storage.files), name="files")

MB = 1024 * 1024
AUDIO_TYPES = ("audio/", "video/webm", "application/octet-stream")


PHOTO_EXT = (".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif")


async def _read(f: UploadFile, kinds: tuple[str, ...], what: str) -> Upload:
    ctype = f.content_type or "application/octet-stream"
    # HEIC часто приходит как application/octet-stream: пропускаем по расширению
    by_ext = what == "photo" and (f.filename or "").lower().endswith(PHOTO_EXT)
    if not ctype.startswith(kinds) and not by_ext:
        raise HTTPException(415, f"{what}: неподдерживаемый тип {ctype}")
    data = await f.read()
    if len(data) > settings.max_upload_mb * MB:
        raise HTTPException(413, f"{what}: файл больше {settings.max_upload_mb} МБ")
    return Upload(f.filename or what, data, ctype)


@app.get("/api/health")
async def health():
    return {"ok": True, "storage": "supabase" if settings.use_supabase else "local", "llm": settings.llm_provider}


@app.get("/api/health/deps")
async def health_deps(llm: str = "", voice_name: str = "ru-RU-SvetlanaNeural", rate: str = "+0%", pitch: str = "+0Hz", text: str = "Проверка голоса."):
    """Проверка внешних зависимостей: LLM и озвучка. Ключи в ответ не попадают."""
    import tempfile
    from pathlib import Path

    from fastapi.concurrency import run_in_threadpool

    from .analyzers.voice import synthesize_voice
    from .text_analysis import probe_llm

    llm_res = await probe_llm(llm or None)
    with tempfile.TemporaryDirectory() as tmp:
        out = str(Path(tmp) / "v.mp3")
        try:
            res = await run_in_threadpool(
                synthesize_voice, text, {"name": voice_name, "rate": rate, "pitch": pitch, "_raise": True}, out
            )
            voice = {"ok": bool(res) and Path(out).is_file(), "bytes": Path(out).stat().st_size if Path(out).is_file() else 0}
        except Exception as e:
            voice = {"ok": False, "error": f"{type(e).__name__}: {e}"[:400]}
    return {"llm": llm_res, "voice": voice}


@app.get("/api/health/song")
async def health_song(url: str):
    """Проверка анализа песни по ссылке или «Артист - Песня» (без сохранения дня)."""
    from fastapi.concurrency import run_in_threadpool

    from .analyzers.music import analyze_song

    res = await run_in_threadpool(analyze_song, url, None)
    res.pop("audio_path", None)
    res["beats_count"] = len(res.get("beats") or [])
    res["beats"] = (res.get("beats") or [])[:8]
    return res


@app.post("/api/days", response_model=Day)
async def post_day(
    text: Annotated[str, Form()],
    photos: Annotated[list[UploadFile], File()] = [],
    song_url: Annotated[Optional[str], Form()] = None,
    song_file: Annotated[Optional[UploadFile], File()] = None,
    date: Annotated[Optional[str], Form()] = None,
):
    text = text.strip()
    if len(text) < 10:
        raise HTTPException(422, "Напишите о дне хотя бы пару предложений")
    if date:
        try:
            date_cls.fromisoformat(date)
        except ValueError:
            raise HTTPException(422, "date должна быть в формате YYYY-MM-DD")
    photos = [p for p in photos if p.filename]
    if len(photos) > settings.max_photos:
        raise HTTPException(422, f"Не больше {settings.max_photos} фото")
    ups = [await _read(p, ("image/",), "photo") for p in photos]
    song_up = await _read(song_file, AUDIO_TYPES, "song_file") if song_file and song_file.filename else None
    return await create_day(storage, text, ups, (song_url or "").strip() or None, song_up, date)


@app.get("/api/days", response_model=list[Day])
async def list_days():
    return await storage.list_days()


async def _day_or_404(day_id: str) -> dict:
    row = await storage.get_day(day_id)
    if not row:
        raise HTTPException(404, "День не найден")
    return row


@app.get("/api/days/{day_id}", response_model=Day)
async def get_day(day_id: str):
    return await _day_or_404(day_id)


@app.get("/api/days/{day_id}/zip")
async def day_zip(day_id: str):
    row = await _day_or_404(day_id)
    folder = row["folder"]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for path in await storage.list_files(folder):
            data = await storage.get_file(path)
            if data is not None:
                z.writestr(f"{folder}/{path[len(folder) + 1:]}", data)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{folder}.zip"'},
    )


@app.put("/api/days/{day_id}/memory", response_model=Day)
async def put_memory(day_id: str, file: Annotated[UploadFile, File()]):
    """Фронт после экспорта MediaRecorder кладёт memory.webm в папку дня."""
    row = await _day_or_404(day_id)
    up = await _read(file, ("video/",), "memory")
    url = await storage.put_file(f"{row['folder']}/memory.webm", up.data, "video/webm")
    return await storage.update_day(day_id, {"video_url": url})


@app.post("/api/style")
async def style_preview(body: StylePreviewIn):
    """Прогон style_engine без файлов: для /lab и проверки правил."""
    style, voice, explanation = build_style(
        body.text_analysis.model_dump(),
        [p.model_dump() for p in body.photo_analysis],
        {**body.song_analysis.model_dump(), "source": "lab"} if body.song_analysis else None,
        caption=body.caption,
    )
    return {"style": style, "voice": voice, "explanation": explanation}
