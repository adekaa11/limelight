"""music.py: анализ звука на синтетике (без сети)."""
import numpy as np
import pytest

sf = pytest.importorskip("soundfile")
pytest.importorskip("librosa")

from app.analyzers.music import _clean, analyze_audio, analyze_song  # noqa: E402

SR = 22050


def _song(path, bpm, chords, dur=16.0):
    n = int(SR * dur)
    y = np.zeros(n)
    beat = 60 / bpm
    t = np.arange(n) / SR
    for i, ch in enumerate(chords * 20):
        s, e = int(i * 4 * beat * SR), int((i + 1) * 4 * beat * SR)
        if s >= n:
            break
        y[s:e] += sum(np.sin(2 * np.pi * f * t[s:e]) for f in ch) / len(ch) * 0.25
    k = 0
    while k * beat < dur:
        s, L = int(k * beat * SR), int(0.04 * SR)
        L = min(L, n - s)
        y[s : s + L] += np.random.RandomState(k).randn(L) * np.exp(-np.linspace(0, 8, L)) * 0.7
        k += 1
    sf.write(path, y * 0.6, SR)


C, F, G = [261.6, 329.6, 392.0], [349.2, 440.0, 523.3], [392.0, 493.9, 587.3]
Am, Dm, Em = [220.0, 261.6, 329.6], [293.7, 349.2, 440.0], [329.6, 392.0, 493.9]


def test_fast_major(tmp_path):
    p = tmp_path / "a.wav"
    _song(p, 128, [C, F, G, C])
    r = analyze_audio(str(p))
    assert abs(r["bpm"] - 128) < 4
    assert r["mode"] == "major"
    assert len(r["beats"]) > 20 and r["sections"][0] == 0.0


def test_slow_minor(tmp_path):
    p = tmp_path / "b.wav"
    _song(p, 70, [Am, Dm, Em, Am])
    r = analyze_audio(str(p))
    assert abs(r["bpm"] - 70) < 4
    assert r["mode"] == "minor"


def test_file_source_and_fallback(tmp_path):
    p = tmp_path / "song.wav"
    _song(p, 100, [C, G])
    r = analyze_song(None, str(p))
    assert r["source"] == "file" and r["audio_path"] == str(p)
    bad = tmp_path / "bad.mp3"
    bad.write_bytes(b"not audio")
    assert analyze_song(None, str(bad))["source"] == "fallback"
    assert analyze_song(None, None)["source"] == "fallback"


def test_clean_title():
    assert _clean("Кино - Группа крови (Official Video)") == "Кино - Группа крови"
    assert _clean("Song Name [HD] | Spotify") == "Song Name"
