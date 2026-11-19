"""Wiring: one container per app holds the store, settings and services. Routes only ever ask for what they need."""

from dataclasses import dataclass, field

from fastapi import Request

from app.ai.provider import AIProvider, build_provider
from app.core.config import Settings
from app.integrations.competitors.provider_interface import MockCompetitorProvider
from app.integrations.trends.file_provider import FileTrendProvider
from app.integrations.trends.provider_interface import EmptyTrendProvider, MockTrendProvider
from app.repositories.base import Store
from app.repositories.memory import InMemoryStore
from app.services.analytics_service import AnalyticsService
from app.services.audience_service import AudienceService
from app.services.competitor_service import CompetitorService
from app.services.feedback_service import FeedbackService
from app.services.festival_service import FestivalService
from app.services.outcome_service import OutcomeService
from app.services.profile_service import ProfileService
from app.services.recommendation_service import RecommendationService
from app.services.trend_service import TrendService


@dataclass
class Container:
    settings: Settings
    store: Store
    profiles: ProfileService
    analytics: AnalyticsService
    audience: AudienceService
    competitors: CompetitorService
    trends: TrendService
    festivals: FestivalService
    recommendations: RecommendationService
    feedback: FeedbackService
    outcomes: OutcomeService
    _provider: AIProvider | None = field(default=None, repr=False)

    def ai_provider(self) -> AIProvider:
        """Built on first use, so a missing key is reported when AI is requested, not at startup. Raises AINotConfiguredError.
        One instance is reused so its HTTP connections are pooled."""
        if self._provider is None:
            self._provider = build_provider(self.settings)
        return self._provider

    async def aclose(self) -> None:
        if self._provider is not None:
            await self._provider.aclose()


def create_store(settings: Settings) -> Store:
    """PostgreSQL application storage; memory is available only in explicitly configured automated tests."""
    if settings.storage_backend == "postgres":
        from app.repositories.postgres import PostgresStore

        assert settings.database_url is not None  # guaranteed by Settings validation
        return PostgresStore(settings.database_url.get_secret_value(), pool_size=settings.db_pool_size, max_overflow=settings.db_max_overflow, connect_timeout=settings.db_connect_timeout_seconds, command_timeout=settings.db_command_timeout_seconds)
    return InMemoryStore()


def create_trend_provider(settings: Settings):
    if settings.trend_provider == "file":
        return FileTrendProvider(settings.trend_data_file or "")
    if settings.trend_provider == "none":
        return EmptyTrendProvider()
    return MockTrendProvider()


def build_container(settings: Settings, store: Store | None = None) -> Container:
    store = store or create_store(settings)
    profiles, analytics, audience = ProfileService(store), AnalyticsService(store, settings), AudienceService(store, settings)
    competitors, trends, festivals = CompetitorService(store, MockCompetitorProvider()), TrendService(store, create_trend_provider(settings), settings), FestivalService.from_settings(settings)
    return Container(
        settings=settings, store=store, profiles=profiles, analytics=analytics, audience=audience, competitors=competitors, trends=trends, festivals=festivals,
        recommendations=RecommendationService(store, settings, analytics, audience, competitors, trends, festivals),
        feedback=FeedbackService(store, settings.min_learning_samples),
        outcomes=OutcomeService(store, analytics, settings.min_learning_samples),
    )


def get_container(request: Request) -> Container:
    return request.app.state.container
