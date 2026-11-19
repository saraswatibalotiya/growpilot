from datetime import date

import pytest

from app.core.config import Settings
from app.integrations.trends.provider_interface import MockTrendProvider
from app.intelligence.trend_analyzer import assess_trend, profile_industries
from app.repositories.memory import InMemoryStore
from app.schemas.profile import ProfileCreate
from app.schemas.trend import Freshness, Trend, TrendAnalyzeRequest, TrendCategory, TrendKind
from app.services.festival_service import FestivalService
from app.services.trend_service import TrendService

DAY = date(2026, 10, 5)


def trend(**kw) -> Trend:
    data = dict(trend_id="t", title="T", description="d", category=TrendCategory.FASHION, region="India", source_name="Src", source_url="https://example.com/x", verified_date=date(2026, 10, 1), expiry_date=date(2026, 12, 1), relevance_score=0.8, confidence_score=0.7)
    data.update(kw)
    return Trend(**data)


class TestFreshness:
    def test_a_sourced_recent_unexpired_trend_is_current(self):
        a = assess_trend(trend(), None, DAY, 14)
        assert a.freshness == Freshness.FRESH and a.usable_as_current

    def test_an_expired_trend_is_never_current(self):
        a = assess_trend(trend(expiry_date=date(2026, 9, 30)), None, DAY, 14)
        assert a.freshness == Freshness.EXPIRED and not a.usable_as_current

    def test_a_trend_verified_too_long_ago_is_stale(self):
        a = assess_trend(trend(verified_date=date(2026, 8, 1)), None, DAY, 14)
        assert a.freshness == Freshness.STALE and not a.usable_as_current and "days ago" in " ".join(a.reasons)

    def test_the_age_limit_is_configurable(self):
        t = trend(verified_date=date(2026, 9, 25))  # 10 days before DAY
        assert assess_trend(t, None, DAY, 14).usable_as_current
        assert not assess_trend(t, None, DAY, 7).usable_as_current

    def test_a_trend_with_no_source_is_not_a_trend(self):
        for t in (trend(source_name=None), trend(source_url=None)):
            a = assess_trend(t, None, DAY, 14)
            assert a.freshness == Freshness.UNVERIFIED and not a.usable_as_current and "source" in " ".join(a.reasons)

    def test_a_hypothesis_is_never_presented_as_current(self):
        a = assess_trend(trend(kind=TrendKind.HYPOTHESIS), None, DAY, 14)
        assert not a.usable_as_current and "hypothesis" in " ".join(a.reasons)

    def test_no_verification_date_means_unverified(self):
        assert assess_trend(trend(verified_date=None), None, DAY, 14).freshness == Freshness.UNVERIFIED

    def test_a_trend_that_has_not_started_is_upcoming_not_current(self):
        a = assess_trend(trend(starts_on=date(2026, 10, 20)), None, DAY, 14)
        assert a.freshness == Freshness.UPCOMING and not a.usable_as_current

    def test_something_verified_after_the_evaluation_day_was_not_known_then(self):
        assert assess_trend(trend(verified_date=date(2026, 10, 9)), None, DAY, 14).freshness == Freshness.UNVERIFIED


class TestRelevance:
    @pytest.fixture
    def boutique(self):
        return ProfileCreate(profile_type="BUSINESS", name="B", category="ethnic clothing", niche="fashion", country="India", city="Mumbai", region="Maharashtra", products=["kurtis"])

    def _profile(self, data):
        store = InMemoryStore()
        return store.create(data, profile_id="p1")

    def test_industries_are_read_from_category_niche_and_products(self, boutique):
        assert "fashion" in profile_industries(self._profile(boutique))

    def test_a_matching_category_scores_higher_than_a_different_one(self, boutique):
        p = self._profile(boutique)
        fashion = assess_trend(trend(category=TrendCategory.FASHION), p, DAY, 14).profile_relevance
        food = assess_trend(trend(category=TrendCategory.FOOD), p, DAY, 14).profile_relevance
        assert fashion > food

    def test_a_global_trend_is_scored_below_an_india_trend(self, boutique):
        p = self._profile(boutique)
        assert assess_trend(trend(region="Global"), p, DAY, 14).profile_relevance < assess_trend(trend(region="India"), p, DAY, 14).profile_relevance

    def test_a_trend_for_another_state_is_scored_low(self, boutique):
        p = self._profile(boutique)
        assert assess_trend(trend(region="Kerala"), p, DAY, 14).profile_relevance < 0.4

    def test_a_trend_in_the_profiles_own_city_is_fully_relevant(self, boutique):
        p = self._profile(boutique)
        assert assess_trend(trend(region="Mumbai"), p, DAY, 14).profile_relevance == pytest.approx(0.8, abs=0.01)


