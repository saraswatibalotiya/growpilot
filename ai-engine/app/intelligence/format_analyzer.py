from app.schemas.analytics import MediaFormat, PostIn
from app.schemas.profile import ContentFormat


def format_from(media_type: str | None, media_product_type: str | None = None) -> MediaFormat:
    """The Instagram format from the raw type strings. Competitor posts only carry a media type."""
    product = (media_product_type or "").upper()
    kind = (media_type or "").upper()
    if product in {"REELS", "REEL"} or kind == "REEL":
        return MediaFormat.REEL
    if product == "STORY" or kind == "STORY":
        return MediaFormat.STORY
    if kind in {"CAROUSEL_ALBUM", "CAROUSEL"}:
        return MediaFormat.CAROUSEL
    if kind == "IMAGE":
        return MediaFormat.IMAGE
    if kind == "VIDEO":
        return MediaFormat.VIDEO
    return MediaFormat.UNKNOWN


def media_format(post: PostIn) -> MediaFormat:
    """The Instagram format of a historical post."""
    return format_from(post.media_type, post.media_product_type)


def media_format_of_content(fmt: ContentFormat) -> MediaFormat:
    """Which Instagram media type a recommended content format normally uses."""
    return {
        ContentFormat.REEL: MediaFormat.REEL,
        ContentFormat.TUTORIAL: MediaFormat.REEL,
        ContentFormat.BEHIND_THE_SCENES: MediaFormat.REEL,
        ContentFormat.UGC_CONCEPT: MediaFormat.REEL,
        ContentFormat.CAROUSEL: MediaFormat.CAROUSEL,
        ContentFormat.EDUCATIONAL_POST: MediaFormat.CAROUSEL,
        ContentFormat.PRODUCT_SHOWCASE: MediaFormat.CAROUSEL,
        ContentFormat.SINGLE_IMAGE: MediaFormat.IMAGE,
        ContentFormat.PROMOTIONAL: MediaFormat.IMAGE,
        ContentFormat.STORY: MediaFormat.STORY,
    }[fmt]
