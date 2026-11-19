"""Reads a competitor's PUBLIC posts and compares them with the user's own content.

Only public signals are used: captions, dates, media type, and publicly visible likes and comments. Views, reach, saves and
shares of another account are not available, and the analysis never pretends otherwise. Public likes depend on the other
account's size, so they are never compared in absolute terms with the user's own.
"""

import re
from collections import Counter
from datetime import date, datetime, time
from statistics import mean, median

from app.intelligence.format_analyzer import format_from
from app.intelligence.topic_extractor import extract_topics
from app.schemas.analytics import MediaFormat
from app.schemas.competitor import Activity, Competitor, CompetitorInsights, CompetitorObservation, FormatEngagement, ThemeCoverage
from app.utils.dates import as_aware
from app.utils.metrics import clean, sample_confidence

_HASHTAG = re.compile(r"#(\w{2,40})", re.UNICODE)
ACTIVE_DAYS = 21  # posted within the last 3 weeks
SLOWING_DAYS = 60
LOW_COVERAGE_YOU = 0.10  # you post about it in under 10% of your posts...
HIGH_COVERAGE_THEM = 0.20  # ...while it is at least 20% of theirs
MIN_OWN_POSTS_FOR_GAPS = 5  # below this, "you have little on it" can not be said honestly

NOT_AVAILABLE = ["views", "reach", "saves", "shares", "audience demographics", "private insights"]


