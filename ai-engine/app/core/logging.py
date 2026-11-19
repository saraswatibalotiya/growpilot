"""Structured JSON logging with request IDs. Secrets are redacted before anything is written."""

import json
import logging
import re
from contextvars import ContextVar

_request_id: ContextVar[str] = ContextVar("request_id", default="-")

# Keys and key-shaped tokens are masked wherever they appear in a log line.
_SECRET = re.compile(r"([a-z+]+://[^\s/@:]+:[^\s/@]+@[^\s]+|password=[^\s&\"]+|sk-[A-Za-z0-9_\-]{8,}|AIza[0-9A-Za-z_\-]{20,}|Bearer\s+[A-Za-z0-9._\-]{8,}|(api[_-]?key|token|secret)=[^\s&\"]+)", re.IGNORECASE)
_RESERVED = set(logging.LogRecord("", 0, "", 0, "", (), None).__dict__) | {"message", "asctime"}


def set_request_id(value: str) -> None:
    _request_id.set(value)


def get_request_id() -> str:
    return _request_id.get()


def redact(text: str) -> str:
    return _SECRET.sub("[redacted]", text)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "event": redact(record.getMessage()),
            "request_id": get_request_id(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED and not key.startswith("_"):
                payload[key] = redact(value) if isinstance(value, str) else value
        if record.exc_info:
            payload["exception"] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, default=str, ensure_ascii=False)


logger = logging.getLogger("ai_engine")


def configure_logging(level: str = "INFO") -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(JsonFormatter())
    logger.handlers[:] = [handler]
    logger.setLevel(level)
    logger.propagate = False
