API_VERSION = "v1"
API_PREFIX = f"/api/{API_VERSION}"
APP_NAME = "GrowPilot AI Engine"
APP_VERSION = "0.1.0"

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100

MAX_POSTS_PER_REQUEST = 500
MAX_COMMENTS_PER_REQUEST = 2000
MAX_COMPETITOR_POSTS = 200

#: Cross-cutting limits on free text, so one request can not carry an unbounded prompt-injection payload.
MAX_CAPTION_CHARS = 2200
MAX_COMMENT_CHARS = 1000
