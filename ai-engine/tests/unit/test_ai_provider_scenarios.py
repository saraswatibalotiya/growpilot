"""The real provider classes, driven through real HTTP wire formats , end to end through the API.

No network and no keys: Gemini is plain HTTP, and the Anthropic SDK is given a mock transport, so its real error mapping runs.
Each test is one of the failure or success scenarios the engine must handle. A live check with real keys is in tests/live.
"""

import json

import anthropic
import httpx
import pytest

try:  # anthropic 2.x is built on httpx2, older releases on httpx
    import httpx2 as sdk_httpx
except ImportError:  # pragma: no cover
    sdk_httpx = httpx
from fastapi.testclient import TestClient

from app.ai.claude_provider import ClaudeProvider
from app.ai.gemini_provider import GeminiProvider
from app.ai.guard import check_wording
from app.ai.mock_provider import MockProvider
from app.ai.provider import build_provider
from app.api.dependencies import build_container
from app.core.config import Settings
from app.core.exceptions import AINotConfiguredError, AIProviderError
from app.main import create_app
from tests.conftest import API, BOUTIQUE, make_settings

SECRET = "sk-test-SECRET-do-not-leak"


async def no_sleep(_):
    return None


def drafts_from(prompt: str) -> list[dict]:
    return json.loads(prompt[prompt.rfind("<data>") + 6 : prompt.rfind("</data>")])


def echo(prompt: str, **override) -> str:
    return json.dumps({"items": [{**d, **override} for d in drafts_from(prompt)]})


class Timeout(Exception):
    """A handler raises this to simulate a read timeout in whichever HTTP library the provider uses."""


class Unreachable(Exception):
    """A handler raises this to simulate a refused connection."""


def transport(http, handler):
    def wrapped(request):
        try:
            status, body = handler(request)
        except Timeout:
            raise http.ReadTimeout("slow", request=request) from None
        except Unreachable:
            raise http.ConnectError("refused", request=request) from None
        return http.Response(status, json=body)

    return http.MockTransport(wrapped)


def gemini_body(text: str | None, finish: str = "STOP") -> dict:
    parts = [] if text is None else [{"text": text}]
    return {"candidates": [{"content": {"parts": parts, "role": "model"}, "finishReason": finish}]}


def claude_body(text: str, stop: str = "end_turn") -> dict:
    return {"id": "msg_1", "type": "message", "role": "assistant", "model": "m", "content": [{"type": "text", "text": text}], "stop_reason": stop, "stop_sequence": None, "usage": {"input_tokens": 1, "output_tokens": 1}}


def claude_error(status: int, kind: str) -> tuple:
    return (status, {"type": "error", "error": {"type": kind, "message": f"{kind} {SECRET}"}})


def gemini_prompt(request: httpx.Request) -> str:
    return json.loads(request.content)["contents"][0]["parts"][0]["text"]


def claude_prompt(request: httpx.Request) -> str:
    return json.loads(request.content)["messages"][0]["content"]


def gemini(handler, retries=2) -> GeminiProvider:
    return GeminiProvider(api_key=SECRET, model="gemini-2.5-flash", timeout=5, max_output_tokens=512, max_retries=retries, client=httpx.AsyncClient(transport=transport(httpx, handler)), sleep=no_sleep)


def claude(handler, retries=2) -> ClaudeProvider:
    sdk = anthropic.AsyncAnthropic(api_key=SECRET, max_retries=0, http_client=sdk_httpx.AsyncClient(transport=transport(sdk_httpx, handler)))
    return ClaudeProvider(api_key=SECRET, model="m", timeout=5, max_output_tokens=512, max_retries=retries, client=sdk, sleep=no_sleep)


def app_with(provider) -> TestClient:
    settings = make_settings(load_mock_data=True)
    container = build_container(settings)
    container._provider = provider
    return TestClient(create_app(settings, container), raise_server_exceptions=False)


def generate(client: TestClient, use_ai: bool = True):
    return client.post(f"{API}/recommendations/generate", json={"profile_id": BOUTIQUE, "as_of": "2026-10-05", "use_ai": use_ai})


def stored(client: TestClient) -> int:
    return client.get(f"{API}/recommendations", params={"profile_id": BOUTIQUE}).json()["data"]["total"]


PROVIDERS = {
    "gemini": (gemini, lambda req: (200, gemini_body(echo(gemini_prompt(req), title="Reworded title")))),
    "claude": (claude, lambda req: (200, claude_body(echo(claude_prompt(req), title="Reworded title")))),
}


