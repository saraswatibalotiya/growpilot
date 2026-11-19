"""Deterministic provider for development and tests. Needs no key and no network.

It does not write anything new: it returns the drafts it was given, whitespace-tidied, in the real response format. That keeps
the whole AI path (prompt, parsing, validation, diagnostics) exercised without pretending to be a language model.
"""

import json

from app.ai.provider import AIProvider


class MockProvider(AIProvider):
    name = "mock"
    model = "mock-1"

    def __init__(self, **kwargs):
        super().__init__(max_retries=0, **kwargs)

    async def _complete_once(self, system: str, prompt: str) -> str:
        # The drafts are in the last <data> block (the instructions mention the tag earlier in the text).
        start, end = prompt.rfind("<data>"), prompt.rfind("</data>")
        drafts = json.loads(prompt[start + len("<data>") : end]) if start != -1 and end > start else []
        items = [{k: " ".join(str(v).split()) for k, v in d.items()} for d in drafts]
        return json.dumps({"items": items})
