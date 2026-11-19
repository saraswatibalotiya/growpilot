"""Trend and festival data sources: provenance, verification status, and never presenting sample data as real."""

import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.api.dependencies import build_container
from app.demos.runner import load_demo, make_container
from app.integrations.festivals.calendar import CONFIRMED_STATUSES, RULE_FIXED, SAMPLE, VERIFIED, fixed_date_festivals, load_verified_file
from app.integrations.trends.file_provider import FileTrendProvider, check_real_trend
from app.integrations.trends.provider_interface import EmptyTrendProvider, MockTrendProvider
from app.main import create_app
from app.schemas.recommendation import GenerateRequest, SignalName
from app.schemas.trend import Trend, TrendDirection
from app.services.festival_service import FestivalService
from tests.conftest import API, make_settings

TODAY = date(2026, 11, 17)


def real_trend(**kw):
    data = dict(trend_id="t1", title="Cloud kitchens in tier-2 cities", topic="cloud kitchens", description="Searches rose", category="FOOD", region="India", source_name="Licensed Search Data Co", source_url="https://data.example.org/report/1", source_type="SEARCH_INTEREST", first_observed_date="2026-10-20", verified_date="2026-11-10", expiry_date="2026-12-10", direction="RISING", evidence=["search interest up 40% over 3 weeks"], relevance_score=0.8, confidence_score=0.8)
    return data | kw


def write(tmp_path, records, name="trends.json"):
    p = tmp_path / name
    p.write_text(json.dumps(records), encoding="utf-8")
    return p


# ---------------------------------------------------------------- trends

def test_bundled_trends_are_always_marked_as_fictional_samples():
    trends = MockTrendProvider().list_trends()
    assert trends and all(t.is_sample and t.source_type.value == "SAMPLE" for t in trends)


def test_a_complete_sourced_trend_is_accepted_with_its_provenance(tmp_path):
    p = FileTrendProvider(write(tmp_path, [real_trend()]), today=TODAY)
    [t] = p.list_trends()
    assert not t.is_sample and t.direction == TrendDirection.RISING and t.first_observed_date == date(2026, 10, 20) and t.evidence and t.topic == "cloud kitchens"
    assert p.describe()["rejected"] == []


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"source_name": None}, "no source name"),
        ({"source_name": "  "}, "no source name"),
        ({"source_url": None}, "no source URL"),
        ({"source_url": "not a url"}, "no source URL"),
        ({"verified_date": None}, "no observation date"),
        ({"verified_date": "2026-12-30"}, "in the future"),
        ({"first_observed_date": "2026-11-12"}, "first observed after"),
        ({"is_sample": True}, "marked as sample"),
        ({"source_type": "SAMPLE"}, "marked as sample"),
    ],
)
def test_incomplete_or_sample_records_are_rejected_with_a_reason(tmp_path, change, reason):
    p = FileTrendProvider(write(tmp_path, [real_trend(), real_trend(trend_id="bad", **change)]), today=TODAY)
    assert [t.trend_id for t in p.list_trends()] == ["t1"]
    [rej] = p.describe()["rejected"]
    assert rej["record"] == "bad" and reason in rej["reason"]


def test_broken_files_are_reported_not_hidden(tmp_path):
    assert FileTrendProvider(tmp_path / "missing.json", today=TODAY).describe()["rejected"][0]["reason"].startswith("the trend data file does not exist")
    bad = tmp_path / "bad.json"
    bad.write_text("{nope", encoding="utf-8")
    assert "not valid JSON" in FileTrendProvider(bad, today=TODAY).describe()["rejected"][0]["reason"]
    assert "JSON list" in FileTrendProvider(write(tmp_path, {"a": 1}, "obj.json"), today=TODAY).describe()["rejected"][0]["reason"]
    junk = FileTrendProvider(write(tmp_path, [{"trend_id": "x"}, "text"], "junk.json"), today=TODAY)
    assert junk.list_trends() == [] and len(junk.describe()["rejected"]) == 2


def test_check_real_trend_directly():
    assert check_real_trend(Trend.model_validate(real_trend()), TODAY) is None


def trends_container(tmp_path, records, **extra):
    settings = make_settings(load_mock_data=False, trend_provider="file", trend_data_file=str(write(tmp_path, records)), **extra)
    return build_container(settings)


def test_a_real_trend_is_used_and_not_labelled_fictional(tmp_path):
    c = trends_container(tmp_path, [real_trend(category="FOOD", trend_id="food1", title="Regional thali revival", topic="thali", source_name="Real Data Co", verified_date="2026-11-12")])
    pid = load_demo(c, "restaurant")
    c.trends.provider = FileTrendProvider(tmp_path / "trends.json", today=TODAY)  # only the file's trends, not the demo's fictional ones
    recs, _ = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=TODAY, count=5))
    ev = [e for r in recs for e in r.supporting_evidence if e.signal == SignalName.TREND]
    assert ev and all("FICTIONAL" not in e.statement for e in ev) and any("Direction: rising" in e.statement for e in ev)
    assert all(e.metrics["is_sample"] == "False" for e in ev)


