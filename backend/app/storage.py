"""Хранилище: Supabase (Postgres через PostgREST + Storage) или локальная папка data/.

Локальный режим включается сам, если SUPABASE_URL не задан. Удобно для разработки и тестов.
"""
from __future__ import annotations

import json
import mimetypes
from pathlib import Path
from typing import Protocol

import httpx

from .config import settings


class Storage(Protocol):
    async def put_file(self, path: str, data: bytes, content_type: str | None = None) -> str: ...
    async def get_file(self, path: str) -> bytes | None: ...
    async def list_files(self, folder: str) -> list[str]: ...
    async def insert_day(self, row: dict) -> dict: ...
    async def update_day(self, day_id: str, patch: dict) -> dict | None: ...
    async def get_day(self, day_id: str) -> dict | None: ...
    async def list_days(self) -> list[dict]: ...


def _ctype(path: str, given: str | None) -> str:
    return given or mimetypes.guess_type(path)[0] or "application/octet-stream"


def _sort(rows: list[dict]) -> list[dict]:
    return sorted(rows, key=lambda r: (r.get("date") or "", r.get("created_at") or ""), reverse=True)


class LocalStorage:
    def __init__(self, root: Path, base_url: str):
        self.root = root
        self.files = root / "days"  # аналог bucket days
        self.db = root / "db"
        self.base_url = base_url
        self.files.mkdir(parents=True, exist_ok=True)
        self.db.mkdir(parents=True, exist_ok=True)

    def _safe(self, path: str) -> Path:
        p = (self.files / path).resolve()
        if not str(p).startswith(str(self.files.resolve())):
            raise ValueError("bad path")
        return p

    async def put_file(self, path: str, data: bytes, content_type: str | None = None) -> str:
        p = self._safe(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return f"{self.base_url}/files/{path}"

    async def get_file(self, path: str) -> bytes | None:
        p = self._safe(path)
        return p.read_bytes() if p.is_file() else None

    async def list_files(self, folder: str) -> list[str]:
        base = self._safe(folder)
        if not base.is_dir():
            return []
        return sorted(str(p.relative_to(self.files)) for p in base.rglob("*") if p.is_file())

    async def insert_day(self, row: dict) -> dict:
        (self.db / f"{row['id']}.json").write_text(json.dumps(row, ensure_ascii=False, indent=1), "utf-8")
        return row

    async def update_day(self, day_id: str, patch: dict) -> dict | None:
        row = await self.get_day(day_id)
        if row is None:
            return None
        row.update(patch)
        return await self.insert_day(row)

    async def get_day(self, day_id: str) -> dict | None:
        p = self.db / f"{Path(day_id).name}.json"
        return json.loads(p.read_text("utf-8")) if p.is_file() else None

    async def list_days(self) -> list[dict]:
        return _sort([json.loads(p.read_text("utf-8")) for p in self.db.glob("*.json")])


class SupabaseStorage:
    def __init__(self, url: str, key: str, bucket: str, table: str):
        self.url, self.bucket, self.table = url, bucket, table
        # Новые ключи Supabase (sb_secret_...) идут только в apikey; старый service_role (JWT) ещё и в Bearer
        self.h = {"apikey": key}
        if key.startswith("eyJ"):
            self.h["Authorization"] = f"Bearer {key}"

    def _client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=60, headers=self.h)

    def public_url(self, path: str) -> str:
        return f"{self.url}/storage/v1/object/public/{self.bucket}/{path}"

    async def put_file(self, path: str, data: bytes, content_type: str | None = None) -> str:
        async with self._client() as c:
            r = await c.post(
                f"{self.url}/storage/v1/object/{self.bucket}/{path}",
                content=data,
                headers={"Content-Type": _ctype(path, content_type), "x-upsert": "true"},
            )
            r.raise_for_status()
        return self.public_url(path)

    async def get_file(self, path: str) -> bytes | None:
        async with self._client() as c:
            r = await c.get(f"{self.url}/storage/v1/object/{self.bucket}/{path}")
            return r.content if r.status_code == 200 else None

    async def list_files(self, folder: str) -> list[str]:
        out: list[str] = []
        async with self._client() as c:
            stack = [folder.strip("/")]
            while stack:
                prefix = stack.pop()
                r = await c.post(
                    f"{self.url}/storage/v1/object/list/{self.bucket}",
                    json={"prefix": prefix, "limit": 1000, "sortBy": {"column": "name", "order": "asc"}},
                )
                r.raise_for_status()
                for item in r.json():
                    full = f"{prefix}/{item['name']}"
                    (stack.append(full) if item.get("id") is None else out.append(full))
        return sorted(out)

    async def _rest(self, method: str, query: str = "", body=None) -> list[dict]:
        async with self._client() as c:
            r = await c.request(
                method,
                f"{self.url}/rest/v1/{self.table}{query}",
                json=body,
                headers={"Prefer": "return=representation"},
            )
            r.raise_for_status()
            return r.json() if r.content else []

    async def insert_day(self, row: dict) -> dict:
        return (await self._rest("POST", "", row))[0]

    async def update_day(self, day_id: str, patch: dict) -> dict | None:
        rows = await self._rest("PATCH", f"?id=eq.{day_id}", patch)
        return rows[0] if rows else None

    async def get_day(self, day_id: str) -> dict | None:
        rows = await self._rest("GET", f"?id=eq.{day_id}&select=*")
        return rows[0] if rows else None

    async def list_days(self) -> list[dict]:
        return await self._rest("GET", "?select=*&order=date.desc,created_at.desc")


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        if settings.use_supabase:
            _storage = SupabaseStorage(
                settings.supabase_url, settings.supabase_key, settings.supabase_bucket, settings.supabase_table
            )
        else:
            _storage = LocalStorage(settings.local_data_dir, settings.public_base_url)
    return _storage
