"""Collects evidence-backed seeds from every data source, builds candidates from them with the right strategy, and attaches the
six signals to each candidate.

Signal semantics (this is the rule that keeps missing data from acting as a penalty):

* `None`  - the source does not exist at all (no analytics supplied, no current trend, no upcoming festival...). The signal is
            left out of the score and the remaining weights are renormalised.
* `0.0`   - the source exists and genuinely offers no support for this idea.
* `0..1`  - how strongly the source supports it.
"""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

from app.intelligence.topic_extractor import extract_topics
from app.recommendation.models import Candidate, Seed, Signals
from app.recommendation.strategies.base import Strategy, family
from app.schemas.competitor import Activity, CompetitorDataSource
from app.schemas.profile import ContentFormat, Objective
from app.schemas.recommendation import Evidence, SignalName, SourceReference
from app.utils.metrics import sample_confidence

#: Interest words from comments that name a feature of the request, not a topic worth a post of its own.
_NOT_TOPICS = {"locations", "delivery", "sizing", "colour options", "bookings", "recipes"}
_QUESTION_THEMES = {"price", "where to buy or find", "colour or size", "delivery or booking", "how to or recipe", "timing or availability", "safety or suitability", "budget or itinerary"}
_STRONG_INDEX = 1.10  # a topic must beat a typical post by at least 10% to be called a strength
_MIN_TOPIC_POSTS = 3
_LEAD_DAYS = {"fashion": 10, "jewellery": 10, "beauty": 8, "restaurant": 6, "food": 5, "travel": 14, "fitness": 7, "general": 7}
_RELATED_GOALS: dict[Objective, set[Objective]] = {
    Objective.SALES: {Objective.PRODUCT_DISCOVERY, Objective.LEADS},
    Objective.PRODUCT_DISCOVERY: {Objective.SALES, Objective.REACH, Objective.BRAND_AWARENESS},
    Objective.LEADS: {Objective.SALES},
    Objective.REACH: {Objective.BRAND_AWARENESS, Objective.SHARES, Objective.ENGAGEMENT},
    Objective.ENGAGEMENT: {Objective.COMMUNITY_BUILDING, Objective.SAVES, Objective.SHARES, Objective.REACH},
    Objective.SAVES: {Objective.SHARES, Objective.AUDIENCE_EDUCATION},
    Objective.SHARES: {Objective.SAVES, Objective.REACH},
    Objective.COMMUNITY_BUILDING: {Objective.ENGAGEMENT},
    Objective.AUDIENCE_EDUCATION: {Objective.SAVES},
    Objective.BRAND_AWARENESS: {Objective.REACH, Objective.PRODUCT_DISCOVERY},
}


def clamp(x: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, x))


def index_strength(idx: float) -> float:
    """0 at a typical post (index 1.0), 1 at 1.4x or better."""
    return clamp((idx - 1.0) / 0.4)


def labels_of(subject: str | None, *more: str | None) -> set[str]:
    """The topics an idea is ABOUT: its own subject plus any extra subject text (festival themes, a trend's title).

    Never pass template wording (titles, concepts): words such as "routine" or "collection" appear in every idea for an
    industry and would make every idea look like it is about skincare or fashion."""
    out = {subject.lower()} if subject else set()
    for text in (subject, *more):
        if text:
            out |= set(extract_topics(text, max_topics=6))
    return out


def _content_format(media: str | None) -> ContentFormat | None:
    return {"REEL": ContentFormat.REEL, "CAROUSEL": ContentFormat.CAROUSEL, "IMAGE": ContentFormat.SINGLE_IMAGE}.get((media or "").upper())


# ------------------------------------------------------------------ seeds

