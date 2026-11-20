"""ЗАГЛУШКА. Реальную версию (Deezer + librosa) пишет Айкайнар.

analyze_song(song_url, file_path) -> dict
Обязательные ключи: title, artist, source_url, preview_url,
  bpm, mode, energy, valence, genre, year, beats[сек], sections[сек], source.
Необязательный ключ audio_path: локальный путь к mp3 (превью 30 сек или файл пользователя).
  pipeline загрузит его в папку дня как song.mp3 и подставит preview_url на наш Storage.
  Это важно: превью Deezer протухают через несколько часов и отдаются без CORS,
  а без CORS WebAudio AnalyserNode на фронте будет показывать тишину.
source: "deezer" | "file" | "fallback".
"""
from __future__ import annotations


def _grid(bpm: float, duration: float = 30.0, offset: float = 0.25) -> list[float]:
    step = 60.0 / bpm
    return [round(offset + i * step, 3) for i in range(int((duration - offset) / step) + 1)]


def analyze_song(song_url: str | None, file_path: str | None) -> dict:
    if not song_url and not file_path:
        return {"source": "fallback", "bpm": 0, "beats": [], "sections": []}
    bpm = 96.0
    return {
        "title": None,
        "artist": None,
        "source_url": song_url,
        "preview_url": None,
        "audio_path": file_path,  # файл пользователя играем как есть
        "bpm": bpm,
        "mode": "major",
        "energy": 0.5,
        "valence": 0.5,
        "genre": None,
        "year": None,
        "beats": _grid(bpm),
        "sections": [0.0, 10.0, 20.0],
        "source": "fallback",
    }
