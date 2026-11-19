"""Performance analysis of an account's historical posts.

Methodology (also returned to the caller in `AnalyticsReport.methodology`):

* Missing is not zero. A metric that Instagram did not return is `None` and is left out of every average.
* One denominator per account (reach, else views, else followers) so every rate means the same thing.
* Engagement = likes + comments, as a share of that denominator. Saves and shares are analysed as separate rates.
* Different formats are never compared on raw numbers. Each post gets a performance index: its engagement rate divided by
  the median rate of posts of the same format (1.0 = typical for that format). If a format has too few posts, the
  account-wide median is used and the index is labelled as such. Below the minimum sample there is no index at all.
* Findings need a minimum sample; confidence grows with sample size and is scaled down by data coverage.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from app.intelligence.engagement_analyzer import consistency_stats, halves_trend
from app.intelligence.format_analyzer import media_format
from app.intelligence.topic_extractor import extract_topics
from app.schemas.analytics import (
    AnalyticsReport,
    FormatBreakdown,
    MediaFormat,
    PostIn,
    PostScore,
    TimingBucket,
    TopicBreakdown,
)
from app.schemas.common import DataCoverage, Insight
from app.utils.dates import DAYS, as_aware, time_band
from app.utils.metrics import (
    available_metrics,
    choose_denominator,
    clean,
    engagement_rate,
    rate_of,
    safe_mean,
    safe_median,
    sample_confidence,
)

METHODOLOGY = [
    "A metric that is not available is left out of every calculation. It is never counted as zero.",
    "Engagement is likes + comments divided by one denominator per account: reach, else views, else followers.",
    "Posts are compared with the median post of the SAME format, so Reels are never compared with images on raw numbers.",
    "Where a format has too few posts, the account-wide median is used and the index is labelled account_wide (lower confidence).",
    "A finding is only reported when its sample reaches the minimum, and confidence is scaled down by data coverage.",
]


def _pct(x: float) -> str:
    return f"{x * 100:.1f}%"


def analyze_posts(
    profile_id: str,
    posts: list[PostIn],
    *,
    min_posts_per_format: int,
    min_posts_for_timing: int,
    min_posts_for_baseline: int,
    tz: ZoneInfo,
    now: datetime | None = None,
) -> AnalyticsReport:
    now = now or datetime.now(UTC)
    n = len(posts)
    warnings: list[str] = []
    if n == 0:
        return AnalyticsReport(
            profile_id=profile_id, generated_at=now, posts_analyzed=0, date_range=None, methodology=METHODOLOGY, baseline={}, data_coverage=DataCoverage.of(0, 0, "No posts were supplied."), insights=[], top_posts=[], lowest_posts=[], formats=[], topics=[], best_days=[], best_hours=[], warnings=["No posts were supplied, so there is nothing to analyse."]
        )
    ordered = sorted(posts, key=lambda p: as_aware(p.posted_at))

    basis = choose_denominator(ordered)
    rates = {p.media_id: engagement_rate(p, basis) for p in ordered}
    fmt_of = {p.media_id: media_format(p) for p in ordered}
    with_rate = [p for p in ordered if rates[p.media_id] is not None]
    coverage_rate = DataCoverage.of(n, len(with_rate), f"Engagement basis: {basis or 'none available'}.")
    if basis is None:
        warnings.append("No post has reach, views or a follower count, so engagement rates cannot be calculated.")
    elif len(with_rate) < n:
        warnings.append(f"{n - len(with_rate)} of {n} posts lack the data for an engagement rate and are excluded from rate-based findings.")

    # --- baselines
    fmt_median: dict[MediaFormat, float | None] = {}
    fmt_count: dict[MediaFormat, int] = defaultdict(int)
    for fmt in set(fmt_of.values()):
        values = [rates[p.media_id] for p in ordered if fmt_of[p.media_id] == fmt]
        fmt_count[fmt] = len(clean(values))
        fmt_median[fmt] = safe_median(values)
    account_rates = clean([rates[p.media_id] for p in ordered])
    account_median = safe_median(list(account_rates))
    baseline_ok = len(account_rates) >= min_posts_for_baseline
    if not baseline_ok:
        warnings.append(f"Only {len(account_rates)} posts have an engagement rate; at least {min_posts_for_baseline} are needed for a baseline. No performance index is given.")

    def index_for(p: PostIn) -> tuple[float | None, str]:
        rate = rates[p.media_id]
        fmt = fmt_of[p.media_id]
        if rate is None or not baseline_ok:  # too few posts overall: no index at all
            return None, "unavailable"
        if fmt_count[fmt] >= min_posts_per_format and fmt_median[fmt]:
            return round(rate / fmt_median[fmt], 3), "same_format"  # type: ignore[operator]
        if account_median:
            return round(rate / account_median, 3), "account_wide"
        return None, "unavailable"

    saves_rate = {p.media_id: rate_of(p.saves, p, basis) for p in ordered}
    shares_rate = {p.media_id: rate_of(p.shares, p, basis) for p in ordered}

    scores: list[PostScore] = []
    topics_of: dict[str, list[str]] = {}
    index_of: dict[str, float | None] = {}
    for p in ordered:
        idx, idx_basis = index_for(p)
        topics = extract_topics(p.caption)
        topics_of[p.media_id] = topics
        index_of[p.media_id] = idx
        scores.append(
            PostScore(media_id=p.media_id, permalink=p.permalink, posted_at=p.posted_at, format=fmt_of[p.media_id], topics=topics, engagement_rate=rates[p.media_id], engagement_basis=basis if rates[p.media_id] is not None else None, performance_index=idx, index_basis=idx_basis, metrics_available=available_metrics(p))
        )
    ranked = sorted((s for s in scores if s.performance_index is not None), key=lambda s: s.performance_index or 0, reverse=True)
    top_posts = ranked[:5]
    lowest = list(reversed(ranked[-5:])) if len(ranked) > 5 else []

    # --- breakdowns
    formats: list[FormatBreakdown] = []
    for fmt in sorted(fmt_count, key=lambda f: -sum(1 for v in fmt_of.values() if v == f)):
        group = [p for p in ordered if fmt_of[p.media_id] == fmt]
        formats.append(
            FormatBreakdown(format=fmt, posts=len(group), posts_with_engagement=fmt_count[fmt], median_engagement_rate=fmt_median[fmt], mean_performance_index=safe_mean([index_of[p.media_id] for p in group]), median_saves=safe_median([p.saves for p in group]), median_shares=safe_median([p.shares for p in group]), enough_data=fmt_count[fmt] >= min_posts_per_format)
        )
    topic_posts: dict[str, list[PostIn]] = defaultdict(list)
    for p in ordered:
        for t in topics_of[p.media_id]:
            topic_posts[t].append(p)
    topics = [
        TopicBreakdown(topic=t, posts=len(g), mean_performance_index=safe_mean([index_of[p.media_id] for p in g]), enough_data=len(clean([index_of[p.media_id] for p in g])) >= min_posts_per_format)
        for t, g in sorted(topic_posts.items(), key=lambda kv: -len(kv[1]))
    ]

    # --- timing (only with enough posts that have an index)
    days: list[TimingBucket] = []
    hours: list[TimingBucket] = []
    indexed = [p for p in ordered if index_of[p.media_id] is not None]
    if len(indexed) >= min_posts_for_timing:
        by_day: dict[str, list[float]] = defaultdict(list)
        by_band: dict[str, list[float]] = defaultdict(list)
        for p in indexed:
            local = as_aware(p.posted_at).astimezone(tz)
            by_day[DAYS[local.weekday()]].append(index_of[p.media_id])  # type: ignore[arg-type]
            by_band[time_band(local.hour)].append(index_of[p.media_id])  # type: ignore[arg-type]
        days = sorted((TimingBucket(label=k, posts=len(v), mean_performance_index=safe_mean(list(v))) for k, v in by_day.items() if len(v) >= 2), key=lambda b: -(b.mean_performance_index or 0))
        hours = sorted((TimingBucket(label=k, posts=len(v), mean_performance_index=safe_mean(list(v))) for k, v in by_band.items() if len(v) >= 2), key=lambda b: -(b.mean_performance_index or 0))
    else:
        warnings.append(f"Posting-time analysis needs at least {min_posts_for_timing} posts with an index; {len(indexed)} are available. No best day or time is given.")

    insights = _insights(ordered, formats, topics, topic_posts, index_of, saves_rate, shares_rate, days, hours, rates, basis, min_posts_per_format, min_posts_for_baseline, min_posts_for_timing, coverage_rate)

    baseline = {
        "engagement_basis": basis,
        "median_engagement_rate": account_median,
        "posts_with_rate": len(account_rates),
        "median_saves_rate": safe_median(list(saves_rate.values())),
        "median_shares_rate": safe_median(list(shares_rate.values())),
        "baseline_reliable": baseline_ok,
    }
    return AnalyticsReport(
        profile_id=profile_id, generated_at=now, posts_analyzed=n, date_range=(as_aware(ordered[0].posted_at), as_aware(ordered[-1].posted_at)), methodology=METHODOLOGY, baseline=baseline, data_coverage=coverage_rate, insights=insights, top_posts=top_posts, lowest_posts=lowest, formats=formats, topics=topics, best_days=days, best_hours=hours, warnings=warnings
    )


def _insights(posts, formats, topics, topic_posts, index_of, saves_rate, shares_rate, days, hours, rates, basis, min_fmt, min_base, min_timing, coverage) -> list[Insight]:
    out: list[Insight] = []
    n = len(posts)

    # 1. Best format, on engagement RATE (never raw views): needs two formats with enough data.
    solid = [f for f in formats if f.enough_data and f.median_engagement_rate is not None]
    solid.sort(key=lambda f: -(f.median_engagement_rate or 0))
    lift = ((solid[0].median_engagement_rate or 0) / (solid[1].median_engagement_rate or 1)) if len(solid) >= 2 else 0
    if len(solid) >= 2 and lift >= 1.15:  # a smaller lead is noise, not a finding
        best, runner = solid[0], solid[1]
        count = best.posts_with_engagement + runner.posts_with_engagement
        out.append(
            Insight.build("best_format", f"{best.format.value.title()} posts earn the highest engagement rate ({_pct(best.median_engagement_rate or 0)}), {lift:.1f}x the next format ({runner.format.value.title()}, {_pct(runner.median_engagement_rate or 0)}).", {"best_format": best.format.value, "best_median_rate": best.median_engagement_rate, "runner_up": runner.format.value, "runner_up_median_rate": runner.median_engagement_rate, "lift": round(lift, 2)}, sample_confidence(min(best.posts_with_engagement, runner.posts_with_engagement), min_fmt) * coverage.coverage_ratio, DataCoverage.of(n, count, f"Basis: {basis}"), "Compared on engagement rate (likes + comments over " + str(basis) + "), not raw views, because formats reach audiences differently.")
        )

    # 2 & 3. Strong and weak topics, on the format-adjusted index.
    scored_topics = [t for t in topics if t.enough_data and t.mean_performance_index is not None]
    if scored_topics:
        scored_topics.sort(key=lambda t: -(t.mean_performance_index or 0))
        top = scored_topics[0]
        if (top.mean_performance_index or 0) >= 1.15:
            out.append(
                Insight.build("top_topic", f"Posts about '{top.topic}' perform {((top.mean_performance_index or 1) - 1) * 100:.0f}% above your typical post for their format.", {"topic": top.topic, "mean_performance_index": top.mean_performance_index, "posts": top.posts}, sample_confidence(top.posts, min_fmt) * coverage.coverage_ratio, DataCoverage.of(n, len(clean([index_of[p.media_id] for p in topic_posts[top.topic]])), "Index is relative to the same format."), "The index divides each post's engagement rate by the median rate of its format, then averages over posts on this topic.")
            )
        weak = scored_topics[-1]
        if weak.topic != top.topic and (weak.mean_performance_index or 1) <= 0.85:
            out.append(
                Insight.build("weak_topic", f"Posts about '{weak.topic}' perform {(1 - (weak.mean_performance_index or 1)) * 100:.0f}% below your typical post for their format.", {"topic": weak.topic, "mean_performance_index": weak.mean_performance_index, "posts": weak.posts}, sample_confidence(weak.posts, min_fmt) * coverage.coverage_ratio, DataCoverage.of(n, weak.posts), "Same index method as top topics. A weak topic may still serve a goal other than engagement."))

    # 4 & 5. Best day and time band (already gated on sample size).
    if days and (days[0].mean_performance_index or 0) >= 1.1:
        out.append(Insight.build("best_day", f"{days[0].label} posts do best (index {days[0].mean_performance_index}).", {"day": days[0].label, "mean_performance_index": days[0].mean_performance_index, "posts": days[0].posts}, sample_confidence(sum(d.posts for d in days), min_timing) * 0.8, DataCoverage.of(n, sum(d.posts for d in days)), "Mean performance index by weekday, in the account's time zone. Each weekday needs at least two posts."))
    if hours and (hours[0].mean_performance_index or 0) >= 1.1:
        out.append(Insight.build("best_time_band", f"Posts in the {hours[0].label} band do best (index {hours[0].mean_performance_index}).", {"time_band": hours[0].label, "mean_performance_index": hours[0].mean_performance_index, "posts": hours[0].posts}, sample_confidence(sum(h.posts for h in hours), min_timing) * 0.8, DataCoverage.of(n, sum(h.posts for h in hours)), "Posting hour grouped into bands, in the account's time zone."))

    # 6. Performance over time.
    series = [index_of[p.media_id] for p in posts]
    trend = halves_trend(series)
    if trend is not None and len(clean(series)) >= min_base * 2:
        direction = "improved" if trend["change"] > 0.05 else "declined" if trend["change"] < -0.05 else "stayed steady"
        out.append(Insight.build("engagement_trend", f"Engagement has {direction}: {trend['change'] * 100:+.0f}% from the older half of your posts to the recent half.", {"older_half_mean_index": trend["first"], "recent_half_mean_index": trend["second"], "change": round(trend["change"], 3)}, sample_confidence(len(clean(series)) // 2, min_base) * 0.85, DataCoverage.of(n, len(clean(series))), "Mean performance index of the first half of posts (by date) against the second half."))

    # 7 & 8. Save-worthy and share-worthy topics.
    for key, rates_map, label in (("save_worthy", saves_rate, "saves"), ("share_worthy", shares_rate, "shares")):
        available = [(t, clean([rates_map[p.media_id] for p in g])) for t, g in topic_posts.items()]
        available = [(t, v) for t, v in available if len(v) >= min_fmt]
        overall = safe_median(list(rates_map.values()))
        if available and overall:
            t, v = max(available, key=lambda tv: safe_median(list(tv[1])) or 0)
            ratio = (safe_median(list(v)) or 0) / overall
            have = sum(1 for p in posts if rates_map[p.media_id] is not None)
            if ratio >= 1.3:
                out.append(Insight.build(f"{key}_topic", f"'{t}' content earns {ratio:.1f}x your typical {label} rate.", {"topic": t, f"median_{label}_rate": safe_median(list(v)), f"account_median_{label}_rate": overall, "ratio": round(ratio, 2)}, sample_confidence(len(v), min_fmt) * (have / len(posts)), DataCoverage.of(len(posts), have, f"{len(posts) - have} posts have no {label} figure and are excluded."), f"Median {label} per {basis} for posts on this topic against the median across all posts that report {label}."))

    # 9. Consistency.
    cons = consistency_stats([p.posted_at for p in posts])
    if cons is not None:
        text = f"You post about {cons['posts_per_week']:.1f} times a week; the longest gap was {cons['longest_gap_days']} days."
        out.append(Insight.build("consistency", text, {"posts_per_week": cons["posts_per_week"], "longest_gap_days": cons["longest_gap_days"], "span_weeks": cons["span_weeks"]}, 0.9 if n >= min_base else 0.5, DataCoverage.of(n, n), "Posts divided by the weeks between the first and last post, and the largest gap between consecutive posts."))

    # 10. Over-reliance on one topic.
    if n >= 8 and topics:
        biggest = topics[0]
        share = biggest.posts / n
        if share >= 0.4:
            out.append(Insight.build("repeated_topics", f"{share * 100:.0f}% of your posts are about '{biggest.topic}'. Consider widening the mix.", {"topic": biggest.topic, "posts": biggest.posts, "share": round(share, 2)}, 0.7, DataCoverage.of(n, sum(1 for p in posts if extract_topics(p.caption))), "Share of posts whose caption matches this topic. Captions with no recognised topic are not counted."))

    # 11. Recent performance.
    recent = clean([index_of[p.media_id] for p in posts[-5:]])
    if len(recent) >= 3:
        avg = sum(recent) / len(recent)
        out.append(Insight.build("recent_performance", f"Your last {len(recent)} indexed posts average {avg:.2f}x your typical post for their format.", {"recent_mean_index": round(avg, 3), "posts": len(recent)}, sample_confidence(len(recent) * 2, min_fmt) * 0.8, DataCoverage.of(min(5, n), len(recent)), "1.0 means typical for the format; above 1.0 is better."))
    return out
