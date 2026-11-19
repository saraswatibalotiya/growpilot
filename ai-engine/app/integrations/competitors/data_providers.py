"""Where competitor PUBLIC post data can come from, behind one interface.

The engine never assumes it can read arbitrary accounts. Instagram's official APIs expose only what the account holder's
permissions, the account type and the endpoint allow, and that changes. So the sources are separate and honest about what they can do:

* UserSuppliedProvider: the owner supplies public information (posts, captions, visible likes). Works today.
* OfficialInstagramProvider: a placeholder for official API access where Meta permits it (for example public professional accounts
  through an authorised token). NOT IMPLEMENTED: calling it raises a clear error. Verify Meta's current documentation and
  permissions before building it.
* SampleProvider: the bundled FICTIONAL fixtures, for demos and tests only.

There is deliberately no scraping provider: no login bypass, no rate-limit evasion, no unofficial endpoints.
"""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel

from app.core.exceptions import AppError
from app.schemas.competitor import CompetitorDataSource, CompetitorPost


class DataSourceNotAvailableError(AppError):
    status_code = 501
    code = "competitor_data_source_not_available"


class ProviderCapabilities(BaseModel):
    name: str
    data_source: CompetitorDataSource
    can_fetch_public_posts: bool
    available: bool
    official_api: bool
    requires_credentials: bool
    description: str
    limitations: list[str]


class CompetitorDataProvider(Protocol):
    name: str

    def capabilities(self) -> ProviderCapabilities: ...
    async def fetch_public_posts(self, username: str, limit: int) -> list[CompetitorPost]: ...


class UserSuppliedProvider:
    name = "user_supplied"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name=self.name, data_source=CompetitorDataSource.USER_SUPPLIED, can_fetch_public_posts=False, available=True, official_api=False, requires_credentials=False,
            description="The owner enters or imports public information about a competitor (POST /competitors/{id}/posts).",
            limitations=["Only as complete and current as what the owner supplies.", "The engine can not verify it. It says where it came from in every result."],
        )

    async def fetch_public_posts(self, username: str, limit: int) -> list[CompetitorPost]:
        raise DataSourceNotAvailableError("This source does not fetch anything. Supply the competitor's public posts with POST /competitors/{id}/posts.")


class OfficialInstagramProvider:
    name = "official_instagram"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name=self.name, data_source=CompetitorDataSource.OFFICIAL_API, can_fetch_public_posts=True, available=False, official_api=True, requires_credentials=True,
            description="Official Instagram API access to other accounts' public data, where Meta permits it. Not implemented in this version.",
            limitations=["Depends on Meta's current permissions, app review, the account's type (usually public professional accounts) and the endpoint.", "Arbitrary accounts' private analytics are never available.", "Needs the owner's authorised token, held by the application that owns the Instagram connection, not by this engine."],
        )

    async def fetch_public_posts(self, username: str, limit: int) -> list[CompetitorPost]:
        raise DataSourceNotAvailableError("Official Instagram competitor data is not implemented yet. Supply public posts with POST /competitors/{id}/posts.")


class SampleProvider:
    name = "sample"

    def capabilities(self) -> ProviderCapabilities:
        return ProviderCapabilities(
            name=self.name, data_source=CompetitorDataSource.SAMPLE_PROVIDER, can_fetch_public_posts=False, available=True, official_api=False, requires_credentials=False,
            description="Bundled FICTIONAL competitors for demos and tests. Not real accounts.",
            limitations=["Invented data. Never present it as real competitor intelligence."],
        )

    async def fetch_public_posts(self, username: str, limit: int) -> list[CompetitorPost]:
        raise DataSourceNotAvailableError("Sample competitors already carry their fictional posts; there is nothing to fetch.")


def all_providers() -> list[CompetitorDataProvider]:
    return [UserSuppliedProvider(), OfficialInstagramProvider(), SampleProvider()]