# 1 and 2: a valid key works, and the AI never changes scores or evidence
@pytest.mark.parametrize("name", PROVIDERS)
def test_valid_key_polishes_wording_only(name):
    make, handler = PROVIDERS[name]
    client = app_with(make(handler))
    plain = generate(client, use_ai=False).json()["data"]["recommendations"]
    polished = generate(client).json()["data"]["recommendations"]
    assert polished[0]["generation"]["provider"] == name and polished[0]["title"] == "Reworded title"
    keep = ("opportunity_score", "confidence_score", "supporting_evidence", "source_references", "suggested_publish_date", "format")
    for a, b in zip(plain, polished, strict=True):
        assert {k: a[k] for k in keep} == {k: b[k] for k in keep}


# 3: an invalid key is reported once, never retried, and never echoed
@pytest.mark.parametrize(
    "make,response",
    [
        (gemini, (400, {"error": {"code": 400, "message": f"API key not valid. {SECRET}", "status": "INVALID_ARGUMENT", "details": [{"@type": "type.googleapis.com/google.rpc.ErrorInfo", "reason": "API_KEY_INVALID"}]}})),
        (gemini, (403, {"error": {"status": "PERMISSION_DENIED"}})),
        (claude, claude_error(401, "authentication_error")),
        (claude, claude_error(403, "permission_error")),
    ],
)
def test_invalid_key_is_a_clean_502_and_not_retried(make, response):
    calls = []

    def handler(request):
        calls.append(1)
        return response

    client = app_with(make(handler))
    r = generate(client)
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] == "auth" and len(calls) == 1
    assert SECRET not in r.text and stored(client) == 0


# 4: a timeout is retried a bounded number of times, then reported
@pytest.mark.parametrize("make", [gemini, claude])
def test_timeout_is_retried_then_502(make):
    calls = []

    def handler(request):
        calls.append(1)
        raise Timeout

    client = app_with(make(handler, retries=2))
    r = generate(client)
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] == "timeout" and len(calls) == 3
    assert stored(client) == 0


# 5: a rate limit is retried; if it clears the call succeeds, if not it is reported
@pytest.mark.parametrize("name", PROVIDERS)
def test_rate_limit_recovers_or_is_reported(name):
    make, ok = PROVIDERS[name]
    limited = (429, {"error": {"status": "RESOURCE_EXHAUSTED"}}) if name == "gemini" else claude_error(429, "rate_limit_error")
    calls = []

    def flaky(request):
        calls.append(1)
        return limited if len(calls) == 1 else ok(request)

    assert generate(app_with(make(flaky))).status_code == 200 and len(calls) == 2
    r = generate(app_with(make(lambda req: limited, retries=1)))
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] == "rate_limited"


# 6: malformed or wrong-shaped model output is an error, and nothing is saved
@pytest.mark.parametrize("name", PROVIDERS)
@pytest.mark.parametrize(
    "text,kind",
    [("Sure! Here are some ideas you could post.", "invalid_json"), ('{"items": [', "invalid_json"), ('{"items": "nope"}', "schema_mismatch"), ('{"items": []}', "schema_mismatch"), ('{"wrong": 1}', "schema_mismatch")],
)
def test_malformed_json_is_rejected(name, text, kind):
    make = PROVIDERS[name][0]
    wrap = (lambda t: gemini_body(t)) if name == "gemini" else (lambda t: claude_body(t))
    client = app_with(make(lambda req: (200, wrap(text))))
    r = generate(client)
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] == kind
    assert text not in r.text and stored(client) == 0


# 7: an empty answer is an error
@pytest.mark.parametrize(
    "make,response",
    [
        (gemini, (200, gemini_body(""))),
        (gemini, (200, gemini_body(None))),
        (gemini, (200, {"candidates": []})),
        (gemini, (200, {"promptFeedback": {"blockReason": "SAFETY"}})),
        (claude, (200, claude_body("   "))),
        (claude, (200, {**claude_body(""), "content": []})),
    ],
)
def test_empty_response_is_rejected(make, response):
    client = app_with(make(lambda req: response))
    r = generate(client)
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] in {"empty_response", "unexpected_response"} and stored(client) == 0


@pytest.mark.parametrize("make,response", [(gemini, (200, gemini_body('{"items": [', finish="MAX_TOKENS"))), (claude, (200, claude_body('{"items": [', stop="max_tokens")))])
def test_a_cut_off_answer_is_reported_as_truncated(make, response):
    r = generate(app_with(make(lambda req: response)))
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] == "truncated"


