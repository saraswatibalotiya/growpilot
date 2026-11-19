"""Turns classified comments into audience insights. Counts are of COMMENTS, which are a self-selected minority of an audience."""

from collections import Counter, defaultdict
from datetime import UTC, datetime

from app.intelligence.audience_classifier import classify_comment, question_theme, safe_excerpt
from app.schemas.audience import (
    AudienceInsights,
    ClassifiedComment,
    CommentIn,
    CommentSignal,
    Demographics,
    InterestCount,
    QuestionGroup,
)
from app.schemas.common import DataCoverage, Insight

# Interest words beyond the shared topic lexicon: what people name when they ask about things.
INTERESTS: dict[str, tuple[str, ...]] = {
    "colour options": ("black", "red", "blue", "green", "colour", "color", "shade"),
    "sizing": ("xl", "size", "size chart"),
    "delivery": ("deliver", "delivery", "shipping"),
    "bookings": ("booking", "bookings", "reservation", "book "),
    "blouse designs": ("blouse",),
    "dry or sensitive skin": ("dry skin", "sensitive skin", "oily skin", "स्किन"),
    "acne": ("acne", "broke out", "marks"),
    "vegan or vegetarian": ("vegan", "vegetarian"),
    "itinerary and costs": ("itinerary", "budget", "cost", "खर्चा", "pdf"),
    "stays": ("stay", "hotel", "homestay"),
    "recipes": ("recipe", "रेसिपी", "measurements"),
    "locations": ("where", "which area", "located", "location", "कहाँ", "कुठे"),
}

REPRESENTATIVENESS = (
    "These findings describe the people who commented, not your whole audience. Commenters are a small, self-selected group, "
    "so counts here show what they ask and say, and should be read as signals to check, not as audience-wide facts."
)


def _confidence(count: int, total: int, minimum: int, strength: float) -> float:
    """Rises with the number of supporting comments, the size of the whole sample and the strength of the rules that matched."""
    volume = min(1.0, count / 5)
    sample = min(1.0, total / max(minimum, 1))
    return round(min(0.9, (0.25 + 0.5 * volume) * (0.5 + 0.5 * sample) * (0.6 + 0.4 * strength)), 2)


