"""Генерирует моки для фронта (frontend/src/mocks/days.json) прямо из style_engine.

Так моки всегда совпадают с реальными правилами. Запуск из backend/:
    python -m scripts.make_mocks
"""
from __future__ import annotations

import json
import uuid
from datetime import date, timedelta
from pathlib import Path

from app.slug import folder_name
from app.style_engine import build_style

TODAY = date(2026, 11, 20)
OUT = Path(__file__).resolve().parents[2] / "frontend" / "src" / "mocks" / "days.json"


def beats(bpm: float, dur: float = 30.0, offset: float = 0.3) -> list[float]:
    step = 60 / bpm
    return [round(offset + i * step, 3) for i in range(int((dur - offset) / step) + 1)]


DAYS = [
    dict(
        days_ago=1, title="Осенний парк и какао", caption="листья шуршали, а какао грело руки",
        text="Гуляли с мамой в парке, листья жёлтые и шуршат. Купили какао, пахло корицей. Солнце низкое, всё золотое.",
        ta={"mood": "уют", "energy": 0.3, "valence": 0.78, "season": "осень", "time_of_day": "день",
            "places": ["парк"], "people": ["мама"], "details": ["шуршание листьев", "запах корицы", "низкое золотое солнце"]},
        pa=[{"dominant_colors": ["#c8792b", "#e3b04b", "#6b4a2b", "#9fb0a3", "#f2e6d0"], "brightness": 0.62, "warmth": 0.78},
            {"dominant_colors": ["#b5562a", "#d9a441", "#3e3a2f", "#c9c2b0", "#87957a"], "brightness": 0.55, "warmth": 0.72}],
        song={"title": "Autumn Leaves", "artist": "[mock]", "bpm": 72, "mode": "major", "energy": 0.3,
              "valence": 0.7, "genre": "jazz", "year": 2016},
    ),
    dict(
        days_ago=9, title="Релиз в два часа ночи", caption="кофе остыл, а мы ещё здесь",
        text="Сидим в офисе до двух ночи, релиз завтра. Гудит кондиционер, монитор режет глаза, третий кофе.",
        ta={"mood": "напряжение", "energy": 0.78, "valence": 0.35, "season": "осень", "time_of_day": "ночь",
            "places": ["офис"], "people": [], "details": ["гул кондиционера", "свет монитора", "третий кофе"]},
        pa=[{"dominant_colors": ["#1b2433", "#3a6ea5", "#0d0f14", "#9bb7d4", "#e0e6ee"], "brightness": 0.25, "warmth": 0.2}],
        song={"title": "Night Drive", "artist": "[mock]", "bpm": 128, "mode": "minor", "energy": 0.85,
              "valence": 0.3, "genre": "electronic", "year": 2024},
    ),
    dict(
        days_ago=40, title="Дождь за окном и чай", caption="капли считали минуты за меня",
        text="Утром шёл дождь. Сидела у окна одна, слушала стук капель по стеклу. Пахло мокрым асфальтом. Тихо.",
        ta={"mood": "тишина", "energy": 0.18, "valence": 0.42, "season": "осень", "time_of_day": "утро",
            "places": ["окно"], "people": [], "details": ["стук капель по стеклу", "запах мокрого асфальта"]},
        pa=[{"dominant_colors": ["#8a9399", "#c9ccc8", "#3f474d", "#a4ad9f", "#e6e3dc"], "brightness": 0.6, "warmth": 0.42}],
        song={"title": "Rain Study", "artist": "[mock]", "bpm": 64, "mode": "minor", "energy": 0.18,
              "valence": 0.3, "genre": "ambient", "year": 2019},
    ),
    dict(
        days_ago=120, title="Дача, смех и шашлык", caption="все говорили одновременно, и это было лучше всего",
        text="Собрались всей компанией на даче. Аня, Тимур, Дана, Ерлан. Запах шашлыка, смех до утра, свечи на торте.",
        ta={"mood": "радость", "energy": 0.86, "valence": 0.9, "season": "лето", "time_of_day": "вечер",
            "places": ["дача"], "people": ["Аня", "Тимур", "Дана", "Ерлан"], "details": ["запах шашлыка", "смех", "свечи на торте"]},
        pa=[{"dominant_colors": ["#f2c14e", "#f78154", "#4d9078", "#5fad56", "#b4436c"], "brightness": 0.7, "warmth": 0.75},
            {"dominant_colors": ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#073b4c"], "brightness": 0.65, "warmth": 0.6},
            {"dominant_colors": ["#e76f51", "#f4a261", "#2a9d8f", "#264653", "#e9c46a"], "brightness": 0.6, "warmth": 0.7}],
        song={"title": "Summer Party", "artist": "[mock]", "bpm": 118, "mode": "major", "energy": 0.82,
              "valence": 0.92, "genre": "pop", "year": 2023},
    ),
    dict(
        days_ago=380, title="Бабушкина кухня на старом видео", caption="её смех звучит так же",
        text="Нашли старое видео, где бабушка печёт пирожки и поёт. Свет из окна жёлтый, пахнет тестом. Вспомнили детство.",
        ta={"mood": "ностальгия", "energy": 0.35, "valence": 0.55, "season": "зима", "time_of_day": "вечер",
            "places": ["кухня"], "people": ["бабушка"], "details": ["жёлтый свет из окна", "запах теста", "бабушкина песня"]},
        pa=[{"dominant_colors": ["#a67c52", "#d8b48a", "#5a4632", "#e8d9c0", "#7d6a55"], "brightness": 0.5, "warmth": 0.7}],
        song={"title": "Old Song", "artist": "[mock]", "bpm": 92, "mode": "minor", "energy": 0.35,
              "valence": 0.45, "genre": "estrada", "year": 1978},
    ),
]


def main() -> None:
    out = []
    for i, d in enumerate(DAYS):
        dt = (TODAY - timedelta(days=d["days_ago"])).isoformat()
        song_an = {**d["song"], "beats": beats(d["song"]["bpm"]), "sections": [0.0, 9.6, 19.2], "source": "mock"}
        style, voice, expl = build_style(d["ta"], d["pa"], song_an, caption=d["caption"], today=TODAY)
        day_id = str(uuid.UUID(int=i + 1))
        out.append({
            "id": day_id,
            "date": dt,
            "title": d["title"],
            "text": d["text"],
            "photos": [f"https://picsum.photos/seed/limelight{i}{k}/720/960" for k in range(len(d["pa"]))],
            "song": {
                "title": d["song"]["title"], "artist": d["song"]["artist"], "source_url": None, "preview_url": None,
                "analysis": {k: song_an[k] for k in ("bpm", "mode", "energy", "valence", "genre", "year", "beats", "sections")},
            },
            "text_analysis": d["ta"],
            "photo_analysis": d["pa"],
            "style": style,
            "voice": {**voice, "url": None},
            "explanation": expl,
            "folder": folder_name(dt, d["title"]),
            "video_url": None,
            "meta": {"llm": "mock", "song_source": "mock"},
            "created_at": f"{dt}T21:00:00+05:00",
        })
        print(f"{dt}  {style['technique']:<10} {d['title']}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
    print("->", OUT)


if __name__ == "__main__":
    main()