def historical_seeds(s: Signals) -> list[Seed]:
    a = s.analytics
    if a is None:
        return []
    best = next((i for i in a.insights if i.key == "best_format"), None)
    fmt_hint = _content_format(str(best.supporting_metrics.get("best_format"))) if best else None
    seeds: list[Seed] = []
    seen: set[str] = set()
    index_of = {t.topic: t.mean_performance_index for t in a.topics if t.enough_data and t.mean_performance_index is not None}
    lifts = {}  # topic -> (strength, insight) for the strongest saves/shares lift, discounted when the topic is weak overall
    for i in a.insights:
        if i.key in {"save_worthy_topic", "share_worthy_topic"}:
            topic = str(i.supporting_metrics.get("topic"))
            strength = clamp((float(i.supporting_metrics.get("ratio") or 1) - 1) / 1.5) * min(1.0, index_of.get(topic, 1.0))
            if topic not in lifts or strength > lifts[topic][0]:
                lifts[topic] = (strength, i)
    for t in sorted((t for t in a.topics if t.enough_data and (t.mean_performance_index or 0) >= _STRONG_INDEX), key=lambda t: -(t.mean_performance_index or 0))[:3]:
        idx = t.mean_performance_index or 0
        seen.add(t.topic)
        strength, statement, metrics = index_strength(idx), f"Your '{t.topic}' posts perform {(idx - 1) * 100:.0f}% above a typical post for their format ({t.posts} posts).", {"topic": t.topic, "mean_performance_index": idx, "posts": t.posts}
        if t.topic in lifts and lifts[t.topic][0] > strength:  # strong engagement AND a strong saves/shares lift: the lift counts too
            strength = lifts[t.topic][0]
            statement += " " + lifts[t.topic][1].finding
            metrics["lift_ratio"] = lifts[t.topic][1].supporting_metrics.get("ratio")
        seeds.append(Seed("historical", t.topic, f"'{t.topic}' posts perform {idx:.2f}x a typical post", strength, sample_confidence(t.posts, _MIN_TOPIC_POSTS), Evidence(signal=SignalName.HISTORICAL, statement=statement, metrics=metrics), SourceReference(type="analytics", name=f"topic:{t.topic}"), {"format": fmt_hint, "metric": "index"}))
    for i in a.insights:
        if i.key not in {"save_worthy_topic", "share_worthy_topic"}:
            continue
        topic = str(i.supporting_metrics.get("topic"))
        if topic in seen:
            continue
        seen.add(topic)
        strength = clamp((float(i.supporting_metrics.get("ratio") or 1) - 1) / 1.5)
        # Saves or shares alone do not make a topic a winner: a topic that underperforms overall is discounted.
        strength *= min(1.0, index_of.get(topic, 1.0))
        metric = "saves" if i.key == "save_worthy_topic" else "shares"
        seeds.append(Seed("historical", topic, i.finding, strength, i.confidence, Evidence(signal=SignalName.HISTORICAL, statement=i.finding, metrics={k: v for k, v in i.supporting_metrics.items() if k != "examples"}), SourceReference(type="analytics", name=f"insight:{i.key}"), {"format": fmt_hint, "metric": metric}))
    return seeds


