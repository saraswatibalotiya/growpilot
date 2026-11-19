"""Placeholder for a FUTURE Instagram data source. Nothing here is connected to anything.

The engine never logs in to Instagram, never scrapes, and never holds Instagram credentials. Today it only receives post and
comment data in request bodies. In a later phase the NestJS backend (which owns the Instagram connection) is expected to read
the data through the official Graph API and pass it to the engine. See docs/NESTJS_INTEGRATION.md.
"""

from typing import Protocol

from app.schemas.analytics import PostIn
from app.schemas.audience import CommentIn


class InstagramDataSource(Protocol):
    """What a future, authorised data source would provide. Implementations must use official APIs only."""

    def recent_posts(self, profile_id: str, limit: int) -> list[PostIn]: ...
    def recent_comments(self, profile_id: str, limit: int) -> list[CommentIn]: ...
