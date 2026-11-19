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
- **Single-source ideas score low.** Opportunity is a weighted mean over the available signals, so an idea backed by one strong
  source (say, one proven topic) scores lower than an idea several weak sources agree on. The confidence score and evidence list
  show which is which; do not read opportunity alone.
- **Ideas are templates**, filled with the profile's own words. They are specific to the business category but they are not
  creative copywriting. The optional AI step only polishes wording.
- **No real trend feed.** Bundled trends are fictional samples; there is no live Google Trends or social connector. See [REAL_DATA_SOURCES.md](REAL_DATA_SOURCES.md): you supply licensed trend data in a file. Lunar festivals are verified only for India 2027 (bundled Government of India list) or from a calendar you supply; fixed-date occasions are computed.
- **Festival logic is simple.** Relevance uses industry, region and distance in days. Dates are bundled sample data labelled
  `SAMPLE_UNVERIFIED` and must be confirmed. A relevant festival within 30 days is guaranteed a place when 4 or more ideas are asked
  for, which can push out a higher-scoring evergreen idea (the response says when it happens).
- **Competitor signals are not part of the five core demos.** They are exercised by a separate fictional restaurant scenario (`tests/quality/test_competitor_intelligence.py`). There is no real competitor discovery or fetching: data is supplied by the owner or comes from fictional samples. See [COMPETITOR_INTELLIGENCE.md](COMPETITOR_INTELLIGENCE.md).
- **Learning** needs 3 or more reactions per dimension and is capped at +/-8 points.
- **Dates.** `as_of` cuts off posts and comments dated later, so evaluating a past day does not use the future. Posts are filtered
  by the default timezone (`DEFAULT_TIMEZONE`, Asia/Kolkata). Trends verified after `as_of` are ignored; trends older than 14 days
  are stale. Metrics are whatever was supplied: the engine does not backfill what Instagram had not yet reported on that day.
- **Provider calls were verified live only for the invalid-key path.** The valid-key path for Gemini and Claude is covered by wire-format tests and an opt-in live test (`tests/live`) that needs your keys; run it before relying on a provider.
- **AI wording guard is lexical.** It rejects new digits, hashtags, links and words like "viral"/"trending"; it does not catch a new factual claim phrased in plain words or a spelled-out number.
- **Storage is in memory by default.** Restarting loses everything, including feedback and the learning built from it.
