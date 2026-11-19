"""Turns model text into validated data. Anything that does not validate is an error, never a partial success."""

import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from app.core.exceptions import AIProviderError

M = TypeVar("M", bound=BaseModel)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def extract_json(text: str) -> object:
    cleaned = _FENCE.sub("", text.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start, end = cleaned.find("{"), cleaned.rfind("}")
        if start != -1 and end > start:
            try:
                return json.loads(cleaned[start : end + 1])
            except json.JSONDecodeError:
                pass
    raise AIProviderError("The AI provider did not return valid JSON.", kind="invalid_json")


def parse_model(text: str, model: type[M], provider: str | None = None) -> M:
    try:
        return model.model_validate(extract_json(text))
    except ValidationError as exc:
        # The error lists field names only, never the model's text.
        fields = sorted({".".join(str(p) for p in e["loc"]) for e in exc.errors()})
        raise AIProviderError(f"The AI response did not match the expected format (fields: {', '.join(fields)}).", kind="schema_mismatch", provider=provider) from exc