# 8: an unavailable provider (5xx or unreachable) is retried, then a 502
@pytest.mark.parametrize("make", [gemini, claude])
@pytest.mark.parametrize("failure", ["503", "500", "unreachable"])
def test_provider_unavailable(make, failure):
    calls = []

    def handler(request):
        calls.append(1)
        if failure == "unreachable":
            raise Unreachable
        status = int(failure)
        return (status, {"error": {"status": "UNAVAILABLE"}}) if make is gemini else claude_error(status, "api_error")

    client = app_with(make(handler))
    r = generate(client)
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] in {"server_error", "network"} and len(calls) == 3
    assert generate(client, use_ai=False).status_code == 200  # the rule engine does not depend on the provider


def test_a_wrong_model_name_is_reported_without_retry():
    calls = []

    def handler(request):
        calls.append(1)
        return (404, {"error": {"status": "NOT_FOUND"}})

    r = generate(app_with(gemini(handler)))
    assert r.json()["error"]["details"]["kind"] == "model_not_found" and len(calls) == 1


# 9: the provider is chosen by configuration
def test_switching_provider_by_configuration():
    def pick(**kw):
        return build_provider(Settings(environment="test", **kw))

    assert isinstance(pick(ai_provider="mock"), MockProvider)
    assert isinstance(pick(ai_provider="gemini", gemini_api_key="k"), GeminiProvider)
    assert isinstance(pick(ai_provider="claude", anthropic_api_key="k"), ClaudeProvider)
    assert pick(ai_provider="gemini", gemini_api_key="k", gemini_model="gemini-2.5-pro").model == "gemini-2.5-pro"
    # a key for the other provider does not satisfy the selected one
    with pytest.raises(AINotConfiguredError):
        pick(ai_provider="claude", gemini_api_key="k")


def test_a_failing_provider_does_not_break_the_next_request_after_switching():
    down = app_with(gemini(lambda req: (503, None)))
    assert generate(down).status_code == 502
    up = app_with(claude(PROVIDERS["claude"][1]))
    assert generate(up).json()["data"]["recommendations"][0]["generation"]["provider"] == "claude"


# 10: no key means mock mode and rules-only both still work
def test_no_key_mock_mode_works_and_a_missing_key_is_explicit():
    client = TestClient(create_app(make_settings(load_mock_data=True)))
    r = generate(client)
    assert r.status_code == 200 and r.json()["data"]["recommendations"][0]["generation"]["provider"] == "mock"

    unconfigured = TestClient(create_app(make_settings(load_mock_data=True, ai_provider="gemini")))
    r = generate(unconfigured)
    assert r.status_code == 503 and r.json()["error"]["code"] == "ai_not_configured"
    assert generate(unconfigured, use_ai=False).status_code == 200


def test_the_key_goes_only_to_the_provider_and_never_into_a_response_or_log(caplog):
    seen = {}

    def handler(request):
        seen["header"], seen["url"], seen["body"] = request.headers.get("x-goog-api-key"), str(request.url), request.content.decode()
        return (401, None)

    with caplog.at_level("DEBUG"):
        r = generate(app_with(gemini(handler)))
    assert seen["header"] == SECRET and SECRET not in seen["url"] and SECRET not in seen["body"]
    assert SECRET not in r.text and SECRET not in caplog.text


# The final validation done in Python
DRAFT = {"title": "Festive saree edit", "hook": "Three looks in 30 seconds", "caption_direction": "Show the 3 drapes. #sarees", "call_to_action": "Visit the store"}


@pytest.mark.parametrize(
    "change",
    [{"hook": "5 looks in 30 seconds"}, {"call_to_action": "Visit the store, 20% off"}, {"title": "Viral saree edit"}, {"caption_direction": "Show the 3 drapes. #sarees #sale"}, {"call_to_action": "Order at https://example.com"}, {"hook": "Trending: three looks in 30 seconds"}],
)
def test_ai_wording_that_adds_facts_is_rejected(change):
    with pytest.raises(AIProviderError) as e:
        check_wording(DRAFT, {**DRAFT, **change})
    assert e.value.kind == "unsafe_content"


def test_ai_wording_that_only_rephrases_is_accepted():
    check_wording(DRAFT, {"title": "A festive saree edit", "hook": "3 looks, 30 seconds", "caption_direction": "Walk through the 3 drapes. #Sarees", "call_to_action": "Drop by the store"})


def test_unsafe_wording_through_the_api_saves_nothing():
    client = app_with(gemini(lambda req: (200, gemini_body(echo(gemini_prompt(req), hook="Going viral: 10x your reach")))))
    r = generate(client)
    assert r.status_code == 502 and r.json()["error"]["details"]["kind"] == "unsafe_content" and stored(client) == 0
