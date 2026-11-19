"""Real calls to Gemini and Claude. Skipped unless explicitly enabled, because they use real keys and cost a little money.

    LIVE_AI_TESTS=1 GEMINI_API_KEY=... pytest tests/live -v
    LIVE_AI_TESTS=1 ANTHROPIC_API_KEY=... pytest tests/live -v

Keys come from the environment only. Run it before relying on a provider, and again after changing a model name.
"""

import os

import pytest

from app.ai.provider import build_provider
from app.ai.refiner import RecommendationRefiner
from app.api.dependencies import build_container
from app.core.config import Settings
from app.core.exceptions import AIProviderError
from app.data.seed import load_mock_data
from app.schemas.recommendation import GenerateRequest
from tests.conftest import BOUTIQUE

pytestmark = pytest.mark.skipif(os.environ.get("LIVE_AI_TESTS") != "1", reason="set LIVE_AI_TESTS=1 to call real providers")

CASES = [("gemini", "GEMINI_API_KEY", "gemini_api_key"), ("claude", "ANTHROPIC_API_KEY", "anthropic_api_key")]


def recs():
    c = build_container(Settings(environment="test", storage_backend="memory"))
    load_mock_data(c.store)
    return c.recommendations.build(GenerateRequest(profile_id=BOUTIQUE, as_of="2026-10-05"))[0]


@pytest.mark.parametrize("name,env,field", CASES)
async def test_valid_key_polishes_wording_and_changes_nothing_else(name, env, field):
    if not os.environ.get(env):
        pytest.skip(f"{env} is not set")
    provider = build_provider(Settings(environment="test", ai_provider=name, **{field: os.environ[env]}))
    try:
        before = recs()
        after = await RecommendationRefiner(provider).refine(before)
    finally:
        await provider.aclose()
    assert after[0].generation.provider == name
    for a, b in zip(before, after, strict=True):
        assert (a.opportunity_score, a.supporting_evidence, a.source_references) == (b.opportunity_score, b.supporting_evidence, b.source_references)


@pytest.mark.parametrize("name,field", [("gemini", "gemini_api_key"), ("claude", "anthropic_api_key")])
async def test_an_invalid_key_is_reported_as_auth(name, field):
    provider = build_provider(Settings(environment="test", ai_provider=name, ai_max_retries=0, **{field: "not-a-real-key"}))
    try:
        with pytest.raises(AIProviderError) as e:
            await RecommendationRefiner(provider).refine(recs())
    finally:
        await provider.aclose()
    assert e.value.kind == "auth"
