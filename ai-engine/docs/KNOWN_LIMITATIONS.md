# Known limitations

## The demo data and what it proves

- **All demo data is fictional.** The five datasets in `app/demos/data/` (restaurant, fashion creator, travel creator, beauty creator,
  new business) and their trends were invented. Their engagement numbers are not real-world benchmarks and say nothing about how any
  real account performs.
- **The demos are a regression suite, not proof of accuracy.** The patterns were designed so the engine has something to find, and
  the datasets were rebalanced while validating (a topic that makes up most posts becomes the account's baseline, so it can not look
  like a winner). Passing them shows that known failure modes are fixed. It does not show the advice would work on a real account.
- **No outcome validation.** Nothing here measures whether following a recommendation improved results. The opportunity score is a
  ranking signal, not a forecast.

## Engine

- **Topic classification is a keyword lexicon** (about 25 topics, English/Hinglish/Devanagari). Unusual wording, sarcasm, new slang
  and topics outside the lexicon are missed, and a post can carry several labels, which blurs per-topic comparisons. Business names
  that contain a keyword can be misread.
- **Small samples are noisy.** A topic needs at least 3 posts to be compared. With 3 to 5 posts, one lucky post can make a "winner".
  The engine says how many posts a claim rests on, but it does not test statistical significance.
- **Source count alone does not determine opportunity.** It is a weighted mean over available signals. Missing sources are excluded; available sources that do not support an idea can lower its score. One strong signal does not necessarily score below several weak ones. Read confidence and evidence separately.
- **Ideas are templates**, filled with the profile's own words. They are specific to the business category but they are not
  creative copywriting. The optional AI step only polishes wording.
- **No real trend feed.** Bundled trends are fictional samples; there is no live Google Trends or social connector. See [REAL_DATA_SOURCES.md](REAL_DATA_SOURCES.md): you supply licensed trend data in a file. Lunar festivals are verified only for India 2027 (bundled Government of India list) or from a calendar you supply; fixed-date occasions are computed.
- **Festival logic is simple.** Relevance uses industry, region and days. Inputs combine verified-source calendars, computed fixed dates and optional `SAMPLE_UNVERIFIED` records. An eligible, sufficiently relevant imminent festival can receive a reserved selection slot for 4+ requests, subject to candidate eligibility/deduplication; it can displace an ordinary higher-scoring idea. A reservation is not an unconditional guarantee.
- **Competitor signals are not part of the five core demos.** They are exercised by a separate fictional restaurant scenario (`tests/quality/test_competitor_intelligence.py`). There is no real competitor discovery or fetching: data is supplied by the owner or comes from fictional samples. See [COMPETITOR_INTELLIGENCE.md](COMPETITOR_INTELLIGENCE.md).
- **Learning** needs 3 or more reactions per dimension and is capped at +/-8 points.
- **Dates.** `as_of` cuts off posts and comments dated later, but does not reconstruct a complete historical state. Owner hashtag reuse, current learning and some owner-side competitor comparisons can use current stored history. Posts are filtered
  by the default timezone (`DEFAULT_TIMEZONE`, Asia/Kolkata). Trends verified after `as_of` are ignored; trends older than 14 days
  are stale. Metrics are whatever was supplied: the engine does not backfill what Instagram had not yet reported on that day.
- **Live provider evidence is historical.** Earlier notes recorded invalid-key checks; valid-key behavior is covered by mocked wire tests and opt-in `tests/live`. This audit did not establish current account/model availability.
- **AI wording guard is lexical.** It rejects new digits, hashtags, links and words like "viral"/"trending"; it does not catch a new factual claim phrased in plain words or a spelled-out number.
- **PostgreSQL is required.** Application runs never fall back to memory. If the shared database is unavailable, persistence requests fail safely instead of reporting unsaved recommendations as successful. Memory storage is restricted to automated tests.
- **Demo CLI storage selection needs care.** Its runner builds test settings without explicitly selecting a store, so run demos with `STORAGE_BACKEND=memory` to avoid inherited application database settings. Normal application startup must still use PostgreSQL.
- **Development Compose is not production hardening.** It does not force production auth and exposes infrastructure ports. Harden credentials, networking, service authentication, ingress and backups before public deployment.
