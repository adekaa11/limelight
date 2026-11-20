"""Визуальная система: детерминированные правила «вход -> стиль».

build_style(text_analysis, photo_analysis, song_analysis) -> (style, voice_params, explanation)

Принципы:
- Никакой случайности: одинаковый вход всегда даёт одинаковый результат.
- Каждое сработавшее правило пишется в explanation человеческим языком.
- Таблицы правил продублированы в docs/visual-system.md.
"""
from __future__ import annotations

import colorsys
from datetime import date
from typing import Any

TECHNIQUES = ("monet", "kandinsky", "film", "collage", "japanese")  # порядок = приоритет при равенстве

TECHNIQUE_RU = {
    "monet": "Моне (импрессионизм)",
    "kandinsky": "Кандинский (геометрия)",
    "film": "плёнка",
    "collage": "коллаж Матисса",
    "japanese": "японский минимализм",
}

# Базовый оттенок (градусы HSL) по времени года
SEASON_HUE = {"зима": 210, "весна": 105, "лето": 48, "осень": 28}
# Сдвиг оттенка и светлоты фона по времени суток
TIME_SHIFT = {
    "утро": {"hue": 10, "light": 0.92, "label": "утро -> светлый фон"},
    "день": {"hue": 0, "light": 0.90, "label": "день -> светлый фон"},
    "вечер": {"hue": -14, "light": 0.82, "label": "вечер -> фон теплее и темнее"},
    "ночь": {"hue": 25, "light": 0.12, "label": "ночь -> тёмный фон"},
}
NEUTRAL_HUE = 35  # бумага, если нет ни сезона, ни фото

MOOD_GROUPS = {
    "calm": {"спокойствие", "умиротворение", "уют", "нежность", "благодарность", "тепло"},
    "tension": {"напряжение", "тревога", "сосредоточенность", "усталость", "стресс", "драйв"},
    "nostalgia": {"ностальгия", "светлая грусть", "тоска", "воспоминание"},
    "joy": {"радость", "восторг", "веселье", "счастье", "праздник", "любовь"},
    "quiet": {"тишина", "одиночество", "грусть", "задумчивость", "пустота", "печаль"},
}

RAIN_WORDS = ("дожд", "ливен", "морос", "лужа", "лужи", "зонт", "снег", "туман")
WORK_WORDS = ("офис", "работ", "дедлайн", "универ", "учёб", "учеб", "экзамен", "хакатон", "код")
ELECTRONIC = ("electro", "techno", "house", "edm", "dance", "drum", "dubstep", "synth", "электрон")


# ---------- утилиты цвета ----------

def _clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def _r2(x: float) -> float:
    return round(x, 2)


def hex_to_hls(h: str) -> tuple[float, float, float]:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) / 255 for i in (0, 2, 4))
    hue, light, sat = colorsys.rgb_to_hls(r, g, b)
    return hue * 360, light, sat


def hls_to_hex(hue: float, light: float, sat: float) -> str:
    r, g, b = colorsys.hls_to_rgb((hue % 360) / 360, _clamp(light), _clamp(sat))
    return "#{:02x}{:02x}{:02x}".format(round(r * 255), round(g * 255), round(b * 255))


def _hue_lerp(a: float, b: float, t: float) -> float:
    """Интерполяция по кругу оттенков (кратчайший путь)."""
    d = ((b - a + 180) % 360) - 180
    return (a + d * t) % 360


# ---------- признаки ----------

def _mood_group(mood: str) -> str | None:
    m = (mood or "").lower().strip()
    for group, words in MOOD_GROUPS.items():
        if m in words or any(w in m for w in words):
            return group
    return None


def _has(words: tuple[str, ...], items: list[str]) -> bool:
    blob = " ".join(items).lower()
    return any(w in blob for w in words)


def _song_is_real(song: dict | None) -> bool:
    return bool(song) and song.get("source") != "fallback" and bool(song.get("bpm"))


