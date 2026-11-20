"""Анализ текста дня: LLM (Gemini / Groq) -> строгий JSON, с проверкой и fallback без сети.

analyze_text(text) -> (text_analysis: dict, title: str, caption: str, source: str)
"""
from __future__ import annotations

import json
import logging
import re
import time

import httpx

from .config import settings

log = logging.getLogger(__name__)

SEASONS = ("зима", "весна", "лето", "осень")
TIMES = ("утро", "день", "вечер", "ночь")
MOODS = (
    "спокойствие", "уют", "нежность", "благодарность", "радость", "восторг", "праздник", "любовь",
    "напряжение", "тревога", "сосредоточенность", "усталость", "драйв",
    "ностальгия", "светлая грусть", "тишина", "одиночество", "грусть", "задумчивость",
)

SYSTEM_PROMPT = f"""Ты помогаешь цифровому дневнику превратить запись о дне в художественное воспоминание.
Прочитай текст пользователя и верни СТРОГО JSON без пояснений:
{{
 "mood": одно слово из списка {list(MOODS)},
 "energy": число 0..1 (0 = сонно и тихо, 1 = бешеный темп),
 "valence": число 0..1 (0 = тяжело и грустно, 1 = светло и счастливо),
 "season": одно из {list(SEASONS)} или null, если не понятно,
 "time_of_day": одно из {list(TIMES)} или null,
 "places": места из текста (до 4, в именительном падеже),
 "people": люди из текста (имена или роли: "мама", "друзья"),
 "details": 3-5 чувственных деталей (запах, звук, свет, вкус, прикосновение), 2-4 слова каждая,
 "title": название папки дня, 3-7 слов,
 "caption": короткая подпись от руки, до 8 слов
}}
Правила:
- details берутся ТОЛЬКО из того, что написал пользователь. Ничего не придумывай. Если деталей мало, верни меньше.
- title тёплый и конкретный, без пафоса и без слов «день», «воспоминание», «прекрасный». Пример хорошего: «Осенний парк и какао».
- caption звучит как подпись под фото в бумажном альбоме, по-русски, без кавычек.
- Не добавляй ничего, кроме JSON."""

FEW_SHOT = [
    (
        "Гуляли с мамой в парке, листья уже совсем жёлтые, шуршат под ногами. Купили какао в бумажных стаканах, "
        "пахло корицей. Солнце низкое, всё золотое. Хорошо и спокойно.",
        {
            "mood": "уют", "energy": 0.3, "valence": 0.8, "season": "осень", "time_of_day": "день",
            "places": ["парк"], "people": ["мама"],
            "details": ["шуршание листьев", "запах корицы", "низкое золотое солнце", "какао в бумажных стаканах"],
            "title": "Осенний парк и какао", "caption": "листья шуршали, а какао грело руки",
        },
    ),
    (
        "Сидим в офисе до двух ночи, релиз завтра. Гудит кондиционер, монитор режет глаза, третий кофе. "
        "Всё бесит, но вроде успеваем.",
        {
            "mood": "напряжение", "energy": 0.75, "valence": 0.35, "season": None, "time_of_day": "ночь",
            "places": ["офис"], "people": [],
            "details": ["гул кондиционера", "свет монитора", "третий кофе"],
            "title": "Релиз в два часа ночи", "caption": "кофе остыл, а мы ещё здесь",
        },
    ),
]


# ---------- LLM ----------

def _user_prompt(text: str) -> str:
    return f"Текст дня:\n\"\"\"\n{text.strip()[:4000]}\n\"\"\""


# перегруженную/закрытую модель пропускаем 5 минут, чтобы не терять секунды на каждом дне
MODEL_COOLDOWN = 1800.0
_model_down_until: dict[str, float] = {}


