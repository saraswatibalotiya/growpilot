"""Regression tests for classification mistakes found while validating the demo datasets."""

import pytest

from app.intelligence.topic_extractor import extract_topics
from app.recommendation.candidate_generator import labels_of
from app.recommendation.diversity import select_diverse
from app.schemas.profile import ContentFormat
from tests.unit.test_recommendation_engine import _cand


@pytest.mark.parametrize(
    "caption,present,absent",
    [
        ("Honest review of a budget serum #review #serum", ["product review"], ["budget travel"]),  # "budget" alone is not travel
        ("Worth it? A drugstore foundation on a budget #review", ["product review"], ["budget travel"]),
        ("Goa in 8000 rupees: full breakdown #budgettravel", ["budget travel"], []),
        ("Weekend getaway under 5000 #budgettravel #costbreakdown", ["budget travel"], []),
        ("Packing mistakes to avoid #traveltips #packing", ["travel tips"], ["myths"]),  # "mistakes" alone is not a myth
        ("5 myths to stop believing about your face #myths", ["myths"], []),
        ("Sunday thali special #thali #punefood", ["regional food"], ["menu"]),  # "special" alone is not a menu
        ("Festive family menu is live #festivemenu #pune", ["festive menu", "menu"], ["festive wear"]),  # a menu is not an outfit
        ("Our new festive collection is here #festive #kurti", ["festive wear"], ["festive menu"]),
        ("5 ways to style one kurta #styling #ootd", ["styling", "ethnic wear"], []),  # kurta is ethnic wear
        ("Weekday deal: lunch plus a sweet #deal", ["offers"], ["regional food"]),
    ],
)
def test_caption_topics(caption, present, absent):
    found = extract_topics(caption)
    for t in present:
        assert t in found, (caption, found)
    for t in absent:
        assert t not in found, (caption, found)


def test_candidate_labels_come_from_the_subject_not_template_wording():
    """The word "routine" is in every beauty idea's template; it must not make every idea a skincare idea."""
    assert "skincare" not in labels_of("makeup")
    assert "skincare" in labels_of("skincare")
    assert labels_of("makeup") >= {"makeup"}


def test_same_kind_of_idea_in_the_same_format_is_not_offered_twice():
    a = _cand("By request: alpha", "alpha", ContentFormat.TUTORIAL, "audience_request", 90)
    b = _cand("By request: bravo", "bravo", ContentFormat.TUTORIAL, "audience_request", 89)
    c = _cand("Part two: charlie", "charlie", ContentFormat.REEL, "historical", 50)
    d = _cand("Price list", "delta", ContentFormat.CAROUSEL, "audience_question", 40)
    chosen, _ = select_diverse([a, b, c, d], 3)
    assert {x.title for x in chosen} == {"By request: alpha", "Part two: charlie", "Price list"}


def test_a_close_relevant_festival_keeps_a_place_but_a_far_one_does_not():
    def festival(days):
        f = _cand(f"Festival in {days}", "fest", ContentFormat.CAROUSEL, "festival", 10)
        f.seed.strength, f.seed.extra["days_until"], f.festival_name = 1.0, days, "Fest"
        return f

    others = [_cand(f"idea {i}", name, fmt, kind, 80 - i) for i, (name, fmt, kind) in enumerate([("alpha", ContentFormat.REEL, "historical"), ("bravo", ContentFormat.CAROUSEL, "audience_question"), ("charlie", ContentFormat.TUTORIAL, "audience_request"), ("delta", ContentFormat.STORY, "trend")])]
    close, _ = select_diverse([*others, festival(10)], 4)
    far, _ = select_diverse([*others, festival(40)], 4)
    assert any(c.title == "Festival in 10" for c in close)
    assert not any(c.title == "Festival in 40" for c in far)