class TestTrendService:
    @pytest.fixture
    def service(self):
        store = InMemoryStore()
        store.create(ProfileCreate(profile_type="BUSINESS", name="B", category="ethnic clothing", niche="fashion", country="India"), profile_id="p1")
        return TrendService(store, MockTrendProvider(), Settings(environment="test"))

    def test_on_the_demo_day_relevant_current_trends_are_found(self, service):
        out = service.analyze(TrendAnalyzeRequest(profile_id="p1", as_of=DAY))
        ids = {a.trend.trend_id for a in out.current}
        assert "trend_diwali_outfits" in ids
        assert all(a.usable_as_current for a in out.current)

    def test_expired_stale_and_unsourced_trends_never_appear_as_current(self, service):
        out = service.analyze(TrendAnalyzeRequest(profile_id="p1", as_of=DAY, include_stale=True))
        current = {a.trend.trend_id for a in out.current}
        assert not current & {"trend_old_audio", "trend_stale_makeup", "trend_unsourced_ai_guess"}
        assert {a.trend.trend_id for a in out.excluded} >= {"trend_old_audio", "trend_stale_makeup", "trend_unsourced_ai_guess"}

    def test_on_a_later_day_nothing_is_current_and_the_engine_says_so(self, service):
        out = service.analyze(TrendAnalyzeRequest(profile_id="p1", as_of=date(2026, 11, 17)))
        assert out.current == []
        assert any("No current, relevant trend" in n for n in out.notes)

    def test_trends_for_another_industry_are_not_listed_for_this_profile(self, service):
        ids = {a.trend.trend_id for a in service.analyze(TrendAnalyzeRequest(profile_id="p1", as_of=DAY)).current}
        assert "trend_street_food_trails" not in ids and "trend_budget_skincare" not in ids

    def test_the_listing_hides_unusable_trends_unless_asked(self, service):
        shown = service.list(category=None, region=None, as_of=DAY, include_stale=False)
        everything = service.list(category=None, region=None, as_of=DAY, include_stale=True)
        assert all(a.usable_as_current for a in shown) and len(everything) > len(shown)

    def test_region_filter(self, service):
        assert {a.trend.region for a in service.list(category=None, region="Global", as_of=DAY, include_stale=True)} == {"Global"}

    def test_upcoming_lists_trends_that_have_not_started(self, service):
        out = service.upcoming(as_of=DAY, days=30, category=None)
        assert [a.trend.trend_id for a in out] == ["trend_winter_trips"]


class TestFestivals:
    @pytest.fixture
    def service(self):
        return FestivalService()

    def test_records_are_structured_and_clearly_labelled_as_sample(self, service):
        f = service.list()
        assert f and all(x.verification_status == "SAMPLE_UNVERIFIED" and x.source and x.relevant_industries for x in f)
        assert any(x.date_note and "Approximate" in x.date_note for x in f)

    def test_upcoming_only_includes_the_window(self, service):
        out = service.upcoming(as_of=DAY, days=20)
        assert out and all(0 <= u.days_until <= 20 for u in out)
        assert [u.festival.name for u in out][0] == "Navratri"

    def test_filtering_by_industry_and_year(self, service):
        assert all("jewellery" in f.relevant_industries for f in service.list(industry="jewellery"))
        assert all(f.year == 2027 for f in service.list(year=2027))

    def test_relevance_reflects_the_profile_industry_and_place(self, service):
        store = InMemoryStore()
        p = store.create(ProfileCreate(profile_type="BUSINESS", name="B", category="ethnic clothing", niche="fashion", country="India", region="Maharashtra", city="Mumbai"), profile_id="p1")
        out = {u.festival.name: u for u in service.upcoming(as_of=DAY, days=50, profile=p)}
        assert out["Diwali"].relevance > out["Dhanteras"].relevance  # fashion vs jewellery/retail
        assert out["Durga Puja"].relevance < out["Dussehra"].relevance  # West Bengal vs all India

    def test_a_missing_data_file_gives_an_empty_list_not_a_crash(self, tmp_path):
        assert FestivalService(tmp_path / "nope.json").list() == []
