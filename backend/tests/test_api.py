"""Сквозной тест API на локальном хранилище (без сети)."""
import io
import zipfile

from fastapi.testclient import TestClient
from PIL import Image

import app.pipeline as pipeline
from app.main import app

client = TestClient(app)

TEXT = ("Утром шёл дождь, сидела у окна одна и слушала стук капель. Пахло мокрым асфальтом "
        "и свежим хлебом из пекарни напротив. Было тихо и немного грустно.")


def _jpg(color):
    buf = io.BytesIO()
    Image.new("RGB", (64, 64), color).save(buf, "JPEG")
    return buf.getvalue()


def _no_voice(monkeypatch):
    monkeypatch.setattr(pipeline, "synthesize_voice", lambda t, v, p: "")


def test_health():
    assert client.get("/api/health").json()["ok"]


def test_create_list_get_zip(monkeypatch):
    _no_voice(monkeypatch)
    r = client.post(
        "/api/days",
        data={"text": TEXT, "date": "2026-10-15"},
        files=[("photos", ("a.jpg", _jpg((90, 110, 130)), "image/jpeg")),
               ("photos", ("b.jpg", _jpg((200, 190, 170)), "image/jpeg"))],
    )
    assert r.status_code == 200, r.text
    day = r.json()
    assert day["date"] == "2026-10-15"
    assert 2 <= len(day["title"].split()) <= 7
    assert len(day["photos"]) == 2
    assert len(day["photo_analysis"]) == 2
    assert day["style"]["technique"] == "japanese"
    assert len(day["style"]["palette"]) == 5
    assert day["explanation"]
    assert day["folder"].startswith("2026-10-15_")
    assert day["song"] is None

    lst = client.get("/api/days").json()
    assert any(d["id"] == day["id"] for d in lst)
    assert client.get(f"/api/days/{day['id']}").json()["title"] == day["title"]

    z = client.get(f"/api/days/{day['id']}/zip")
    assert z.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(z.content)).namelist()
    assert any(n.endswith("text.txt") for n in names)
    assert any("/photos/01.jpg" in n for n in names)
    assert any(n.endswith("day.json") for n in names)


def test_list_newest_first(monkeypatch):
    _no_voice(monkeypatch)
    for d in ("2025-11-01", "2026-11-19"):
        client.post("/api/days", data={"text": TEXT, "date": d})
    dates = [d["date"] for d in client.get("/api/days").json()]
    assert dates == sorted(dates, reverse=True)


def test_same_title_gets_unique_folder(monkeypatch):
    _no_voice(monkeypatch)
    a = client.post("/api/days", data={"text": TEXT, "date": "2026-01-01"}).json()
    b = client.post("/api/days", data={"text": TEXT, "date": "2026-01-01"}).json()
    assert a["folder"] != b["folder"]


def test_song_url_stub(monkeypatch):
    _no_voice(monkeypatch)
    monkeypatch.setattr(pipeline, "analyze_song", lambda url, path: {
        "title": "Song", "artist": "Artist", "source_url": url, "preview_url": None,
        "bpm": 96, "mode": "major", "energy": 0.5, "valence": 0.6, "genre": "pop", "year": 2020,
        "beats": [0.3, 0.925, 1.55], "sections": [0.0, 10.0], "source": "deezer",
    })
    r = client.post("/api/days", data={"text": TEXT, "song_url": "https://www.deezer.com/track/3135556"})
    song = r.json()["song"]
    assert song["source_url"].startswith("https://www.deezer.com")
    assert song["analysis"]["beats"]


def test_validation():
    assert client.post("/api/days", data={"text": "коротко"}).status_code == 422
    assert client.post("/api/days", data={"text": TEXT, "date": "вчера"}).status_code == 422
    assert client.get("/api/days/nope").status_code == 404


def test_style_preview():
    r = client.post("/api/style", json={
        "text_analysis": {"mood": "радость", "energy": 0.9, "valence": 0.9, "people": ["a", "b", "c"]},
        "song_analysis": {"bpm": 130, "mode": "major", "energy": 0.9, "valence": 0.9},
    })
    body = r.json()
    assert body["style"]["technique"] == "collage"
    assert body["style"]["beat_step"] == 4
