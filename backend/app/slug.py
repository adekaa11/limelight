"""Имя папки дня: {date}_{slug-title}, только латиница (ключи Storage должны быть ASCII)."""
import re

_TR = dict(zip(
    "абвгдеёжзийклмнопрстуфхцчшщъыьэюяәғқңөұүһі",
    ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t",
     "u", "f", "kh", "ts", "ch", "sh", "shch", "", "y", "", "e", "yu", "ya",
     "a", "g", "q", "n", "o", "u", "u", "h", "i"],
))


def slugify(text: str, max_len: int = 48) -> str:
    s = "".join(_TR.get(ch, ch) for ch in text.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:max_len].rstrip("-") or "den"


def folder_name(date: str, title: str) -> str:
    """Путь внутри bucket `days`: 2026-11-19_osenniy-park-i-kakao"""
    return f"{date}_{slugify(title)}"