def analyze_competitor(competitor: Competitor, *, my_topics: Counter[str], my_formats: Counter[MediaFormat], my_posts_per_week: float | None = None, minimum: int = 5, as_of: date | None = None, my_total_posts: int | None = None) -> CompetitorInsights:
    posts = competitor.public_posts
    n = len(posts)
    extra = dict(data_source=competitor.data_source, as_of=as_of)
    caveats = ["Based only on this competitor's public posts. Their private insights are not available to anyone else."]
    if n == 0:
        return CompetitorInsights(competitor_id=competitor.competitor_id, username=competitor.username, posts_analyzed=0, posts_per_week=None, format_mix={}, top_topics=[], avg_public_likes=None, avg_public_comments=None, metrics_not_available=NOT_AVAILABLE, observations=[], uncovered_by_you=[], differentiation_opportunities=[], caveats=caveats + ["No public posts were supplied, so there is nothing to analyse."], **extra)
    if n < minimum:
        caveats.append(f"Only {n} public posts (fewer than {minimum}). Observations are tentative.")

    formats = Counter(format_from(p.media_type) for p in posts)
    topic_lists = [extract_topics(p.caption) for p in posts]
    topics = Counter(t for ts in topic_lists for t in ts)
    dates = sorted(as_aware(p.posted_at) for p in posts)
    span_weeks = max((dates[-1] - dates[0]).days, 1) / 7
    per_week = round(n / span_weeks, 2) if n >= 3 else None
    likes = clean([p.likes for p in posts])
    comments = clean([p.comments for p in posts])
    not_available = list(NOT_AVAILABLE)
    if not likes:
        not_available.append("likes (hidden or missing)")
    if not comments:
        not_available.append("comments (hidden or missing)")

    conf = sample_confidence(n, minimum) or 0.3
    observations: list[CompetitorObservation] = []

    top_format, top_count = formats.most_common(1)[0]
    share = top_count / n
    # A public post only says VIDEO; it can't say whether it is a Reel. So video and Reels are compared together.
    mine_count = my_formats[top_format] + (my_formats[MediaFormat.REEL] if top_format == MediaFormat.VIDEO else 0)
    mine_share = (mine_count / sum(my_formats.values())) if sum(my_formats.values()) else None
    opp = None
    if mine_share is not None and share - mine_share >= 0.2 and top_format != MediaFormat.UNKNOWN:
        label = "Video or Reel" if top_format == MediaFormat.VIDEO else top_format.value.title()
        opp = f"{label} is {share * 100:.0f}% of their posts but {mine_share * 100:.0f}% of yours. Worth testing more of it."
    observations.append(CompetitorObservation(observation=f"Most of their posts are {'Video or Reel' if top_format == MediaFormat.VIDEO else top_format.value.title()} ({share * 100:.0f}%).", evidence=[f"{c} of {n} public posts are {f.value}" for f, c in formats.most_common(3)], opportunity=opp, confidence=round(conf, 2)))

    repeated = [t for t, c in topics.most_common(4) if c >= 2]
    uncovered = [t for t in repeated if my_topics.get(t, 0) == 0]
    if repeated:
        observations.append(CompetitorObservation(observation="They keep returning to " + ", ".join(repeated) + ".", evidence=[f"'{t}' appears in {topics[t]} of {n} posts" for t in repeated], opportunity=("You have not posted about " + ", ".join(uncovered) + ", which they cover repeatedly.") if uncovered else "You already cover their main topics.", confidence=round(conf * 0.9, 2)))

    if per_week is not None:
        diff = None
        if my_posts_per_week:
            ratio = per_week / my_posts_per_week
            diff = f"They post {ratio:.1f}x as often as you ({per_week:.1f} vs {my_posts_per_week:.1f} a week)." if ratio >= 1.3 else None
        observations.append(CompetitorObservation(observation=f"They post about {per_week:.1f} times a week.", evidence=[f"{n} posts over {span_weeks:.1f} weeks"], opportunity=diff, confidence=round(conf, 2)))

    paired = [(ts, p.likes) for ts, p in zip(topic_lists, posts, strict=True) if p.likes is not None and ts]
    if len(paired) >= 4:
        by_topic: dict[str, list[int]] = {}
        for ts, lk in paired:
            for t in ts:
                by_topic.setdefault(t, []).append(lk)
        ranked = [(t, mean(v), len(v)) for t, v in by_topic.items() if len(v) >= 2]
        if ranked:
            t, avg, cnt = max(ranked, key=lambda r: r[1])
            observations.append(CompetitorObservation(observation=f"Their '{t}' posts get the most public likes (about {avg:.0f} on average).", evidence=[f"{cnt} posts on '{t}' with visible likes"], opportunity=None, confidence=round(conf * 0.6, 2)))
            caveats.append("Public likes depend on how large their audience is. Compare topics within their account, never their likes against yours.")

    strengths = [t for t, c in my_topics.most_common(5) if c >= 2 and topics.get(t, 0) == 0]
    diff_ops: list[str] = []
    diff_ops += [f"'{t}' is something you post about and they do not: a point of difference." for t in strengths]
    diff_ops += [f"Cover '{t}': they do it repeatedly and you have not yet." for t in uncovered]
    if not diff_ops:
        diff_ops.append("No clear gap found in the public posts supplied. Add more public posts for a better comparison.")

    # --- activity, hashtags, format engagement, theme coverage (all from public data only)
    last = dates[-1]
    activity = Activity.UNKNOWN
    if as_of is not None:
        age = (datetime.combine(as_of, time.max, tzinfo=last.tzinfo) - last).days
        activity = Activity.ACTIVE if age <= ACTIVE_DAYS else Activity.SLOWING if age <= SLOWING_DAYS else Activity.INACTIVE
    hashtag_counts = Counter(h.lower() for p in posts for h in set(_HASHTAG.findall(p.caption or "")))
    top_hashtags = [f"#{h}" for h, c in hashtag_counts.most_common(5) if c >= 2]
    format_engagement = []
    for fmt, count in formats.most_common():
        interactions = [p.likes + p.comments for p in posts if format_from(p.media_type) == fmt and p.likes is not None and p.comments is not None]
        format_engagement.append(FormatEngagement(format=fmt, posts=count, posts_with_public_metrics=len(interactions), median_public_interactions=round(median(interactions), 1) if interactions else None))
    my_total = my_total_posts if my_total_posts is not None else sum(my_topics.values())
    themes = [ThemeCoverage(topic=t, competitor_posts=c, competitor_share=round(c / n, 3), your_posts=my_topics.get(t, 0), your_share=round(my_topics.get(t, 0) / my_total, 3) if my_total else None) for t, c in topics.most_common() if c >= 2]
    low_coverage = [th.topic for th in themes if my_total >= MIN_OWN_POSTS_FOR_GAPS and th.competitor_share >= HIGH_COVERAGE_THEM and th.your_share is not None and th.your_share < LOW_COVERAGE_YOU]
    if activity == Activity.INACTIVE:
        caveats.append(f"Their last public post was more than {SLOWING_DAYS} days before the evaluation date, so their activity may be out of date.")
    if my_total < MIN_OWN_POSTS_FOR_GAPS:
        caveats.append(f"You have fewer than {MIN_OWN_POSTS_FOR_GAPS} posts, so gaps in your own coverage can not be judged yet.")

    return CompetitorInsights(competitor_id=competitor.competitor_id, username=competitor.username, last_post_at=last, activity=activity, top_hashtags=top_hashtags, format_engagement=format_engagement, themes=themes, low_coverage_topics=low_coverage, **extra, posts_analyzed=n, posts_per_week=per_week, format_mix=dict(formats), top_topics=[t for t, _ in topics.most_common(5)], avg_public_likes=round(mean(likes), 1) if likes else None, avg_public_comments=round(mean(comments), 1) if comments else None, metrics_not_available=not_available, observations=observations, uncovered_by_you=uncovered, differentiation_opportunities=diff_ops, caveats=caveats)