def _features(ta: dict, pa: list[dict], song: dict | None, today: date) -> dict[str, Any]:
    real = _song_is_real(song)
    s = song or {}
    t_energy, t_val = float(ta.get("energy", 0.5)), float(ta.get("valence", 0.5))
    if real:
        energy = 0.5 * t_energy + 0.5 * float(s.get("energy", 0.5))
        valence = 0.5 * t_val + 0.5 * float(s.get("valence", 0.5))
    else:
        energy, valence = t_energy, t_val
    year = s.get("year") if real else None
    song_age = max(0, today.year - int(year)) if year else None
    photo_warmth = sum(p.get("warmth", 0.5) for p in pa) / len(pa) if pa else None
    photo_bright = sum(p.get("brightness", 0.5) for p in pa) / len(pa) if pa else None
    return {
        "real_song": real,
        "bpm": float(s.get("bpm") or 0) if real else None,
        "mode": s.get("mode", "major") if real else None,
        "genre": (s.get("genre") or "").lower() if real else "",
        "song_age": song_age,
        "energy": _clamp(energy),
        "valence": _clamp(valence),
        "mood": (ta.get("mood") or "").lower(),
        "mood_group": _mood_group(ta.get("mood", "")),
        "season": (ta.get("season") or "").lower() or None,
        "time": (ta.get("time_of_day") or "").lower() or None,
        "people": len(ta.get("people") or []),
        "rain": _has(RAIN_WORDS, (ta.get("details") or []) + (ta.get("places") or []) + [ta.get("mood") or ""]),
        "work": _has(WORK_WORDS, (ta.get("places") or []) + (ta.get("details") or [])),
        "photo_warmth": photo_warmth,
        "photo_bright": photo_bright,
    }


# ---------- выбор техники ----------

def _score_techniques(f: dict) -> dict[str, list[tuple[int, str]]]:
    """Для каждой техники список (баллы, причина). Побеждает максимальная сумма."""
    E, V = f["energy"], f["valence"]
    bpm, mode, mg = f["bpm"], f["mode"], f["mood_group"]
    sc: dict[str, list[tuple[int, str]]] = {t: [] for t in TECHNIQUES}

    def add(t: str, pts: int, why: str) -> None:
        sc[t].append((pts, why))

    # monet: спокойно, тепло, медленный мажор
    if mg == "calm":
        add("monet", 3, f"настроение «{f['mood']}»")
    if E < 0.55:
        add("monet", 2, f"энергия {E:.2f} < 0.55")
    if V >= 0.55:
        add("monet", 2, f"валентность {V:.2f} ≥ 0.55")
    if mode == "major" and bpm is not None and bpm < 110:
        add("monet", 2, f"медленный мажор ({bpm:.0f} BPM)")
    if f["photo_warmth"] is not None and f["photo_warmth"] >= 0.55:
        add("monet", 1, f"тёплый свет на фото ({f['photo_warmth']:.2f})")

    # kandinsky: напряжение, работа, быстрая электроника
    if mg == "tension":
        add("kandinsky", 3, f"настроение «{f['mood']}»")
    if E >= 0.65:
        add("kandinsky", 2, f"энергия {E:.2f} ≥ 0.65")
    if bpm is not None and bpm >= 120:
        add("kandinsky", 2, f"быстрый темп {bpm:.0f} BPM")
    if any(g in f["genre"] for g in ELECTRONIC):
        add("kandinsky", 2, f"жанр {f['genre']}")
    if f["work"]:
        add("kandinsky", 2, "работа/учёба в тексте")
    if f["time"] == "ночь" and mg != "quiet":
        add("kandinsky", 1, "ночь")

    # film: ностальгия, старые песни, минор
    if mg == "nostalgia":
        add("film", 3, f"настроение «{f['mood']}»")
    if f["song_age"] is not None and f["song_age"] >= 15:
        add("film", 3, f"песне {f['song_age']} лет")
    if mode == "minor":
        add("film", 1, "минор")
    if 0.3 <= V <= 0.6 and mg in ("nostalgia", "quiet", None):
        add("film", 1, f"смешанная валентность {V:.2f}")

    # collage: радость, много людей, энергия + мажор
    if mg == "joy":
        add("collage", 3, f"настроение «{f['mood']}»")
    if f["people"] >= 3:
        add("collage", 2, f"людей в тексте: {f['people']}")
    if V >= 0.65:
        add("collage", 2, f"валентность {V:.2f} ≥ 0.65")
    if E >= 0.6 and mode == "major":
        add("collage", 2, "энергичный мажор")

    # japanese: тишина, одиночество, дождь, медленный минор
    if mg == "quiet":
        add("japanese", 3, f"настроение «{f['mood']}»")
    if f["rain"]:
        add("japanese", 2, "дождь/снег/туман")
    if E < 0.35:
        add("japanese", 2, f"энергия {E:.2f} < 0.35")
    if mode == "minor" and bpm is not None and bpm < 90:
        add("japanese", 2, f"медленный минор ({bpm:.0f} BPM)")
    if f["people"] == 0:
        add("japanese", 1, "в тексте нет людей")
    return sc


def pick_technique(f: dict) -> tuple[str, list[tuple[int, str]], dict[str, int]]:
    sc = _score_techniques(f)
    totals = {t: sum(p for p, _ in sc[t]) for t in TECHNIQUES}
    best = max(TECHNIQUES, key=lambda t: (totals[t], -TECHNIQUES.index(t)))
    if totals[best] == 0:
        best = "monet"
    return best, sc[best], totals


