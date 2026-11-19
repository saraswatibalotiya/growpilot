"""Classifies one comment by what it asks for or says. Transparent keyword rules in English, common Hinglish and Devanagari.

It only reads the words of the comment. It does not guess the commenter's age, gender, religion, health or any other personal
characteristic, and nothing here could produce one.
"""

import re

from app.intelligence.topic_extractor import extract_topics
from app.schemas.audience import ClassifiedComment, CommentSignal

DEVANAGARI = re.compile(r"[ऀ-ॿ]")
LATIN = re.compile(r"[A-Za-z]")
_MARATHI = ("आहे", "मिळेल", "काय", "कुठे", "किंमत", "मिळतं", "राहिलात", "करा", "शेअर")
_HINDI = ("है", "क्या", "कहाँ", "कैसे", "दाम", "कीमत", "खरीद", "कितना", "बुकिंग", "रेट", "खर्चा", "ऑयली")
_HINGLISH = ("kitna", "kitne", "kya", "hai", "ye ", "kaise", "kahan", "dikhao", "chahiye", "nahi", "bhi ", "karo")

RULES: dict[CommentSignal, tuple[str, ...]] = {
    CommentSignal.PRICE_QUESTION: ("price", "how much", "cost of", "what is the cost", "rate", "pricing", "charges", "kitna price", "kitna", "kitne", "दाम", "कीमत", "रेट", "किंमत", "भाव", "खर्चा", "कितना"),
    CommentSignal.PURCHASE_INTENT: ("where can i buy", "where to buy", "where do i buy", "how do i order", "how to order", "can i order", "order online", "i want this", "want to buy", "buy this", "link to the product", "link?", "do you deliver", "deliver to", "delivery to", "shipping", "do you take bookings", "bookings", "booking", "reservation", "do you take custom", "custom orders", "where is your store", "store located", "discount code", "खरीद", "कहाँ से", "कुठे मिळेल", "ऑर्डर", "बुकिंग", "मिळेल", "कुठे मिळतं", "kahan se"),
    CommentSignal.VARIANT_REQUEST: ("in black", "in red", "in blue", "in green", "other colour", "other color", "different colour", "in xl", "available in", "size chart", "which size", "shade name", "see it in", "this in "),
    CommentSignal.CONTENT_REQUEST: ("can you make", "please make", "please do a", "make a video", "video on", "tutorial", "share the recipe", "please share the recipe", "can you review", "can you show", "show how to", "please post more", "please share the itinerary", "packing list", "can you do a", "रेसिपी", "रेसिपी शेअर", "make a video"),
    CommentSignal.PAIN_POINT: ("broke out", "did not work", "didn't work", "too oily", "too crowded", "crowded", "queue", "overpriced", "small for the price", "colour looked different", "color looked different", "different in person", "arrived late", "late", "slow", "loose", "stitching", "was not good", "not good", "disappointed"),
    CommentSignal.NEGATIVE_FEEDBACK: ("not good", "bad", "poor", "worst", "disappointed", "overpriced", "did not work", "didn't work", "broke out", "slow", "loose", "too oily"),
    CommentSignal.POSITIVE_FEEDBACK: ("love", "beautiful", "gorgeous", "stunning", "amazing", "wow", "best ever", "perfect", "thank you", "thanks", "helpful", "great", "fantastic", "so tasty", "elegant", "saved me", "changed my", "tried it", "❤", "😍", "🔥", "👏"),
}
QUESTION_WORDS = ("where", "what", "which", "how", "do you", "can you", "can i", "is it", "is this", "are you", "when", "क्या", "कौन", "कैसे", "कहाँ", "कुठे", "काय", "कसे")