def test_sample_trend_evidence_says_it_is_fictional():
    c = make_container()
    pid = load_demo(c, "beauty_creator")
    recs, _ = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=TODAY, count=4))
    ev = [e for r in recs for e in r.supporting_evidence if e.signal == SignalName.TREND]
    assert ev and all("FICTIONAL SAMPLE" in e.statement and e.metrics["is_sample"] == "True" for e in ev)


def test_trends_are_contextual_to_the_profile_category(tmp_path):
    food, fashion = real_trend(trend_id="f", category="FOOD", title="Food thing", topic="food"), real_trend(trend_id="s", category="FASHION", title="Fashion thing", topic="fashion")
    c = trends_container(tmp_path, [food, fashion])
    r, t = load_demo(c, "restaurant"), load_demo(c, "travel_creator")
    c.trends.provider = FileTrendProvider(tmp_path / "trends.json", today=TODAY)
    assert {a.trend.trend_id for a in c.trends.current_for(r, TODAY)} == {"f"}  # restaurant: food only
    assert c.trends.current_for(t, TODAY) == []  # travel creator: neither food nor fashion


def test_no_trend_source_means_no_trend_is_ever_claimed():
    c = build_container(make_settings(load_mock_data=False, trend_provider="none"))
    assert isinstance(c.trends.provider, EmptyTrendProvider)
    pid = load_demo(c, "restaurant")
    c.trends.provider = EmptyTrendProvider()
    recs, notes = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=TODAY))
    assert any("No current, relevant trend" in n for n in notes) and all(r.score_breakdown.signals["trend"] is None for r in recs)


def test_file_provider_needs_a_file():
    with pytest.raises(ValueError):
        make_settings(trend_provider="file")


def test_trend_sources_endpoint_reports_rejections(tmp_path):
    settings = make_settings(load_mock_data=False, trend_provider="file", trend_data_file=str(write(tmp_path, [real_trend(), real_trend(trend_id="nosrc", source_url=None)])))
    client = TestClient(create_app(settings))
    info = client.get(f"{API}/trends/sources").json()["data"]
    assert info["provider"] == "file" and info["records"] == 1 and info["sample_records"] == 0 and info["rejected"][0]["record"] == "nosrc"
    sample = TestClient(create_app(make_settings(load_mock_data=False))).get(f"{API}/trends/sources").json()["data"]
    assert sample["provider"] == "sample" and sample["sample_records"] == sample["records"] > 0 and "FICTIONAL" in sample["note"]


# ---------------------------------------------------------------- festivals

def test_fixed_date_occasions_are_computed_for_any_year_and_marked_confirmed():
    for year in (2026, 2030, 2041):
        by_name = {f.name: f for f in fixed_date_festivals(year)}
        assert by_name["Republic Day"].date == date(year, 1, 26) and by_name["Christmas"].date == date(year, 12, 25) and by_name["Independence Day"].date == date(year, 8, 15)
        assert all(f.verification_status == RULE_FIXED and f.verification_status in CONFIRMED_STATUSES for f in by_name.values())


def test_moving_festivals_are_never_computed_or_guessed():
    svc = FestivalService.from_settings(make_settings())
    names_2030 = {f.name for f in svc.list(year=2030)}
    assert "Republic Day" in names_2030 and not names_2030 & {"Diwali", "Holi", "Navratri", "Dhanteras", "Eid"}
    cov = svc.coverage(2030)
    assert cov["verified_moving_festivals"] == 0 and any("Lunar-calendar festivals" in n and "not available" in n for n in cov["notes"])


def test_bundled_moving_festival_dates_are_never_called_confirmed():
    svc = FestivalService.from_settings(make_settings())
    diwali = next(f for f in svc.list(year=2026) if f.name == "Diwali")
    assert diwali.verification_status == SAMPLE and diwali.verification_status not in CONFIRMED_STATUSES and "Approximate" in (diwali.date_note or "")
    cov = svc.coverage(2026)
    assert any("NOT confirmed" in n for n in cov["notes"]) and cov["by_status"][SAMPLE] > 0 and cov["by_status"][RULE_FIXED] > 0


def test_the_better_record_wins_when_sources_overlap(tmp_path):
    verified = tmp_path / "f.json"
    verified.write_text(json.dumps([{"festival_id": "v_diwali", "name": "Diwali", "date": "2026-11-08", "year": 2026, "region": "All India", "category": "Major festival", "description": "d", "relevant_industries": ["food"], "relevant_content_themes": ["lights"], "source": "Ministry holiday list 2026", "verification_status": VERIFIED, "date_note": None}]), encoding="utf-8")
    svc = FestivalService(verified_file=str(verified), rule_dates=True)
    diwali = [f for f in svc.list(year=2026) if f.name == "Diwali"]
    assert len(diwali) == 1 and diwali[0].verification_status == VERIFIED and diwali[0].source == "Ministry holiday list 2026"
    christmas = [f for f in svc.list(year=2026) if f.name == "Christmas"]
    assert len(christmas) == 1 and christmas[0].verification_status == RULE_FIXED  # computed beats the sample
    assert svc.coverage(2026)["verified_moving_festivals"] == 1


