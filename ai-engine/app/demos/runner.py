"""Loads a demo dataset into a fresh in-memory container and generates recommendations from it. FICTIONAL SAMPLE DATA only."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

from app.api.dependencies import Container, build_container
from app.core.config import Settings
from app.demos.datasets import DATA_DIR, EVAL_DATE
from app.schemas.analytics import PostIn
from app.schemas.audience import CommentIn
from app.schemas.profile import ProfileCreate
from app.schemas.recommendation import GenerateRequest, Recommendation
from app.schemas.trend import Trend

DEMO_KEYS = ("restaurant", "fashion_creator", "travel_creator", "beauty_creator", "new_business")


class ExtraTrends:
    """The bundled sample trends plus the demos' own. Both are fictional; freshness is still judged on the evaluation date."""

    name = "demo"

    def __init__(self, base, extra: list[Trend]):
        self.base, self.extra = base, extra

    def list_trends(self) -> list[Trend]:
        have = {t.trend_id for t in self.extra}
        return [*self.extra, *(t for t in self.base.list_trends() if t.trend_id not in have)]


def read_demo(key: str, directory: Path = DATA_DIR) -> dict:
    return json.loads((directory / f"{key}.json").read_text(encoding="utf-8"))


def make_container() -> Container:
    return build_container(Settings(environment="test", load_mock_data=False))


def load_demo(container: Container, key: str) -> str:
    """Creates the demo profile with its posts and comments and makes its sample trends available. Returns the profile id."""
    raw = read_demo(key)
    pid = raw["profile_id"]
    container.store.create(ProfileCreate.model_validate(raw["profile"]), profile_id=pid)
    container.store.set_posts(pid, [PostIn.model_validate(p) for p in raw["posts"]], replace=True)
    container.store.set_comments(pid, [CommentIn.model_validate(c) for c in raw["comments"]], None, replace=True)
    current = container.trends.provider
    base, extra = (current.base, current.extra) if isinstance(current, ExtraTrends) else (current, [])
    container.trends.provider = ExtraTrends(base, [*extra, *(Trend.model_validate(t) for t in raw["trends"])])
    return pid


def run_demo(key: str, *, as_of: date = EVAL_DATE, count: int = 4, container: Container | None = None) -> tuple[Container, str, list[Recommendation], list[str]]:
    container = container or make_container()
    pid = load_demo(container, key)
    recs, notes = container.recommendations.generate(GenerateRequest(profile_id=pid, as_of=as_of, count=count))
    return container, pid, recs, notes
