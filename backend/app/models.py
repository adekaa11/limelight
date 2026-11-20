"""Схема Day по контракту API (docs/api-contract.md). Менять только по договорённости команды."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Technique = Literal["monet", "kandinsky", "film", "collage", "japanese"]


class SongAnalysis(BaseModel):
    bpm: float = 100.0
    mode: Literal["major", "minor"] = "major"
    energy: float = Field(0.5, ge=0, le=1)
    valence: float = Field(0.5, ge=0, le=1)
    genre: Optional[str] = None
    year: Optional[int] = None
    beats: list[float] = []
    sections: list[float] = []


class Song(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    source_url: Optional[str] = None
    preview_url: Optional[str] = None
    analysis: SongAnalysis = SongAnalysis()


class TextAnalysis(BaseModel):
    mood: str = "спокойствие"
    energy: float = Field(0.5, ge=0, le=1)
    valence: float = Field(0.5, ge=0, le=1)
    season: Optional[str] = None
    time_of_day: Optional[str] = None
    places: list[str] = []
    people: list[str] = []
    details: list[str] = []


class PhotoAnalysis(BaseModel):
    dominant_colors: list[str] = []
    brightness: float = Field(0.5, ge=0, le=1)
    warmth: float = Field(0.5, ge=0, le=1)


class Style(BaseModel):
    technique: Technique
    palette: list[str]
    grain: float = Field(ge=0, le=1)
    beat_step: Literal[1, 2, 4]
    motion: float = Field(ge=0, le=1)
    density: float = Field(ge=0, le=1)
    font_weight: int = Field(ge=300, le=800)
    caption: str = ""


class Voice(BaseModel):
    name: str
    rate: str
    pitch: str
    url: Optional[str] = None


class Day(BaseModel):
    id: str
    date: str
    title: str
    text: str
    photos: list[str] = []
    song: Optional[Song] = None
    text_analysis: TextAnalysis
    photo_analysis: list[PhotoAnalysis] = []
    style: Style
    voice: Voice
    explanation: list[str] = []
    # Дополнительно к контракту (необязательные поля, фронт может игнорировать)
    folder: Optional[str] = None
    video_url: Optional[str] = None
    created_at: Optional[str] = None
    meta: Optional[dict] = None  # источники: llm = gemini|groq|fallback, song_source = deezer|file|fallback


class StylePreviewIn(BaseModel):
    """Вход для /api/style: прогнать style_engine без загрузки файлов (для /lab и тестов)."""

    text_analysis: TextAnalysis
    photo_analysis: list[PhotoAnalysis] = []
    song_analysis: Optional[SongAnalysis] = None
    caption: str = ""