def analyze_comments(profile_id: str, comments: list[CommentIn], demographics: Demographics | None, *, detect_language: bool, minimum: int, now: datetime | None = None) -> AudienceInsights:
    now = now or datetime.now(UTC)
    total = len(comments)
    caveats = ["Analysed with keyword rules, not a model. Sarcasm and unusual spellings can be misread."]
    if total == 0:
        return AudienceInsights(profile_id=profile_id, generated_at=now, comments_analyzed=0, languages={}, signal_counts={}, interests=[], frequent_questions=[], insights=[], data_coverage=DataCoverage.of(0, 0, "No comments were supplied."), representativeness=REPRESENTATIVENESS, caveats=caveats + ["No comments were supplied, so there is nothing to analyse."], demographics=demographics)
    if total < minimum:
        caveats.append(f"Only {total} comments (fewer than {minimum}). Treat these as individual examples, not as a pattern.")

    classified: dict[str, ClassifiedComment] = {c.comment_id: classify_comment(c.comment_id, c.text, detect=detect_language) for c in comments}
    text_of = {c.comment_id: c.text for c in comments}
    signal_counts: Counter[str] = Counter()
    by_signal: dict[CommentSignal, list[str]] = defaultdict(list)
    languages: Counter[str] = Counter()
    for cid, cc in classified.items():
        for s in cc.signals:
            signal_counts[s.value] += 1
            by_signal[s].append(cid)
        if cc.language:
            languages[cc.language] += 1

    # Interests: topic mentions plus the named-interest words.
    interest_counter: Counter[str] = Counter()
    for c in comments:
        low = c.text.lower()
        found = set(classified[c.comment_id].topics)
        found.update(label for label, words in INTERESTS.items() if any(w in low for w in words))
        interest_counter.update(found)
    interests = [InterestCount(topic=t, mentions=n) for t, n in interest_counter.most_common(8)]

    # Frequent questions, grouped by theme.
    groups: dict[str, list[str]] = defaultdict(list)
    for cid in by_signal.get(CommentSignal.QUESTION, []) + by_signal.get(CommentSignal.PRICE_QUESTION, []) + by_signal.get(CommentSignal.PURCHASE_INTENT, []):
        theme = question_theme(text_of[cid])
        if theme and cid not in groups[theme]:
            groups[theme].append(cid)
    questions = [QuestionGroup(theme=t, count=len(ids), examples=[safe_excerpt(text_of[i]) for i in ids[:3]], comment_ids=ids) for t, ids in sorted(groups.items(), key=lambda kv: -len(kv[1])) if len(ids) >= 2]

    def ids(*signals: CommentSignal) -> list[str]:
        seen: list[str] = []
        for s in signals:
            seen += [i for i in by_signal.get(s, []) if i not in seen]
        return seen

    def strength(found: list[str]) -> float:
        return sum(classified[i].confidence for i in found) / len(found)

    def make(key: str, found: list[str], finding: str, explanation: str) -> Insight | None:
        if len(found) < 2:  # one comment is an anecdote, not a finding
            return None
        examples = [safe_excerpt(text_of[i]) for i in found[:3]]
        return Insight.build(key, finding, {"comments": len(found), "share_of_comments": round(len(found) / total, 3), "examples": " | ".join(examples)}, _confidence(len(found), total, minimum, strength(found)), DataCoverage.of(total, len(found), "Counts are of comments, not people."), explanation)

    insights: list[Insight] = []
    buy = ids(CommentSignal.PURCHASE_INTENT, CommentSignal.PRICE_QUESTION)
    price = ids(CommentSignal.PRICE_QUESTION)
    variants = ids(CommentSignal.VARIANT_REQUEST)
    requests = ids(CommentSignal.CONTENT_REQUEST)
    pains = ids(CommentSignal.PAIN_POINT, CommentSignal.NEGATIVE_FEEDBACK)
    positive = ids(CommentSignal.POSITIVE_FEEDBACK)
    candidates = [
        make("purchase_intent", buy, f"{len(buy)} of {total} commenters ({len(buy) / total * 100:.0f}%) are asking how to buy, order or book, or what it costs. That is high product-discovery interest.", "Comments asking where to buy, how to order or book, about delivery, or about price."),
        make("price_transparency", price, f"{len(price)} commenters ask for the price. Showing prices in captions or on screen could answer this before they ask.", "Comments containing price words in English, Hinglish, Hindi or Marathi."),
        make("variant_demand", variants, f"{len(variants)} commenters ask about colours, sizes or shades. There is demand for variant information.", "Comments asking whether something comes in another colour, size or shade."),
        make("content_requests", requests, f"{len(requests)} commenters ask for specific content, such as tutorials, recipes, reviews or itineraries.", "Comments that ask the creator to make or share something."),
        make("pain_points", pains, f"{len(pains)} comments describe a problem or a negative experience, such as late delivery, quality, queues or results that did not work.", "Comments about problems. Read the examples: they are the clearest view of what to fix or explain."),
        make("positive_feedback", positive, f"{len(positive)} comments ({len(positive) / total * 100:.0f}%) are warmly positive.", "Comments with praise or thanks. Praise alone does not show what to post next."),
    ]
    insights.extend(i for i in candidates if i is not None)

    education = [g for g in questions if g.theme in {"how to or recipe", "safety or suitability", "budget or itinerary"}]
    if education:
        n = sum(g.count for g in education)
        insights.append(Insight.build("education_gap", f"{n} questions are about how to do something, whether it suits them, or what it costs overall. Content that explains these could save repeat questions.", {"themes": ", ".join(g.theme for g in education), "questions": n}, _confidence(n, total, minimum, 0.7), DataCoverage.of(total, n), "Frequent question themes that point at missing explanation."))

    if demographics and demographics.top_locations:
        top = max(demographics.top_locations, key=lambda x: x.share)
        insights.append(Insight.build("audience_location", f"{top.share * 100:.0f}% of your audience is in {top.name}, as reported by the platform.", {"location": top.name, "share": top.share}, 0.85, DataCoverage.of(1, 1, "Platform-supplied aggregate, not inferred from comments."), "Taken directly from the audience data supplied. The engine does not infer location, age or any personal trait from comments."))

    unclassified = len(by_signal.get(CommentSignal.UNCLASSIFIED, []))
    coverage = DataCoverage.of(total, total - unclassified, f"{unclassified} comments did not match any rule." if unclassified else "Every comment matched at least one rule.")
    if unclassified / total > 0.4:
        caveats.append(f"{unclassified} of {total} comments could not be classified, so these findings cover a minority of the comments.")
    return AudienceInsights(profile_id=profile_id, generated_at=now, comments_analyzed=total, languages=dict(languages), signal_counts=dict(signal_counts), interests=interests, frequent_questions=questions, insights=insights, data_coverage=coverage, representativeness=REPRESENTATIVENESS, caveats=caveats, demographics=demographics)
