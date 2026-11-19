"""Plain-language reasoning for a recommendation. Every sentence is built from the candidate's own evidence."""

from __future__ import annotations

from app.recommendation.models import Candidate, Signals
from app.schemas.recommendation import Reasoning, SignalName


def _evidence_for(c: Candidate, name: SignalName) -> list[str]:
    return [e.statement for e in c.evidence if e.signal == name]


def build_reasoning(c: Candidate, s: Signals) -> Reasoning:
    profile = s.profile
    supporting = [e.statement for e in c.evidence if e.signal != SignalName.GOAL]
    goal_text = _evidence_for(c, SignalName.GOAL)
    objective = c.objective.value.lower().replace("_", " ")

    audience = _evidence_for(c, SignalName.AUDIENCE)
    if audience:
        relevant = audience[0]
    elif profile.target_audience:
        relevant = f"It is aimed at your stated audience: {profile.target_audience}. No comment data directly backs this idea."
    else:
        relevant = "No audience data directly backs this idea, so treat its fit as an assumption."

    now: str
    if c.festival_name and c.publish_on:
        now = f"{c.timing_note or ''} Suggested date: {c.publish_on.isoformat()}.".strip()
    elif _evidence_for(c, SignalName.TREND):
        now = "A currently verified trend relates to it. Trends fade, so post soon."
    elif audience:
        now = "People are asking right now, so answering sooner shows you are listening."
    else:
        now = "It is not tied to a date or trend, so it can go out any week. That also makes it a good filler for a quiet week."

    return Reasoning(
        what_to_post=c.idea,
        why_post_it=" ".join([*goal_text[:1], supporting[0] if supporting else "It is a reliable format for this kind of profile."]),
        why_relevant_to_audience=relevant,
        supporting_evidence=" ".join(supporting) if supporting else "No data source specifically supports this idea. It is a general best-practice suggestion.",
        why_now=now,
        what_it_looks_like=c.concept,
        audience_action=f"Aim: {objective}. Ask: {c.cta}.",
    )


def target_audience(c: Candidate, s: Signals) -> str:
    return s.profile.target_audience or "Your existing followers and people like them"


def score_explanation(c: Candidate) -> str:
    b = c.breakdown
    used = b["weights_used"]
    parts = [f"{name} {c.signals[next(n for n in c.signals if n.value == name)]:.2f} x {w:.2f}" for name, w in used.items()]
    text = f"Opportunity {c.opportunity:.0f}/100 is a ranking signal built from: " + "; ".join(parts) + "."
    if b["missing"]:
        text += f" Not available, so left out and the weights renormalised: {', '.join(b['missing'])}."
    if c.learning_adjustment:
        text += f" Adjusted {c.learning_adjustment:+.1f} for your earlier feedback."
    text += f" Confidence {c.confidence:.0f}/100 reflects the quality of the supporting evidence, separately."
    return text