def audience_seeds(s: Signals) -> list[Seed]:
    au = s.audience
    if au is None:
        return []
    seeds: list[Seed] = []
    by_key = {i.key: i for i in au.insights}
    for g in au.frequent_questions:
        if g.theme not in _QUESTION_THEMES:
            continue
        share = g.count / max(au.comments_analyzed, 1)
        ins = by_key.get({"price": "price_transparency", "colour or size": "variant_demand"}.get(g.theme, "purchase_intent"))
        conf = ins.confidence if ins else 0.45
        seeds.append(Seed("audience_question", g.theme, f"{g.count} commenters ask about {g.theme}.", clamp(0.35 + share * 2), conf, Evidence(signal=SignalName.AUDIENCE, statement=f"{g.count} of {au.comments_analyzed} comments ask about {g.theme} (e.g. \"{g.examples[0]}\").", metrics={"comments": g.count, "share": round(share, 3)}), SourceReference(type="audience_comments", name=f"theme:{g.theme}"), {"theme": g.theme, "count": g.count}))
    for it in au.interests:
        if it.mentions >= 2 and it.topic not in _NOT_TOPICS:
            conf = (by_key.get("content_requests") or by_key.get("purchase_intent"))
            seeds.append(Seed("audience_request", it.topic, f"'{it.topic}' came up in {it.mentions} comments.", clamp(0.3 + it.mentions / 10), conf.confidence if conf else 0.4, Evidence(signal=SignalName.AUDIENCE, statement=f"'{it.topic}' is mentioned in {it.mentions} of {au.comments_analyzed} comments.", metrics={"mentions": it.mentions}), SourceReference(type="audience_comments", name=f"interest:{it.topic}"), {"topic": it.topic}))
    pain = by_key.get("pain_points")
    if pain:
        seeds.append(Seed("audience_pain", "customer concerns", pain.finding, clamp(0.35 + float(pain.supporting_metrics.get("share_of_comments") or 0) * 2), pain.confidence, Evidence(signal=SignalName.AUDIENCE, statement=pain.finding, metrics={k: v for k, v in pain.supporting_metrics.items() if k != "examples"}), SourceReference(type="audience_comments", name="insight:pain_points"), {}))
    return seeds


def trend_seeds(s: Signals) -> list[Seed]:
    out = []
    for a in s.trends:
        t = a.trend
        topic = t.title.lower()  # the trend itself; a broad category word would match every idea in that category
        out.append(Seed("trend", topic, t.title, a.profile_relevance, t.confidence_score, Evidence(signal=SignalName.TREND, statement=f"'{t.title}' is a current trend ({t.source_name}, verified {t.verified_date})." + (" This is FICTIONAL SAMPLE data, not a real-world observation." if t.is_sample else "") + (f" Direction: {t.direction.value.lower()}." if t.direction.value != "UNKNOWN" else ""), metrics={"relevance": a.profile_relevance, "confidence": t.confidence_score, "direction": t.direction.value, "is_sample": str(t.is_sample)}), SourceReference(type="trend", name=t.source_name or "unknown", reference=t.source_url), {"trend": t}))
    return out


def festival_seeds(s: Signals) -> list[Seed]:
    out = []
    for u in s.festivals:
        f = u.festival
        if u.relevance < 0.3 or u.days_until < 2:
            continue
        out.append(Seed("festival", f.name, f"{f.name} in {u.days_until} days", u.relevance, 0.55, Evidence(signal=SignalName.FESTIVAL, statement=f"{f.name} is on {f.date} ({'date confirmed' if f.verification_status in ('RULE_FIXED_DATE', 'VERIFIED_SOURCE') else 'date NOT confirmed: approximate sample'}), {u.days_until} days away. {u.reasons[-1]}{' The official date can shift by a day with moon sighting.' if 'moon sighting' in (f.date_note or '') else ''}", metrics={"days_until": u.days_until, "relevance": u.relevance, "date_status": f.verification_status}), SourceReference(type="festival", name=f.name, reference=f.source), {"festival": f, "days_until": u.days_until, "themes": f.relevant_content_themes}))
    return out