async def _call_gemini(text: str) -> str:
    contents = []
    for t, ans in FEW_SHOT:
        contents.append({"role": "user", "parts": [{"text": _user_prompt(t)}]})
        contents.append({"role": "model", "parts": [{"text": json.dumps(ans, ensure_ascii=False)}]})
    contents.append({"role": "user", "parts": [{"text": _user_prompt(text)}]})
    body = {
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json"},
    }
    # GEMINI_MODEL может быть списком через запятую: модели у Google закрываются, берём первую живую
    models = [m.strip() for m in settings.gemini_model.split(",") if m.strip()]
    now = time.monotonic()
    alive = [m for m in models if _model_down_until.get(m, 0) <= now]
    models = alive or models[-1:]
    async with httpx.AsyncClient(timeout=settings.llm_timeout) as c:
        for i, model in enumerate(models):
            last = i == len(models) - 1
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
            try:
                # не последней модели даём меньше времени: дальше есть запасные
                r = await c.post(url, json=body, headers={"x-goog-api-key": settings.gemini_api_key},
                                 timeout=settings.llm_timeout if last else 15.0)
            except httpx.TimeoutException:
                if last:
                    raise
                _model_down_until[model] = time.monotonic() + MODEL_COOLDOWN
                log.warning("Gemini: %s не ответила вовремя, пробуем следующую", model)
                continue
            # 404 = модель закрыта, 429 = лимит, 5xx = перегрузка: пробуем следующую модель
            if (r.status_code in (404, 429) or r.status_code >= 500) and not last:
                _model_down_until[model] = time.monotonic() + MODEL_COOLDOWN
                log.warning("Gemini: %s ответила %s, пробуем следующую", model, r.status_code)
                continue
            r.raise_for_status()
            return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    raise RuntimeError("нет доступной модели Gemini")


async def _call_groq(text: str) -> str:
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for t, ans in FEW_SHOT:
        msgs.append({"role": "user", "content": _user_prompt(t)})
        msgs.append({"role": "assistant", "content": json.dumps(ans, ensure_ascii=False)})
    msgs.append({"role": "user", "content": _user_prompt(text)})
    async with httpx.AsyncClient(timeout=settings.llm_timeout) as c:
        r = await c.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={
                "model": settings.groq_model, "messages": msgs, "temperature": 0.4,
                "response_format": {"type": "json_object"},
            },
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


def _extract_json(raw: str) -> dict:
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.S)
    return json.loads(m.group(0) if m else raw)


# ---------- проверка ответа ----------

_WORD = re.compile(r"[а-яёa-z]{4,}", re.I)


def _stem(w: str) -> str:
    return w.lower().replace("ё", "е")[:4]


def _grounded(detail: str, text: str) -> bool:
    """Деталь засчитывается, если хотя бы одно её значимое слово (по основе) есть в тексте пользователя."""
    text_stems = {_stem(w) for w in _WORD.findall(text)}
    words = _WORD.findall(detail)
    return bool(words) and any(_stem(w) in text_stems for w in words)


def _num(x, default=0.5) -> float:
    try:
        return round(max(0.0, min(1.0, float(x))), 2)
    except (TypeError, ValueError):
        return default


def _clean_list(x, limit: int) -> list[str]:
    if not isinstance(x, list):
        return []
    out = []
    for i in x:
        s = str(i).strip().strip("«»\"'")
        if s and s.lower() not in (o.lower() for o in out):
            out.append(s)
    return out[:limit]


def _title_ok(title: str) -> str:
    title = re.sub(r"[«»\"'.!]", "", (title or "").strip())
    words = title.split()
    if len(words) < 2:
        return ""
    return " ".join(words[:7])


def normalize(data: dict, text: str) -> tuple[dict, str, str]:
    mood = str(data.get("mood") or "").lower().strip()
    season = data.get("season")
    tod = data.get("time_of_day")
    details = [d for d in _clean_list(data.get("details"), 5) if _grounded(d, text)]
    ta = {
        "mood": mood or "спокойствие",
        "energy": _num(data.get("energy")),
        "valence": _num(data.get("valence")),
        "season": season if season in SEASONS else None,
        "time_of_day": tod if tod in TIMES else None,
        "places": _clean_list(data.get("places"), 4),
        "people": _clean_list(data.get("people"), 8),
        "details": details,
    }
    title = _title_ok(str(data.get("title") or "")) or fallback_title(ta)
    caption = str(data.get("caption") or "").strip().strip("«»\"")[:80]
    return ta, title, caption


