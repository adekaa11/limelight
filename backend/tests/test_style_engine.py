"""style_engine: три характерных дня + детерминизм + отдельные правила."""
from datetime import date

import pytest

from app.style_engine import beat_step, build_style, hex_to_hls

TODAY = date(2026, 11, 20)

AUTUMN_PARK = dict(
    ta={
        "mood": "уют", "energy": 0.3, "valence": 0.75, "season": "осень", "time_of_day": "день",
        "places": ["парк"], "people": ["мама"], "details": ["запах какао", "шорох листьев"],
    },
    pa=[
        {"dominant_colors": ["#c8792b", "#e3b04b", "#6b4a2b", "#9fb0a3", "#f2e6d0"], "brightness": 0.62, "warmth": 0.78},
        {"dominant_colors": ["#b5562a", "#d9a441", "#3e3a2f", "#c9c2b0", "#87957a"], "brightness": 0.55, "warmth": 0.72},
    ],
    song={"bpm": 72, "mode": "major", "energy": 0.3, "valence": 0.7, "genre": "jazz", "year": 2016,
          "beats": [], "sections": [], "source": "deezer"},
)

NIGHT_OFFICE = dict(
    ta={
        "mood": "напряжение", "energy": 0.75, "valence": 0.35, "season": "зима", "time_of_day": "ночь",
        "places": ["офис"], "people": [], "details": ["гул серверов", "холодный свет монитора"],
    },
    pa=[{"dominant_colors": ["#1b2433", "#3a6ea5", "#0d0f14", "#9bb7d4", "#e0e6ee"], "brightness": 0.25, "warmth": 0.2}],
    song={"bpm": 128, "mode": "minor", "energy": 0.85, "valence": 0.3, "genre": "electronic", "year": 2024,
          "beats": [], "sections": [], "source": "deezer"},
)

BIRTHDAY = dict(
    ta={
        "mood": "радость", "energy": 0.85, "valence": 0.9, "season": "лето", "time_of_day": "вечер",
        "places": ["дача"], "people": ["Аня", "Тимур", "Дана", "Ерлан"],
        "details": ["запах шашлыка", "смех", "свечи на торте"],
    },
    pa=[
        {"dominant_colors": ["#f2c14e", "#f78154", "#4d9078", "#5fad56", "#b4436c"], "brightness": 0.7, "warmth": 0.75},
        {"dominant_colors": ["#ffd166", "#ef476f", "#06d6a0", "#118ab2", "#073b4c"], "brightness": 0.65, "warmth": 0.6},
        {"dominant_colors": ["#e76f51", "#f4a261", "#2a9d8f", "#264653", "#e9c46a"], "brightness": 0.6, "warmth": 0.7},
    ],
    song={"bpm": 118, "mode": "major", "energy": 0.8, "valence": 0.9, "genre": "pop", "year": 2023,
          "beats": [], "sections": [], "source": "deezer"},
)


def run(day):
    return build_style(day["ta"], day["pa"], day["song"], caption="test", today=TODAY)


@pytest.mark.parametrize(
    "day,technique",
    [(AUTUMN_PARK, "monet"), (NIGHT_OFFICE, "kandinsky"), (BIRTHDAY, "collage")],
)
def test_technique(day, technique):
    style, voice, expl = run(day)
    assert style["technique"] == technique
    assert expl[0].startswith("Техника")


def test_deterministic():
    for day in (AUTUMN_PARK, NIGHT_OFFICE, BIRTHDAY):
        assert run(day) == run(day)


def test_contract_shape():
    style, voice, _ = run(BIRTHDAY)
    assert len(style["palette"]) == 5
    assert all(c.startswith("#") and len(c) == 7 for c in style["palette"])
    assert 300 <= style["font_weight"] <= 800 and style["font_weight"] % 100 == 0
    for k in ("grain", "motion", "density"):
        assert 0 <= style[k] <= 1
    assert set(voice) == {"name", "rate", "pitch"}


@pytest.mark.parametrize("bpm,step", [(60, 1), (79, 1), (80, 2), (120, 2), (121, 4), (174, 4)])
def test_beat_step(bpm, step):
    assert beat_step(bpm) == step


def test_night_has_dark_background():
    style, _, _ = run(NIGHT_OFFICE)
    assert hex_to_hls(style["palette"][0])[1] < 0.25
    style, _, _ = run(AUTUMN_PARK)
    assert hex_to_hls(style["palette"][0])[1] > 0.8


def test_minor_desaturates():
    major = dict(NIGHT_OFFICE["song"], mode="major")
    s_minor, _, _ = build_style(NIGHT_OFFICE["ta"], NIGHT_OFFICE["pa"], NIGHT_OFFICE["song"], today=TODAY)
    s_major, _, _ = build_style(NIGHT_OFFICE["ta"], NIGHT_OFFICE["pa"], major, today=TODAY)
    sat = lambda st: sum(hex_to_hls(c)[2] for c in st["palette"][1:])
    assert sat(s_minor) < sat(s_major)
    assert s_minor["density"] < s_major["density"]


def test_old_song_more_grain_and_film():
    old = dict(AUTUMN_PARK["song"], year=1979, mode="minor")
    ta = dict(AUTUMN_PARK["ta"], mood="ностальгия")
    style, _, expl = build_style(ta, AUTUMN_PARK["pa"], old, today=TODAY)
    assert style["technique"] == "film"
    assert style["grain"] > 0.7
    assert any("лет -> зерно" in e for e in expl)


def test_rainy_quiet_morning_is_japanese():
    ta = {"mood": "тишина", "energy": 0.2, "valence": 0.4, "season": "осень", "time_of_day": "утро",
          "places": ["окно"], "people": [], "details": ["стук дождя по стеклу"]}
    song = {"bpm": 66, "mode": "minor", "energy": 0.2, "valence": 0.3, "year": 2019, "source": "deezer"}
    style, voice, _ = build_style(ta, [], song, today=TODAY)
    assert style["technique"] == "japanese"
    assert style["density"] <= 0.3
    assert voice["rate"] == "-15%"


def test_voice_rules():
    _, v, _ = run(BIRTHDAY)
    assert v["rate"] == "+10%"
    _, v, _ = run(AUTUMN_PARK)
    assert v["rate"] == "-15%"


def test_no_song_no_photos_fallback():
    style, voice, expl = build_style({"mood": "спокойствие", "energy": 0.5, "valence": 0.5}, [], None, today=TODAY)
    assert len(style["palette"]) == 5
    assert any("песня не распознана" in e for e in expl)
    assert any("фото нет" in e for e in expl)