# Question themes, for grouping frequent questions.
THEMES: dict[str, tuple[str, ...]] = {
    "price": ("price", "how much", "cost", "rate", "pricing", "charges", "kitna", "दाम", "कीमत", "रेट", "किंमत", "भाव", "खर्चा", "कितना"),
    "where to buy or find": ("where can i buy", "where to buy", "where is", "where exactly", "which cafe", "which area", "location", "located", "kahan", "कहाँ", "कुठे", "link"),
    "colour or size": ("colour", "color", "size", "shade", "in black", "in red", "xl"),
    "delivery or booking": ("deliver", "delivery", "shipping", "book", "reservation", "order", "ऑर्डर", "बुकिंग"),
    "how to or recipe": ("how", "recipe", "tutorial", "measurements", "रेसिपी", "how long"),
    "timing or availability": ("opening hours", "hours", "available", "which month", "parking"),
    "safety or suitability": ("safe for", "sensitive skin", "suitable", "vegan", "vegetarian", "solo women"),
    "budget or itinerary": ("budget", "itinerary", "how many days", "route", "stay", "hotel", "homestay", "खर्चा", "train or flight"),
}

_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_PHONE = re.compile(r"(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)")
_CONTROL = re.compile(r"[\u0000-\u001f\u007f]")


def safe_excerpt(text: str, limit: int = 140) -> str:
    """For quoting a comment back: control characters removed, phone numbers and emails masked, length capped."""
    text = _CONTROL.sub(" ", text)
    text = _EMAIL.sub("[email]", text)
    text = _PHONE.sub("[phone]", text)
    text = " ".join(text.split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


def detect_language(text: str) -> str | None:
    """A coarse label: en, hi, mr, devanagari (cannot tell hi from mr), hinglish, or other. Not a translation."""
    deva = len(DEVANAGARI.findall(text))
    latin = len(LATIN.findall(text))
    if deva == 0 and latin == 0:
        return None
    if deva > latin:
        m = sum(1 for w in _MARATHI if w in text)
        h = sum(1 for w in _HINDI if w in text)
        return "mr" if m > h else "hi" if h > m else "devanagari"
    lowered = f" {text.lower()} "
    return "hinglish" if any(w in lowered for w in _HINGLISH) else "en"


def _matches(lowered: str, words: tuple[str, ...]) -> list[str]:
    return [w for w in words if w in lowered]


def classify_comment(comment_id: str, text: str, *, detect: bool = True) -> ClassifiedComment:
    lowered = text.lower()
    signals: list[CommentSignal] = []
    strength = 0.0
    for signal, words in RULES.items():
        hits = _matches(lowered, words)
        if hits:
            signals.append(signal)
            # A multi-word phrase is stronger evidence than a single common word.
            strength = max(strength, 0.8 if any(" " in h for h in hits) or len(hits) > 1 else 0.6)
    # A negative word next to praise ("not good" vs "good") is ambiguous: keep both signals but lower the confidence.
    if CommentSignal.POSITIVE_FEEDBACK in signals and CommentSignal.NEGATIVE_FEEDBACK in signals:
        strength = min(strength, 0.45)
    # Do not call a complaint "positive" because it contains "late" or "slow": complaints win over weak praise words.
    if CommentSignal.NEGATIVE_FEEDBACK in signals and CommentSignal.POSITIVE_FEEDBACK in signals and "love" not in lowered:
        signals.remove(CommentSignal.POSITIVE_FEEDBACK)
    if "?" in text or any(lowered.startswith(q) or f" {q} " in f" {lowered} " for q in QUESTION_WORDS):
        if CommentSignal.QUESTION not in signals and not {CommentSignal.POSITIVE_FEEDBACK} >= set(signals):
            signals.append(CommentSignal.QUESTION)
            strength = max(strength, 0.55)
    if not signals:
        return ClassifiedComment(comment_id=comment_id, signals=[CommentSignal.UNCLASSIFIED], topics=extract_topics(text), language=detect_language(text) if detect else None, confidence=0.2)
    return ClassifiedComment(comment_id=comment_id, signals=signals, topics=extract_topics(text), language=detect_language(text) if detect else None, confidence=round(strength, 2))


def question_theme(text: str) -> str | None:
    lowered = text.lower()
    best, best_hits = None, 0
    for theme, words in THEMES.items():
        hits = len(_matches(lowered, words))
        if hits > best_hits:
            best, best_hits = theme, hits
    return best