# ---------- палитра ----------

def _base_hue(f: dict) -> tuple[float, list[str]]:
    why: list[str] = []
    if f["season"] in SEASON_HUE:
        hue = SEASON_HUE[f["season"]]
        why.append(f"{f['season']} -> базовый оттенок {hue}°")
    else:
        hue = NEUTRAL_HUE
    if f["time"] in TIME_SHIFT:
        hue = (hue + TIME_SHIFT[f["time"]]["hue"]) % 360
        why.append(TIME_SHIFT[f["time"]]["label"])
    # валентность тянет оттенок к тёплому (30°) или холодному (215°)
    V = f["valence"]
    if V >= 0.5:
        hue = _hue_lerp(hue, 30, (V - 0.5) * 0.8)
    else:
        hue = _hue_lerp(hue, 215, (0.5 - V) * 0.8)
    why.append(f"валентность {V:.2f} -> {'теплее' if V >= 0.5 else 'холоднее'} палитра")
    return hue, why


def _photo_colors(pa: list[dict]) -> list[str]:
    """Чередуем доминантные цвета по фото: 1-й цвет каждого фото, затем 2-й и т.д."""
    lists = [p.get("dominant_colors") or [] for p in pa]
    out: list[str] = []
    for i in range(max((len(x) for x in lists), default=0)):
        for lst in lists:
            if i < len(lst) and lst[i].lower() not in out:
                out.append(lst[i].lower())
    return out


def _rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _dedupe(colors: list[str], min_dist: float = 28.0) -> list[str]:
    """Убираем почти одинаковые цвета (евклидово расстояние в RGB)."""
    out: list[str] = []
    for c in colors:
        if all(sum((a - b) ** 2 for a, b in zip(_rgb(c), _rgb(o))) ** 0.5 >= min_dist for o in out):
            out.append(c)
    return out or colors[:1]


def _hue_dist(a: float, b: float) -> float:
    return abs(((a - b + 180) % 360) - 180)


def _pick_accents(colors: list[tuple[float, float, float]], n: int) -> list[tuple[float, float, float]]:
    """Акценты: первый самый насыщенный, дальше жадно максимизируем различие (оттенок + светлота).
    Так серия не схлопывается в 4 почти одинаковых цвета."""
    pool = sorted(colors, key=lambda x: (-x[2], x[1], x[0]))
    picked = [pool.pop(0)]
    while pool and len(picked) < n:
        def score(c):
            return min(_hue_dist(c[0], p[0]) / 180 * (0.3 + c[2]) + abs(c[1] - p[1]) for p in picked)
        best = max(pool, key=lambda c: (score(c), c[2], -c[0]))
        pool.remove(best)
        picked.append(best)
    return picked


