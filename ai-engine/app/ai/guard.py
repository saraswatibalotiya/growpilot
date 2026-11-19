"""Final validation of AI wording, done in Python. The model may rephrase; it may not add facts.

A rewrite is rejected when it introduces a number, hashtag, link or trend/virality claim that the draft did not already contain.
The draft is the rule engine's output, so anything new would be unsupported by evidence.
"""

import re

from app.core.exceptions import AIProviderError

_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")
_HASHTAG = re.compile(r"#\w+")
_LINK = re.compile(r"https?://|www\.", re.IGNORECASE)
_CLAIM = re.compile(r"\b(viral|trending|guaranteed|proven)\b", re.IGNORECASE)
_FIELDS = ("title", "hook", "caption_direction", "call_to_action")


def _numbers(text: str) -> set[str]:
    return {n.replace(",", "") for n in _NUMBER.findall(text)}


def _words(pattern: re.Pattern[str], text: str) -> set[str]:
    return {m.lower() for m in pattern.findall(text)}


def check_wording(draft: dict[str, str], refined: dict[str, str], provider: str | None = None) -> None:
    """Raise AIProviderError(kind="unsafe_content") if `refined` adds anything the draft did not have."""
    before = " ".join(draft[f] for f in _FIELDS)
    after = " ".join(refined[f] for f in _FIELDS)
    problems = []
    if _numbers(after) - _numbers(before):
        problems.append("new numbers")
    if _words(_HASHTAG, after) - _words(_HASHTAG, before):
        problems.append("new hashtags")
    if _LINK.search(after) and not _LINK.search(before):
        problems.append("links")
    if _words(_CLAIM, after) - _words(_CLAIM, before):
        problems.append("new trend or performance claims")
    if problems:
        raise AIProviderError(f"The AI wording added content the evidence does not support ({', '.join(problems)}).", kind="unsafe_content", provider=provider)
