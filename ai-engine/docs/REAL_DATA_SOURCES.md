# Trends and festivals: sources and verification

The bundled trends and festival dates are **fictional or approximate samples**. This document explains how real data gets in, and
how the engine avoids ever presenting sample data as real.

## Trends

Each trend carries: `topic`, `category`, `region` (geography), `source_name`, `source_url`, `source_type`
(`SEARCH_INTEREST`, `SOCIAL_PLATFORM`, `EDITORIAL`, `SAMPLE`), `first_observed_date`, `verified_date` (last observed), `direction`
(`RISING`/`STABLE`/`FALLING`/`UNKNOWN`), `evidence`, `confidence_score`, `expiry_date`, and `is_sample`.

| `TREND_PROVIDER` | Meaning |
|---|---|
| `sample` (default) | The bundled FICTIONAL trends. Always `is_sample: true`. Their evidence in recommendations says "FICTIONAL SAMPLE data" |
| `file` | A dataset **you** supply in `TREND_DATA_FILE` (format in `app/integrations/trends/file_provider.py`) |
| `none` | No trend source. The engine says no current trend was found and never claims one |

**The engine does not fetch trends from the internet.** Real sources have licences, quotas and terms that belong to whoever runs the
service: Google Trends has no official public API (do not scrape it), and social-platform data needs permitted access. Export what you
are licensed to use into the JSON format and point `TREND_DATA_FILE` at it.

A record in the file is **rejected, with the reason**, if it is marked as sample data, has no source name, has no `http(s)` source
URL, has no observation date, is observed in the future, or was "first observed" after it was last observed. See what was accepted
and rejected with `GET /api/v1/trends/sources`.

Freshness is judged on the evaluation date: a trend older than 14 days since its last observation is stale, past its expiry is expired,
and one observed after the evaluation date is unknown at that time. A trend is only used for a profile when its category fits
(a restaurant gets food trends, not fashion; a travel creator gets neither).

## Festivals

| Status | Meaning | May be called confirmed? |
|---|---|---|
| `RULE_FIXED_DATE` | Fixed by definition (Republic Day 26 Jan, Independence Day 15 Aug, Christmas 25 Dec, Women's Day, Valentine's Day, ...). **Computed for any year** | yes |
| `VERIFIED_SOURCE` | From a calendar you supply in `FESTIVAL_DATA_FILE`, naming its source | yes |
| `SAMPLE_UNVERIFIED` | The bundled approximate dates | **never** |

Lunar-calendar festivals (Diwali, Holi, Eid, Navratri, ...) have no fixed date and are **not computed or guessed**. They appear only from a
verified file, the bundled official 2027 list, or the bundled sample.

**Bundled official calendar (2027).** `app/data/festivals/festivals_verified_2027.json` holds 31 festivals taken from the Government of India
holiday list for 2027 (DoPT O.M. F.No.12/2/2023-JCA, July 2026, Annexures I and II; the source URL is in each record). Dates were cross-checked
against the weekdays printed in the source. Region, industry and theme tags are GrowPilot annotations, not part of the source. The list is for
Central Government offices in Delhi: observance can differ by state, and the Ministry may move Id-ul-Fitr, Id-ul-Zuha, Muharram and Id-e-Milad
after moon sighting (those records say so and recommendations add the caveat). `FESTIVAL_INCLUDE_BUNDLED_VERIFIED=false` removes it; your
`FESTIVAL_DATA_FILE` wins over it for the same festival and year. Other years still need a calendar you supply. For any other year they are simply absent, and `GET /api/v1/festivals/coverage?year=` says so, so a missing
festival is never mistaken for "no festival".

A verified file is a JSON list of `FestivalRecord` objects (`app/schemas/trend.py`) with `verification_status: "VERIFIED_SOURCE"`. A record is
rejected if its status is not that, if it has no source or the source says "sample"/"approximate", or if the year does not match the date.
When sources overlap the best wins (verified, then rule-based, then sample).

`FESTIVAL_INCLUDE_SAMPLE=false` removes the approximate dates entirely.

In recommendations, a festival idea carries "NOT confirmed: check it before scheduling" only when its date is sample data, and its
evidence states whether the date is confirmed.

## Not done

* No live Google Trends or social-platform connector (see above): the bundled trends remain fictional samples, so **do not present trends as real intelligence until you load a sourced dataset** (`TREND_PROVIDER=file`).
* Verified lunar-festival dates are bundled for 2027 only.
* Trend direction, evidence and observation dates are only as good as the file you supply. The engine validates completeness, not truth.