# ---------- fallback без LLM ----------

_SEASON_WORDS = {
    "зима": ("зим", "снег", "мороз", "декабр", "январ", "феврал", "новый год", "каток"),
    "весна": ("весн", "март", "апрел", "май ", "мая", "цвет", "подснеж", "капел"),
    "лето": ("лет", "жара", "июн", "июл", "август", "пляж", "море", "купал"),
    "осень": ("осен", "сентябр", "октябр", "ноябр", "листопад", "жёлт", "желт", "листья"),
}
_TIME_WORDS = {
    "утро": ("утр", "рассвет", "завтрак", "проснул"),
    "день": ("днём", "днем", "обед", "полдень"),
    "вечер": ("вечер", "закат", "ужин", "сумерк"),
    "ночь": ("ночь", "ночи", "ночью", "полночь", "звёзд", "звезд", "до утра", "до утра"),
}
_MOOD_LEX = [
    ("радость", ("рад", "счаст", "весел", "смея", "смех", "ура", "кайф", "праздн", "день рожд")),
    ("напряжение", ("дедлайн", "устал", "нерв", "бесит", "стресс", "релиз", "экзамен", "спешил")),
    ("ностальгия", ("бабушк", "детств", "вспомн", "раньше", "старые", "скучаю", "ностальг")),
    ("тишина", ("тишин", "один", "одна", "пусто", "дожд", "молча", "тихо")),
    ("уют", ("уют", "тепл", "плед", "какао", "чай", "спокой", "хорошо")),
]
_SENSE = re.compile(
    r"(?<![а-яё])(запах\w*|пахл\w*|пахнет|аромат\w*|звук\w*|шум\w*|шорох\w*|шурш\w*|гул\w*|стук\w*|смех\w*|"
    r"свет\w*|солнц\w*|луч\w*|вкус\w*|тепл\w*|холод\w*|ветер|ветр\w*)"
    r"(\s+[а-яё]{4,})",
    re.I,
)
_PEOPLE = ("мам", "пап", "бабушк", "дедушк", "брат", "сестр", "друз", "подруг", "коллег", "сын", "доч", "муж", "жена")
_PLACES = ("парк", "офис", "дом", "кафе", "дач", "море", "лес", "универ", "школ", "метро", "улиц", "горы", "кухн", "балкон")


def _find(table: dict, low: str) -> str | None:
    best, hits = None, 0
    for key, words in table.items():
        n = sum(low.count(w) for w in words)
        if n > hits:
            best, hits = key, n
    return best


_ADJ = {  # (м, ж, ср)
    "зима": ("Зимний", "Зимняя", "Зимнее"),
    "весна": ("Весенний", "Весенняя", "Весеннее"),
    "лето": ("Летний", "Летняя", "Летнее"),
    "осень": ("Осенний", "Осенняя", "Осеннее"),
}
_TIME_TITLE = {"утро": "Тихое утро", "день": "Долгий день", "вечер": "Тёплый вечер", "ночь": "Поздняя ночь"}


def _gender(noun: str) -> int:
    n = noun.lower()
    if n.endswith(("а", "я", "ь")) and n not in ("день", "дождь"):
        return 1
    if n.endswith(("о", "е")):
        return 2
    return 0


def fallback_title(ta: dict) -> str:
    """Название по шаблону: [сезон+место | место | время суток] и [деталь | настроение]."""
    season, place = ta.get("season"), (ta.get("places") or [None])[0]
    if place and season in _ADJ:
        base = f"{_ADJ[season][_gender(place)]} {place.lower()}"
    elif place:
        base = place.capitalize()
    elif season in _ADJ:
        base = f"{_ADJ[season][2]} {ta.get('time_of_day') or 'утро'}"
    else:
        base = _TIME_TITLE.get(ta.get("time_of_day") or "", "Тихий день")
    # в название берём только детали, начинающиеся с существительного («запах корицы», не «пахло корицей»)
    nouns = ("запах", "звук", "шум", "шорох", "гул", "стук", "смех", "свет", "солнц", "луч", "вкус", "аромат", "ветер")
    detail = next((d for d in ta.get("details") or [] if d.lower().startswith(nouns)), None)
    tail = detail if detail and len(base.split()) + len(detail.split()) <= 6 else ta.get("mood", "тишина")
    t = f"{base} и {tail}"
    return t[0].upper() + t[1:]