def competitor_seeds(s: Signals) -> list[Seed]:
    """Topics several APPROVED, still-active competitors cover repeatedly while the account covers them little or not at all.

    Only public information is used. Competitors whose last public post is more than 60 days old are ignored (their topics may be
    out of date). Gaps are only reported when the account has enough posts of its own to judge its coverage."""
    live = [c for c in s.competitors if c.activity != Activity.INACTIVE and c.posts_analyzed > 0]
    if not live:
        return []
    by_topic: dict[str, list[tuple]] = {}
    for c in live:
        for th in c.themes:
            if th.topic in c.low_coverage_topics:
                by_topic.setdefault(th.topic, []).append((c, th))
    out: list[Seed] = []
    for topic, rows in by_topic.items():
        k, n = len(rows), len(live)
        posts = sum(th.competitor_posts for _, th in rows)
        mine, share = rows[0][1].your_posts, rows[0][1].your_share
        my_total = s.analytics.posts_analyzed if s.analytics is not None else 0
        gap_size = clamp((sum(th.competitor_share for _, th in rows) / k - (share or 0)) / 0.6)
        strength = clamp(0.3 * (k / n) + 0.3 * min(k, 3) / 3 + 0.4 * gap_size)
        sample_conf = sum(sample_confidence(c.posts_analyzed, 5) or 0.3 for c, _ in rows) / k
        conf = clamp(sample_conf * (0.6 + 0.4 * min(k, 3) / 3))  # several independent competitors agreeing raises trust
        names = [f"@{c.username}" for c, _ in rows]
        statement = f"{k} of {n} approved competitor{'s' if n != 1 else ''} repeatedly post about '{topic}' ({posts} public posts). You have {mine} of your {my_total} posts on it."
        out.append(Seed("competitor", topic, statement, strength, conf, Evidence(signal=SignalName.COMPETITOR, statement=statement, metrics={"competitors_covering": k, "competitors_total": n, "competitor_posts": posts, "your_posts": mine, "your_share": share}), SourceReference(type="competitor_public_posts", name=", ".join(names[:5])), {"k": k, "n": n, "usernames": names, "your_posts": mine, "my_total": my_total, "sample": any(c.data_source == CompetitorDataSource.SAMPLE_PROVIDER for c, _ in rows)}))
    return sorted(out, key=lambda x: -x.strength)


def evergreen_seeds(s: Signals) -> list[Seed]:
    p = s.profile
    subjects = [*p.products[:2], *p.services[:1]] or ([p.niche] if p.niche else [])
    topics = [*p.preferred_topics[:2], *subjects]
    out: list[Seed] = []
    angles = ["bts", "ugc", "faq", "spotlight"] if p.profile_type.value == "BUSINESS" else ["bts", "ugc", "faq", "tips"]
    for n, angle in enumerate(angles):
        subject = subjects[n % len(subjects)] if subjects else (p.niche or "your work")
        topic = {"bts": "behind the scenes", "ugc": "customer stories", "faq": subject, "spotlight": subject, "tips": subject}[angle]
        out.append(Seed("evergreen", topic, f"Evergreen {angle} idea", 0.0, 0.4, Evidence(signal=SignalName.GOAL, statement="Evergreen: not tied to a date or trend, so it can be posted any week.", metrics={}), SourceReference(type="profile", name="profile"), {"angle": angle, "subject": subject, "preferred": topics}))
    return out


# ------------------------------------------------------------------ candidates and signals

def seed_labels(seed: Seed) -> set[str]:
    more = [" ".join(seed.extra.get("themes", []))]
    trend = seed.extra.get("trend")
    if trend is not None:
        more.append(f"{trend.title} {trend.description}")
    return labels_of(seed.topic, *more)


def fingerprint(c: Candidate) -> str:
    key = f"{c.seed.kind}|{c.topic.lower().strip()}|{c.format.value}|{c.seed.extra.get('angle', '')}|{c.seed.extra.get('theme', '')}"
    return hashlib.sha1(key.encode()).hexdigest()[:16]


def generate_candidates(s: Signals, strategy: Strategy) -> list[Candidate]:
    pools = {"festival": festival_seeds(s), "trend": trend_seeds(s), "audience": audience_seeds(s), "historical": historical_seeds(s), "competitor": competitor_seeds(s)}
    seeds = [*pools["festival"], *pools["trend"], *pools["audience"], *pools["historical"], *pools["competitor"], *evergreen_seeds(s)]
    excluded = [e.lower() for e in s.profile.excluded_topics if len(e) >= 3]
    out: list[Candidate] = []
    for seed in seeds:
        c = strategy.build(seed, s)
        if c is None:
            continue
        text = f"{c.title} {c.idea} {c.concept} {c.topic}".lower()
        if any(e in text for e in excluded):
            continue  # the owner said never to post about this
        c.seed.extra["labels"] = seed_labels(seed)
        c.fingerprint = fingerprint(c)
        if not c.tags:
            c.tags = [{"historical": "performance_driven", "competitor": "competitor_gap"}.get(seed.kind, "evergreen")]
        out.append(c)
    _attach_signals(out, s, pools)
    _attach_hashtags(out, s)
    _attach_dates(out, s)
    return out


