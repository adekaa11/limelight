"""Анализ фото (Pillow, медианное квантование вместо k-means: быстро и без sklearn).

analyze_photos(paths) -> [{dominant_colors: [#hex x5], brightness: 0-1, warmth: 0-1}]
"""
from __future__ import annotations

from PIL import Image, ImageStat


def _one(path: str) -> dict:
    img = Image.open(path).convert("RGB")
    img.thumbnail((150, 150))
    # адаптивная палитра Pillow вместо k-means: быстро и без sklearn
    q = img.quantize(colors=5, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()[:15]
    counts = sorted(q.getcolors(), reverse=True)
    colors = []
    for _, idx in counts[:5]:
        r, g, b = pal[idx * 3 : idx * 3 + 3]
        colors.append(f"#{r:02x}{g:02x}{b:02x}")
    r, g, b = ImageStat.Stat(img).mean
    bright = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    warm = (r - b) / 255  # -1..1
    return {"dominant_colors": colors, "brightness": round(bright, 2), "warmth": round((warm + 1) / 2, 2)}


def analyze_photos(paths: list[str]) -> list[dict]:
    out = []
    for p in paths:
        try:
            out.append(_one(p))
        except Exception:
            out.append({"dominant_colors": [], "brightness": 0.5, "warmth": 0.5})
    return out