def fallback_analysis(text: str) -> tuple[dict, str, str]:
    low = text.lower()
    mood = "спокойствие"
    best = 0
    for m, words in _MOOD_LEX:
        n = sum(low.count(w) for w in words)
        if n > best:
            mood, best = m, n
    energy = {"радость": 0.75, "напряжение": 0.7, "ностальгия": 0.35, "тишина": 0.2, "уют": 0.3}.get(mood, 0.45)
    valence = {"радость": 0.85, "напряжение": 0.35, "ностальгия": 0.5, "тишина": 0.4, "уют": 0.75}.get(mood, 0.55)
    if text.count("!") >= 2:
        energy = min(1.0, energy + 0.1)
    details = []
    for m in _SENSE.finditer(text):
        d = m.group(0).strip(" ,.").lower()
        if d not in details:
            details.append(d)
    ta = {
        "mood": mood, "energy": round(energy, 2), "valence": round(valence, 2),
        "season": _find(_SEASON_WORDS, low), "time_of_day": _find(_TIME_WORDS, low.replace("до утра", "ночь")),
        "places": [p for p in _PLACES if p in low][:3],
        "people": [p for p in _PEOPLE if p in low][:6],
        "details": details[:5],
    }
    # приводим основы к читаемым словам
    ta["places"] = [{"дач": "дача", "универ": "университет", "школ": "школа", "улиц": "улица", "кухн": "кухня"}.get(p, p) for p in ta["places"]]
    ta["people"] = [{"мам": "мама", "пап": "папа", "бабушк": "бабушка", "дедушк": "дедушка", "сестр": "сестра", "друз": "друзья",
                     "подруг": "подруга", "коллег": "коллеги", "доч": "дочь"}.get(p, p) for p in ta["people"]]
    first = re.split(r"[.!?\n]", text.strip())[0][:60].lower()
    return ta, fallback_title(ta), first


# ---------- вход ----------

async def probe_llm() -> dict:
    """Диагностика для /api/health/deps: реальный вызов LLM, ошибка возвращается текстом."""
    provider = settings.llm_provider
    try:
        if provider == "gemini" and settings.gemini_api_key:
            raw = await _call_gemini("Утром пили чай на балконе, пахло дождём.")
        elif provider == "groq" and settings.groq_api_key:
            raw = await _call_groq("Утром пили чай на балконе, пахло дождём.")
        else:
            return {"ok": False, "provider": provider, "error": "ключ не задан"}
        return {"ok": True, "provider": provider, "model": settings.gemini_model if provider == "gemini" else settings.groq_model,
                "sample": _extract_json(raw).get("title")}
    except httpx.HTTPStatusError as e:
        return {"ok": False, "provider": provider, "status": e.response.status_code, "error": e.response.text[:400]}
    except Exception as e:
        return {"ok": False, "provider": provider, "error": f"{type(e).__name__}: {e}"[:400]}


async def analyze_text(text: str) -> tuple[dict, str, str, str]:
    """Возвращает (text_analysis, title, caption, source), source = gemini|groq|fallback."""
    provider = settings.llm_provider
    try:
        if provider == "gemini" and settings.gemini_api_key:
            try:
                raw = await _call_gemini(text)
            except Exception:
                if not settings.groq_api_key:
                    raise
                log.warning("Gemini недоступен, переключаемся на Groq")
                raw, provider = await _call_groq(text), "groq"
        elif provider == "groq" and settings.groq_api_key:
            raw = await _call_groq(text)
        else:
            raise RuntimeError("LLM не настроен")
        ta, title, caption = normalize(_extract_json(raw), text)
        return ta, title, caption, provider
    except Exception as e:  # сеть, лимиты, кривой JSON -> правила
        log.warning("LLM недоступен (%s), работаем на правилах", e)
        ta, title, caption = fallback_analysis(text)
        return ta, title, caption, "fallback"