def _format_matches(media: str, fmt: ContentFormat) -> bool:
    groups = {"REEL": {ContentFormat.REEL, ContentFormat.TUTORIAL, ContentFormat.BEHIND_THE_SCENES}, "CAROUSEL": {ContentFormat.CAROUSEL, ContentFormat.EDUCATIONAL_POST, ContentFormat.PRODUCT_SHOWCASE}, "IMAGE": {ContentFormat.SINGLE_IMAGE, ContentFormat.PROMOTIONAL}}
    return fmt in groups.get(media.upper(), set())


def _overlap(a: set[str], b: set[str]) -> bool:
    return bool(a & b)


def _same(a: Seed, b: Seed) -> bool:
    return (a.kind, a.topic, a.label) == (b.kind, b.topic, b.label)


def _attach_signals(cands: list[Candidate], s: Signals, pools: dict[str, list[Seed]]) -> None:
    hist, aud, trends, fests, comps = pools["historical"], pools["audience"], pools["trend"], pools["festival"], pools["competitor"]
    topic_idx = {t.topic: t for t in (s.analytics.topics if s.analytics else []) if t.enough_data and t.mean_performance_index is not None}
    best_media = None
    if s.analytics:
        b = next((i for i in s.analytics.insights if i.key == "best_format"), None)
        best_media = str(b.supporting_metrics.get("best_format")) if b else None
    goals = set(s.goals or s.profile.goals)

    labels = seed_labels

    for c in cands:
        mine: set[str] = c.seed.extra["labels"]
        c.signals, c.evidence, c.sources, c.evidence_confidence = {}, [], [], {}

        def attach(name: SignalName, strength: float | None, ev: Evidence | None, src: SourceReference | None, conf: float | None, c: Candidate = c) -> None:
            c.signals[name] = strength if strength is None else round(clamp(strength), 3)
            if strength and ev:
                c.evidence.append(ev)
                if conf is not None:
                    c.evidence_confidence[name] = conf
            if strength and src and src not in c.sources:
                c.sources.append(src)

        # historical
        if s.analytics is None or not s.analytics.posts_analyzed:
            attach(SignalName.HISTORICAL, None, None, None, None)
        else:
            matches = [h for h in hist if _overlap(mine, labels(h))]
            weakest = max((t for lab in mine if (t := topic_idx.get(lab))), key=lambda t: t.mean_performance_index or 0, default=None)
            if matches:
                h = max(matches, key=lambda h: h.strength)
                attach(SignalName.HISTORICAL, h.strength, h.evidence, h.source, h.confidence)
            elif weakest is not None:  # the topic is known but is no stronger than a typical post: real, honest zero support
                attach(SignalName.HISTORICAL, index_strength(weakest.mean_performance_index or 0), None, None, None)
            elif best_media and _format_matches(best_media, c.format):
                attach(SignalName.HISTORICAL, 0.3, Evidence(signal=SignalName.HISTORICAL, statement=f"{best_media.title()} is your best-performing format by engagement rate.", metrics={"best_format": best_media}), SourceReference(type="analytics", name="insight:best_format"), 0.5)
            else:
                attach(SignalName.HISTORICAL, 0.0, None, None, None)
        # audience
        if s.audience is None or not s.audience.comments_analyzed:
            attach(SignalName.AUDIENCE, None, None, None, None)
        else:
            m = max(((a.strength, a) for a in aud if _overlap(mine, labels(a)) or a.topic.lower() in {x.lower() for x in mine}), default=None, key=lambda t: t[0])
            attach(SignalName.AUDIENCE, m[0] if m else 0.0, m[1].evidence if m else None, m[1].source if m else None, m[1].confidence if m else None)
        # trend
        if not trends:
            attach(SignalName.TREND, None, None, None, None)
        else:
            m = max(((t.strength, t) for t in trends if _overlap(mine, labels(t)) or _same(t, c.seed)), default=None, key=lambda t: t[0])
            attach(SignalName.TREND, m[0] if m else 0.0, m[1].evidence if m else None, m[1].source if m else None, m[1].confidence if m else None)
        # festival
        if not fests:
            attach(SignalName.FESTIVAL, None, None, None, None)
        else:
            m = max(((f.strength * (1.0 if _same(f, c.seed) else 0.6), f) for f in fests if _same(f, c.seed) or _overlap(mine, labels(f))), default=None, key=lambda t: t[0])
            attach(SignalName.FESTIVAL, m[0] if m else 0.0, m[1].evidence if m else None, m[1].source if m else None, m[1].confidence if m else None)
        # competitor
        if not comps:
            attach(SignalName.COMPETITOR, None, None, None, None)
        else:
            m = max(((x.strength, x) for x in comps if _overlap(mine, labels(x))), default=None, key=lambda t: t[0])
            attach(SignalName.COMPETITOR, m[0] if m else 0.0, m[1].evidence if m else None, m[1].source if m else None, m[1].confidence if m else None)
        # goal alignment and the owner's stated preferences
        if not goals and not s.profile.preferred_formats and not s.profile.preferred_topics:
            attach(SignalName.GOAL, None, None, None, None)
        else:
            base = 1.0 if c.objective in goals else 0.55 if any(c.objective in _RELATED_GOALS.get(g, set()) for g in goals) else 0.2 if goals else 0.5
            bonus = (0.1 if c.format in s.profile.preferred_formats else 0.0) + (0.1 if any(pt.lower() in {x.lower() for x in mine} or pt.lower() in c.title.lower() for pt in s.profile.preferred_topics) else 0.0)
            why = f"Supports your goal of {c.objective.value.lower().replace('_', ' ')}." if c.objective in goals else "Related to your goals." if base >= 0.5 else "Not one of your stated goals."
            attach(SignalName.GOAL, base + bonus, Evidence(signal=SignalName.GOAL, statement=why + (" Matches your preferred format." if c.format in s.profile.preferred_formats else ""), metrics={"objective": c.objective.value}), SourceReference(type="profile", name="goals"), 0.9)
        if c.seed.kind != "evergreen" and c.seed.evidence not in c.evidence:
            c.evidence.insert(0, c.seed.evidence)
        if c.seed.source not in c.sources and c.seed.kind != "evergreen":
            c.sources.insert(0, c.seed.source)


def _attach_hashtags(cands: list[Candidate], s: Signals) -> None:
    """Hashtags only where there is a reason: a verified trend's own hashtags, or hashtags the owner already uses repeatedly on this topic."""
    for c in cands:
        tags = list(c.hashtags)
        for lab in c.seed.extra["labels"]:
            tags += s.own_hashtags_by_topic.get(lab, [])
        seen: list[str] = []
        for t in tags:
            if t not in seen:
                seen.append(t)
        c.hashtags = seen[:5]


def _next_weekday(start: date, weekday: int) -> date:
    return start + timedelta(days=(weekday - start.weekday()) % 7)


def _attach_dates(cands: list[Candidate], s: Signals) -> None:
    fam = family(s.profile)
    for c in cands:
        fest = c.seed.extra.get("festival")
        if fest is not None:
            lead = _LEAD_DAYS.get(fam, 7)
            target = fest.date - timedelta(days=lead)
            earliest = s.as_of + timedelta(days=1)
            c.publish_on = max(target, earliest)
            c.timing_note = f"Post about {lead} days before {fest.name} ({fest.date}) so people can plan." if target >= earliest else f"{fest.name} is close ({fest.date}): post as soon as possible."
