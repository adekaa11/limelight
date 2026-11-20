"""Настройки из переменных окружения (.env)."""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import timedelta, timezone
from pathlib import Path

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv не обязателен в проде
    pass

# Астана: UTC+5 круглый год
ASTANA_TZ = timezone(timedelta(hours=5))

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _list(name: str, default: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, default).split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    # Supabase. Если не задан, работает локальное хранилище (data/)
    supabase_url: str = os.getenv("SUPABASE_URL", "").rstrip("/")
    supabase_key: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    supabase_bucket: str = os.getenv("SUPABASE_BUCKET", "days")
    supabase_table: str = os.getenv("SUPABASE_TABLE", "days")

    # LLM: gemini | groq | none
    llm_provider: str = os.getenv("LLM_PROVIDER", "gemini").lower()
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-3.8-flash,gemini-flash-latest,gemini-flash-lite-latest")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    llm_timeout: float = float(os.getenv("LLM_TIMEOUT", "40"))

    # Локальное хранилище и публичный адрес бэка (для ссылок на файлы)
    local_data_dir: Path = Path(os.getenv("LOCAL_DATA_DIR", str(BACKEND_DIR / "data")))
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "http://localhost:8000").rstrip("/")

    cors_origins: list[str] = field(
        default_factory=lambda: _list("CORS_ORIGINS", "http://localhost:5173,https://*.vercel.app")
    )
    max_photos: int = int(os.getenv("MAX_PHOTOS", "8"))
    max_upload_mb: int = int(os.getenv("MAX_UPLOAD_MB", "20"))

    @property
    def use_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_key)


settings = Settings()
