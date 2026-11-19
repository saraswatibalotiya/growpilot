"""Settings, read from the environment (and an ai-engine/.env file). Nothing here needs a paid key to start."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class ScoreWeights(BaseSettings):
    """Weights of the opportunity score. They are normalised over the signals that are actually available."""

    model_config = SettingsConfigDict(env_prefix="WEIGHT_", extra="ignore")

    historical: float = 0.25
    audience: float = 0.20
    trend: float = 0.20
    festival: float = 0.15
    competitor: float = 0.10
    goal: float = 0.10

    @model_validator(mode="after")
    def _positive(self) -> "ScoreWeights":
        values = self.as_dict().values()
        if any(v < 0 for v in values) or sum(values) <= 0:
            raise ValueError("score weights must be non-negative and sum to more than zero")
        return self

    def as_dict(self) -> dict[str, float]:
        return {
            "historical": self.historical,
            "audience": self.audience,
            "trend": self.trend,
            "festival": self.festival,
            "competitor": self.competitor,
            "goal": self.goal,
        }


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # AI providers. `mock` needs no key and is the default.
    ai_provider: Literal["mock", "gemini", "claude"] = Field(default="mock", alias="AI_PROVIDER")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")
    claude_model: str = Field(default="claude-sonnet-5-5", alias="CLAUDE_MODEL")
    ai_timeout_seconds: float = Field(default=30.0, gt=0, le=120, alias="AI_TIMEOUT_SECONDS")
    ai_max_retries: int = Field(default=2, ge=0, le=5, alias="AI_MAX_RETRIES")
    ai_max_output_tokens: int = Field(default=2048, ge=256, le=8192, alias="AI_MAX_OUTPUT_TOKENS")

    # HTTP surface.
    cors_origins: str = Field(default="", alias="CORS_ORIGINS", description="Comma-separated origins. Empty = none.")
    max_body_bytes: int = Field(default=2_000_000, ge=1_000, alias="MAX_BODY_BYTES")
    service_token: str | None = Field(default=None, alias="SERVICE_TOKEN", description="Shared secret for service-to-service calls.")

    rate_limit_per_minute: int = Field(default=300, ge=0, alias="RATE_LIMIT_PER_MINUTE", description="Requests per minute per caller (0 turns the limit off). Health checks are not counted")

    # Data and analysis.
    load_mock_data: bool = Field(default=True, alias="LOAD_MOCK_DATA")
    default_timezone: str = Field(default="Asia/Kolkata", alias="DEFAULT_TIMEZONE")
    min_posts_for_baseline: int = Field(default=5, ge=2, alias="MIN_POSTS_FOR_BASELINE")
    min_posts_per_format: int = Field(default=3, ge=2, alias="MIN_POSTS_PER_FORMAT")
    min_posts_for_timing: int = Field(default=12, ge=4, alias="MIN_POSTS_FOR_TIMING")
    min_comments_for_audience: int = Field(default=10, ge=1, alias="MIN_COMMENTS_FOR_AUDIENCE")
    trend_max_age_days: int = Field(default=14, ge=1, alias="TREND_MAX_AGE_DAYS")
    min_learning_samples: int = Field(default=3, ge=2, alias="MIN_LEARNING_SAMPLES")

    # Storage. `memory` (default) needs nothing and loses data on restart; `postgres` persists everything in the `ai_engine` schema.
    storage_backend: Literal["memory", "postgres"] = Field(default="memory", alias="STORAGE_BACKEND")
    database_url: SecretStr | None = Field(default=None, alias="DATABASE_URL", description="postgresql+asyncpg://user:password@host:port/database. Never logged or returned.")
    db_pool_size: int = Field(default=5, ge=1, le=50, alias="DB_POOL_SIZE")
    db_max_overflow: int = Field(default=5, ge=0, le=50, alias="DB_MAX_OVERFLOW")
    db_connect_timeout_seconds: float = Field(default=5.0, gt=0, le=60, alias="DB_CONNECT_TIMEOUT_SECONDS")
    db_command_timeout_seconds: float = Field(default=30.0, gt=0, le=300, alias="DB_COMMAND_TIMEOUT_SECONDS")

    # Trends and festivals. The defaults keep the bundled FICTIONAL samples so the engine runs with nothing configured.
    trend_provider: Literal["sample", "file", "none"] = Field(default="sample", alias="TREND_PROVIDER")
    trend_data_file: str | None = Field(default=None, alias="TREND_DATA_FILE")
    festival_data_file: str | None = Field(default=None, alias="FESTIVAL_DATA_FILE")
    festival_include_bundled_verified: bool = Field(default=True, alias="FESTIVAL_INCLUDE_BUNDLED_VERIFIED", description="Official calendars shipped with the engine (currently India 2027)")
    festival_include_sample: bool = Field(default=True, alias="FESTIVAL_INCLUDE_SAMPLE", description="False hides the bundled approximate festival dates")

    weights: ScoreWeights = Field(default_factory=ScoreWeights)

    @field_validator("log_level")
    @classmethod
    def _level(cls, value: str) -> str:
        return value.upper()

    @model_validator(mode="after")
    def _file_provider_needs_file(self) -> "Settings":
        if self.trend_provider == "file" and not self.trend_data_file:
            raise ValueError("TREND_DATA_FILE must be set when TREND_PROVIDER=file")
        return self

    @model_validator(mode="after")
    def _postgres_needs_url(self) -> "Settings":
        if self.storage_backend == "postgres":
            url = self.database_url.get_secret_value() if self.database_url else ""
            if not url.startswith("postgresql+asyncpg://"):
                # The message never includes the value: it may contain a password.
                raise ValueError("DATABASE_URL must be set to a postgresql+asyncpg:// URL when STORAGE_BACKEND=postgres")
        return self

    @model_validator(mode="after")
    def _production_needs_auth(self) -> "Settings":
        # No unauthenticated production access: a production start without a service token is refused.
        if self.environment == "production" and not self.service_token:
            raise ValueError("SERVICE_TOKEN must be set when ENVIRONMENT=production")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