def build_palette(f: dict, pa: list[dict]) -> tuple[list[str], list[str]]:
    why: list[str] = []
    target_hue, hue_why = _base_hue(f)
    why += hue_why
    E, mode = f["energy"], f["mode"]

    src = _photo_colors(pa)
    if src:
        why.append("палитра = 60% цветов фото + 40% сдвиг по настроению")
    else:
        # без фото: аналоговая гамма вокруг базового оттенка
        src = [
            hls_to_hex(target_hue + d, l, s)
            for d, l, s in ((0, 0.55, 0.45), (25, 0.45, 0.5), (-30, 0.65, 0.35), (180, 0.4, 0.3), (10, 0.3, 0.4))
        ]
        why.append("фото нет -> палитра строится от базового оттенка")
    src = _dedupe(src)
    base_n, k = len(src), 0
    while len(src) < 5:  # дополняем вариациями светлоты исходных цветов
        h, l, s = hex_to_hls(src[k % base_n])
        shift = (0.22, -0.22, 0.4, -0.4)[(k // base_n) % 4]
        src.append(hls_to_hex(h, _clamp(l + shift, 0.08, 0.95), s))
        k += 1

    sat_k = 1.0
    if mode == "minor":
        sat_k = 0.75
        why.append("минор -> насыщенность −25%, больше пустоты")
    elif mode == "major":
        sat_k = 1.08
        why.append("мажор -> теплее и плотнее")
    contrast = 0.8 + 0.5 * E  # energy -> разброс светлоты

    mixed = []
    for c in src[:10]:
        h, l, s = hex_to_hls(c)
        h2 = _hue_lerp(h, target_hue, 0.4)
        if mode == "major":
            h2 = _hue_lerp(h2, 30, 0.08)
        s2 = _clamp((0.6 * s + 0.4 * 0.55) * sat_k)
        l2 = _clamp(0.5 + (l - 0.5) * contrast, 0.06, 0.96)
        mixed.append((h2, l2, s2))

    # palette[0] = фон: светлый «бумажный» днём, тёмный ночью
    bg_light = TIME_SHIFT.get(f["time"] or "", {}).get("light", 0.9)
    bh = _hue_lerp(target_hue, mixed[0][0], 0.3)
    bg = (bh, bg_light, 0.25 if f["time"] != "ночь" else 0.3)
    accents = _pick_accents(mixed, 4)
    palette = [hls_to_hex(*bg)] + [hls_to_hex(*a) for a in accents]
    return palette, why


# ---------- параметры ----------

def beat_step(bpm: float) -> int:
    if bpm > 120:
        return 4
    if bpm >= 80:
        return 2
    return 1


def voice_params(f: dict, technique: str) -> tuple[dict, str]:
    E = f["energy"]
    if E < 0.4:
        v = {"name": "ru-RU-SvetlanaNeural", "rate": "-15%", "pitch": "-2Hz"}
        why = f"энергия {E:.2f} < 0.4 -> голос тихий тёплый (Светлана, темп −15%)"
    elif E > 0.7:
        v = {"name": "ru-RU-SvetlanaNeural", "rate": "+10%", "pitch": "+4Hz"}
        why = f"энергия {E:.2f} > 0.7 -> голос живой быстрый (Светлана, темп +10%, выше)"
    elif technique == "kandinsky":
        v = {"name": "ru-RU-DmitryNeural", "rate": "+0%", "pitch": "+0Hz"}
        why = "Кандинский -> ровный собранный голос (Дмитрий)"
    else:
        v = {"name": "ru-RU-SvetlanaNeural", "rate": "-5%", "pitch": "+0Hz"}
        why = "средняя энергия -> спокойный голос (Светлана, темп −5%)"
    return v, why


def build_style(
    text_analysis: dict,
    photo_analysis: list[dict] | None,
    song_analysis: dict | None,
    caption: str = "",
    today: date | None = None,
) -> tuple[dict, dict, list[str]]:
    """Главная функция. today передаётся для детерминизма возраста песни в тестах."""
    today = today or date.today()
    pa = photo_analysis or []
    f = _features(text_analysis, pa, song_analysis, today)
    expl: list[str] = []

    # 1. техника
    technique, reasons, totals = pick_technique(f)
    top = ", ".join(why for _, why in sorted(reasons, key=lambda r: -r[0])[:3]) or "по умолчанию"
    expl.append(f"Техника: {TECHNIQUE_RU[technique]} ({totals[technique]} балл.): {top}")

    # 2. ритм кадров
    if f["real_song"]:
        step = beat_step(f["bpm"])
        expl.append(
            f"{f['bpm']:.0f} BPM -> смена кадра на каждый "
            + {1: "бит", 2: "2-й бит", 4: "4-й бит"}[step]
        )
    else:
        step = 1 if f["energy"] < 0.4 else 2
        expl.append("песня не распознана -> ритм кадров по энергии текста")

    # 3. палитра
    palette, pal_why = build_palette(f, pa)
    expl += pal_why

    # 4. зерно: техника + возраст песни
    grain = {"film": 0.45, "japanese": 0.12, "monet": 0.15, "kandinsky": 0.08, "collage": 0.18}[technique]
    if f["song_age"] is not None and f["song_age"] > 0:
        add = min(f["song_age"] / 40, 1) * 0.4
        grain += add
        if add >= 0.05:
            expl.append(f"песне {f['song_age']} лет -> зерно +{add:.2f}")
    grain = _clamp(grain)

    # 5. движение и контраст от энергии
    motion = _clamp(0.15 + 0.75 * f["energy"])
    expl.append(f"энергия {f['energy']:.2f} -> амплитуда движения {motion:.2f}, контраст ×{0.8 + 0.5 * f['energy']:.2f}")

    # 6. плотность композиции
    density = 0.5
    if f["mode"] == "major":
        density += 0.12
    elif f["mode"] == "minor":
        density -= 0.12
    if f["people"]:
        density += min(f["people"], 3) * 0.05
    density = {"japanese": min(density, 0.3), "collage": max(density, 0.65)}.get(technique, density)
    density = _clamp(density)

    # 7. жирность шрифта
    font_weight = int(round((300 + 500 * f["energy"]) / 100) * 100)
    font_weight = max(300, min(800, font_weight))

    # 8. голос
    voice, v_why = voice_params(f, technique)
    expl.append(v_why)

    style = {
        "technique": technique,
        "palette": palette,
        "grain": _r2(grain),
        "beat_step": step,
        "motion": _r2(motion),
        "density": _r2(density),
        "font_weight": font_weight,
        "caption": caption,
    }
    return style, voice, expl
