from app.text_analysis import _grounded, fallback_analysis, normalize

TEXT = "Гуляли с мамой в осеннем парке. Пахло корицей, шуршали листья под ногами."


def test_fallback_finds_basics():
    ta, title, caption = fallback_analysis(TEXT)
    assert ta["season"] == "осень"
    assert "парк" in ta["places"]
    assert "мама" in ta["people"]
    assert 3 <= len(title.split()) <= 7
    assert caption


def test_hallucinated_details_dropped():
    data = {"mood": "уют", "energy": 0.3, "valence": 0.8, "season": "осень",
            "details": ["запах корицы", "шорох листьев", "шум прибоя"], "title": "Парк, корица и листья"}
    ta, title, _ = normalize(data, TEXT)
    assert "шум прибоя" not in ta["details"]
    assert "запах корицы" in ta["details"]


def test_normalize_clamps_and_validates():
    ta, title, _ = normalize({"energy": 7, "valence": "x", "season": "жара", "title": "Ок"}, TEXT)
    assert ta["energy"] == 1.0 and ta["valence"] == 0.5
    assert ta["season"] is None
    assert len(title.split()) >= 3  # короткое название заменено на правило


def test_grounded():
    assert _grounded("стук дождя", "по стеклу стучал дождь")
    assert not _grounded("запах моря", "сидели в офисе")
