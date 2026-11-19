"""The single shared recommendation engine. Business and creator profiles use the same pipeline and differ only in strategy."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.recommendation.candidate_generator import generate_candidates
from app.recommendation.diversity import select_diverse
from app.recommendation.explanations import build_reasoning, score_explanation, target_audience
from app.recommendation.models import Candidate, Signals
from app.recommendation.ranking import data_sufficiency, score_candidate
from app.recommendation.strategies.base import Strategy
from app.recommendation.strategies.business import BusinessStrategy
from app.recommendation.strategies.creator import CreatorStrategy
from app.schemas.profile import ProfileType
from app.schemas.recommendation import AIDiagnostics, Recommendation, ScoreBreakdown


def strategy_for(profile_type: ProfileType) -> Strategy:
    return BusinessStrategy() if profile_type == ProfileType.BUSINESS else CreatorStrategy()


class RecommendationEngine:
    def __init__(self, weights: dict[str, float]):
        self.weights = weights

    def generate(self, signals: Signals, count: int) -> tuple[list[Recommendation], list[str]]:
        candidates = generate_candidates(signals, strategy_for(signals.profile.profile_type))
        notes: list[str] = []
        if signals.learning is not None and signals.learning.suppressed:
            before = len(candidates)
            candidates = [c for c in candidates if c.fingerprint not in signals.learning.suppressed]
            if before != len(candidates):
                notes.append(f"{before - len(candidates)} idea(s) were left out because you already used or rejected them.")
        for c in candidates:
            score_candidate(c, signals, self.weights)
        ranked = sorted(candidates, key=lambda c: (-c.opportunity, -c.confidence, c.fingerprint))
        chosen, div_notes = select_diverse(ranked, count)
        notes += div_notes
        return [self._to_recommendation(c, signals) for c in chosen], notes

    def _to_recommendation(self, c: Candidate, s: Signals) -> Recommendation:
        b = c.breakdown
        _, data_caveats = data_sufficiency(s)
        return Recommendation(
            recommendation_id=str(uuid.uuid4()),
            profile_id=s.profile.profile_id,
            created_at=datetime.now(UTC),
            title=c.title,
            content_idea=c.idea,
            detailed_concept=c.concept,
            format=c.format,
            objective=c.objective,
            target_audience=target_audience(c, s),
            suggested_publish_date=c.publish_on,
            publish_timing_note=c.timing_note,
            hook=c.hook,
            caption_direction=c.caption_direction,
            call_to_action=c.cta,
            hashtags=c.hashtags,
            opportunity_score=round(c.opportunity),
            confidence_score=round(c.confidence),
            score_breakdown=ScoreBreakdown(weights_used=b["weights_used"], signals=b["signals"], signals_available=b["available"], signals_missing=b["missing"], learning_adjustment=c.learning_adjustment, explanation=score_explanation(c)),
            reasoning=build_reasoning(c, s),
            supporting_evidence=c.evidence,
            source_references=c.sources,
            risks_and_caveats=[*data_caveats, *c.risks],
            suggested_duration_seconds=c.duration,
            idea_fingerprint=c.fingerprint,
            tags=c.tags or ["evergreen"],
            generation=AIDiagnostics(provider="none", model="rule_engine", generation_method="rules"),
        )
