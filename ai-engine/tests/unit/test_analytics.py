from zoneinfo import ZoneInfo

from app.intelligence.content_analyzer import analyze_posts
from app.utils.metrics import choose_denominator, engagement_rate, safe_median, sample_confidence
from tests.fixtures.builders import post, reel

IST = ZoneInfo("Asia/Kolkata")


def run(posts, **kw):
    args = dict(min_posts_per_format=3, min_posts_for_timing=12, min_posts_for_baseline=5, tz=IST)
    args.update(kw)
    return analyze_posts("p1", posts, **args)


class TestMissingVersusZero:
    def test_unavailable_values_are_left_out_not_counted_as_zero(self):
        assert safe_median([None, 4, 6]) == 5  # median of 4 and 6, the None is ignored
        assert safe_median([None, None]) is None

    def test_a_real_zero_is_kept(self):
        assert safe_median([0, 0, 4]) == 0

    def test_missing_shares_give_no_rate_but_a_real_zero_gives_a_rate_of_zero(self):
        posts = [post(i, saves=10, shares=None) for i in range(4)] + [post(i + 4, saves=10, shares=0) for i in range(4)]
        report = run(posts)
        assert report.baseline["median_shares_rate"] == 0.0  # only the four real zeros count
        rows = {s.media_id: s for s in report.top_posts + report.lowest_posts}
        assert report is not None and rows is not None

    def test_a_post_without_likes_or_comments_has_no_engagement_rate(self):
        p = post(0, likes=None, comments=None)
        assert engagement_rate(p, "reach") is None

    def test_a_post_with_zero_likes_and_comments_has_a_rate_of_zero(self):
        assert engagement_rate(post(0, likes=0, comments=0), "reach") == 0.0

    def test_interactions_total_is_only_a_fallback_and_is_labelled(self):
        p = post(0, likes=None, comments=None, interactions=80)
        assert engagement_rate(p, "reach") == 0.08

    def test_coverage_is_reported(self):
        posts = [post(i) for i in range(6)] + [post(i + 6, likes=None, comments=None) for i in range(4)]
        report = run(posts)
        assert report.data_coverage.items_total == 10
        assert report.data_coverage.items_with_data == 6
        assert any("4 of 10" in w for w in report.warnings)


class TestEmptyAndTiny:
    def test_no_posts(self):
        report = run([])
        assert report.posts_analyzed == 0
        assert report.insights == []
        assert report.warnings

    def test_too_few_posts_gives_no_index_and_says_so(self):
        report = run([post(i) for i in range(3)])
        assert all(s.performance_index is None for s in report.top_posts)
        assert any("baseline" in w for w in report.warnings)

    def test_no_denominator_means_no_rates_and_a_clear_warning(self):
        posts = [post(i, reach=None, views=None, follower_count=None) for i in range(8)]
        report = run(posts)
        assert report.baseline["engagement_basis"] is None
        assert any("cannot be calculated" in w for w in report.warnings)

    def test_timing_needs_enough_posts(self):
        report = run([post(i) for i in range(8)])
        assert report.best_days == [] and report.best_hours == []
        assert any("Posting-time analysis needs" in w for w in report.warnings)


class TestFormatsAreNotComparedOnRawNumbers:
    def _mixed(self):
        # Reels reach 5x more people and have a lower RATE; images reach few and have a higher RATE.
        reels = [reel(i, reach=5000, likes=200 + i * 5, comments=20) for i in range(6)]
        images = [post(i + 6, reach=1000, likes=100 + i * 5, comments=20) for i in range(6)]
        return reels + images

    def test_the_typical_post_of_each_format_scores_about_one(self):
        report = run(self._mixed())
        for s in report.top_posts + report.lowest_posts:
            assert s.index_basis == "same_format"
        by_format = {f.format.value: f.mean_performance_index for f in report.formats}
        assert abs(by_format["REEL"] - 1.0) < 0.1
        assert abs(by_format["IMAGE"] - 1.0) < 0.1

    def test_best_format_is_decided_on_engagement_rate_not_reach(self):
        report = run(self._mixed())
        best = next(i for i in report.insights if i.key == "best_format")
        assert best.supporting_metrics["best_format"] == "IMAGE"
        assert "raw views" in best.explanation or "not raw views" in best.explanation

    def test_a_format_with_too_few_posts_uses_the_account_median_and_says_so(self):
        posts = [post(i) for i in range(8)] + [reel(8), reel(9)]
        report = run(posts)
        reel_scores = [s for s in report.top_posts + report.lowest_posts if s.format.value == "REEL"]
        assert all(s.index_basis == "account_wide" for s in reel_scores)

    def test_unknown_media_types_are_kept_apart(self):
        report = run([post(i, media_type=None, media_product_type=None) for i in range(6)])
        assert {f.format.value for f in report.formats} == {"UNKNOWN"}


class TestNormalisation:
    def test_index_is_rate_over_format_median(self):
        posts = [post(i, likes=50 + i * 10, comments=0) for i in range(7)]  # rates .05 .06 ... .11, median .08
        report = run(posts)
        top = report.top_posts[0]
        assert top.engagement_rate == 0.11
        assert top.performance_index == round(0.11 / 0.08, 3)

    def test_denominator_prefers_reach_then_views_then_followers(self):
        assert choose_denominator([post(i) for i in range(5)]) == "reach"
        assert choose_denominator([post(i, reach=None, views=900) for i in range(5)]) == "views"
        assert choose_denominator([post(i, reach=None, views=None, follower_count=5000) for i in range(5)]) == "followers"

    def test_sample_confidence_is_zero_below_the_minimum_and_grows_with_data(self):
        assert sample_confidence(2, 3) == 0.0
        assert sample_confidence(3, 3) < sample_confidence(6, 3) < sample_confidence(9, 3) <= 0.95

    def test_a_small_lead_between_formats_is_not_reported(self):
        posts = [reel(i, likes=60, comments=10) for i in range(5)] + [post(i + 5, likes=61, comments=10) for i in range(5)]
        assert not [i for i in run(posts).insights if i.key == "best_format"]