@pytest.mark.parametrize(
    "change,reason",
    [
        ({"verification_status": SAMPLE}, "must be VERIFIED_SOURCE"),
        ({"source": ""}, "real source"),
        ({"source": "Bundled sample dataset"}, "real source"),
        ({"source": "approximate list"}, "real source"),
        ({"year": 2027}, "year does not match"),
    ],
)
def test_a_verified_file_can_not_smuggle_in_unverified_dates(tmp_path, change, reason):
    rec = {"festival_id": "x", "name": "Holi", "date": "2026-03-04", "year": 2026, "region": "All India", "category": "Major festival", "description": "d", "relevant_industries": [], "relevant_content_themes": [], "source": "Official calendar", "verification_status": VERIFIED, "date_note": None} | change
    p = tmp_path / "f.json"
    p.write_text(json.dumps([rec]), encoding="utf-8")
    ok, bad = load_verified_file(p)
    assert ok == [] and reason in bad[0]["reason"]


def test_festival_file_problems_are_reported(tmp_path):
    assert "does not exist" in load_verified_file(tmp_path / "no.json")[1][0]["reason"]
    p = tmp_path / "x.json"
    p.write_text("[1, {}]", encoding="utf-8")
    assert len(load_verified_file(p)[1]) == 2


def test_hiding_the_sample_removes_every_approximate_date():
    svc = FestivalService.from_settings(make_settings(festival_include_sample=False))
    assert all(f.verification_status == RULE_FIXED for f in svc.list(year=2026))
    assert "Diwali" not in {f.name for f in svc.list(year=2026)}


def test_recommendations_warn_only_when_the_festival_date_is_unconfirmed():
    c = make_container()
    pid = load_demo(c, "restaurant")
    near_christmas, _ = c.recommendations.generate(GenerateRequest(profile_id=pid, as_of=date(2026, 12, 10), count=5))
    xmas = next(r for r in near_christmas if "Christmas" in r.title)
    assert not any("NOT confirmed" in x for x in xmas.risks_and_caveats)  # fixed date: confirmed
    assert any("date confirmed" in e.statement for e in xmas.supporting_evidence)
    c2 = make_container()
    pid2 = load_demo(c2, "beauty_creator")
    recs, _ = c2.recommendations.generate(GenerateRequest(profile_id=pid2, as_of=date(2026, 10, 5), count=5))
    moving = [r for r in recs if "festival_driven" in r.tags]
    assert moving and all(any("NOT confirmed" in x for x in r.risks_and_caveats) for r in moving)  # Navratri: sample date
    assert all(any("NOT confirmed" in e.statement for e in r.supporting_evidence if e.signal == SignalName.FESTIVAL) for r in moving)


def test_festival_coverage_endpoint():
    client = TestClient(create_app(make_settings(load_mock_data=False)))
    cov = client.get(f"{API}/festivals/coverage", params={"year": 2026}).json()["data"]
    assert cov["year"] == 2026 and cov["by_status"] and any("NOT confirmed" in n for n in cov["notes"])
    assert client.get(f"{API}/festivals/coverage", params={"year": 1800}).status_code == 422
    listed = client.get(f"{API}/festivals", params={"year": 2026}).json()["data"]
    assert {f["verification_status"] for f in listed} == {RULE_FIXED, SAMPLE}


def test_the_bundled_official_calendar_for_2027_is_confirmed_and_names_its_source():
    from app.services.festival_service import FestivalService

    service = FestivalService(rule_dates=True, bundled_verified=True)
    diwali = next(f for f in service.list(year=2027) if f.name == "Diwali")
    assert str(diwali.date) == "2027-10-29" and diwali.verification_status == "VERIFIED_SOURCE" and "dopt.gov.in" in diwali.source
    eid = next(f for f in service.list(year=2027) if f.name == "Id-ul-Fitr")
    assert "moon sighting" in eid.date_note
    assert service.coverage(2027)["verified_moving_festivals"] >= 25
    off = FestivalService(rule_dates=True, bundled_verified=False)
    assert all(f.verification_status != "VERIFIED_SOURCE" for f in off.list(year=2027))  # FESTIVAL_INCLUDE_BUNDLED_VERIFIED=false removes them


def test_every_bundled_verified_record_passes_the_verification_rules():
    from app.integrations.festivals.calendar import load_verified_file
    from app.services.festival_service import BUNDLED_VERIFIED

    assert BUNDLED_VERIFIED
    for path in BUNDLED_VERIFIED:
        ok, bad = load_verified_file(path)
        assert ok and not bad, bad
