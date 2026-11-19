# Competitor intelligence

Three layers, all built on **public information only**. Nothing here scrapes Instagram, bypasses a login, works around a rate
limit or uses an unofficial endpoint. Competitors' private analytics (reach, views, saves, shares, demographics) are not available to
anyone else and the engine never reports or guesses them.

## Where the data comes from (and what is not built)

Instagram's official APIs do not let an application freely read arbitrary accounts. What is accessible depends on Meta's current
permissions, app review, the account type and the endpoint, and it changes. So data sources sit behind one interface
(`app/integrations/competitors/data_providers.py`, listed by `GET /api/v1/competitors/providers`):

| Source | Status | What it is |
|---|---|---|
| `user_supplied` | **works** | The owner enters or imports public information about a competitor: `POST /competitors/{id}/posts` |
| `official_instagram` | **not implemented** | Placeholder for official API access where Meta permits it. Calling it returns 501. It needs the owner's authorised token, which belongs to the application that owns the Instagram connection (NestJS), not this engine. Check Meta's current documentation and permissions before building it |
| `sample` | works (demo only) | The bundled **fictional** competitors. Never real |

Every competitor records `data_source` (where its posts came from) separately from `source` (how it was found: `MANUAL` or
`AI_SUGGESTED`), so results can always say whether they rest on user-supplied, fictional-sample or official data.

Competitor discovery today is: add a handle yourself, or get suggestions from the bundled **fictional sample** provider. It does not
search the real Instagram. Real discovery needs a permitted source and is future work.

## Layer A: discovery

| Action | Endpoint |
|---|---|
| Add a handle (approved at once) | `POST /competitors` |
| Search suggestions by name/handle/keyword and category | `POST /competitors/suggest` with optional `query`, `category` |
| Review | `GET /competitors?status=PENDING` |
| Approve or reject | `PATCH /competitors/{id}/approval` |
| Supply their recent public posts | `POST /competitors/{id}/posts` (`replace` true or false) |

Suggestions are hypotheses: saved `PENDING`, unverified, and **never analysed or used in recommendations until approved**. A rejected
competitor is not suggested again.

## Layer B: analysis

`GET /competitors/{id}/insights?profile_id=&as_of=` for one approved competitor, `GET /competitors/landscape?profile_id=&as_of=` for
all of them together.

| Question | Where it is answered |
|---|---|
| Which competitors are active? | `activity`: ACTIVE (posted within 21 days of `as_of`), SLOWING (within 60), INACTIVE (older), UNKNOWN; `last_post_at` |
| What are they publishing / which topics? | `top_topics`, `themes` (their share of posts and yours, per topic) |
| Which formats? | `format_mix`; `format_engagement` (posts and visible public interactions by format) |
| Posting frequency? | `posts_per_week` |
| Captions and hashtags? | `top_hashtags` (used at least twice) |
| Engagement patterns? | `format_engagement` and the "most public likes" observation. Visible likes depend on that account's size: compared **within** the account, never against yours |
| What are they missing / what do I lack? | `low_coverage_topics`, `differentiation_opportunities`, and the landscape's `gaps` |

Honest rules:

* A topic counts as a **gap** only when a competitor covers it in at least 20% of its posts (and at least twice) while you cover it in under 10% of yours, **and you have at least 5 posts** so your own coverage can be judged.
* Competitors silent for over 60 days are listed but left out of topic and gap analysis.
* Posts dated after the evaluation date (`as_of`) are ignored, so evaluating a past day does not use the future.
* Fewer than 5 competitor posts, or fewer than 3 competitors, are called tentative in the caveats.

## Layer C: competitive recommendations

Approved, active competitors feed the `competitor` signal. A topic several of them cover that you barely do becomes an idea. Example
from the fictional demo:

> **Start a weekly behind the scenes series** (opportunity 11, confidence 66)
> Evidence: *3 of 3 approved competitors repeatedly post about 'behind the scenes' (13 public posts). You have 1 of your 24 posts on it.*

* One competitor gives a single-account "cover this topic" idea with lower confidence; two or more give a "weekly series" idea.
* Confidence rises with the number of competitors that agree and with how many posts each rests on.
* The ideas say "Do not mention other accounts" in their caption direction, and carry a caveat if the data is fictional sample data.
* **Scores stay honest.** The competitor signal is one of six (default weight 0.10), so such an idea scores modestly. Because it is easy to miss, when 4 or more ideas are requested one cross-competitor gap (2+ competitors, strength 0.6 or more) is guaranteed a place, and a note says so. It never displaces your own proven winners.
* Dismissed, "not relevant" or already-posted ideas are not offered again, and `excluded_topics` are respected.

## Try it (fictional data)

```bash
python -m app.demos --demo restaurant --with-competitors --count 5
pytest tests/quality/test_competitor_intelligence.py
```

## Limits

* No real competitor discovery or automatic fetching exists yet (see the table above). Quality depends on what the owner supplies.
* Topic classification is the same keyword lexicon as everywhere else; a competitor's niche vocabulary outside it is missed.
* Public likes and comments can be hidden or missing; missing is never treated as zero.
* Competitor posts are stored as given. Do not import anything that was collected against Instagram's terms.
