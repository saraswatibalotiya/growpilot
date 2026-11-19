# Recommendation quality: expected vs actual

> **FICTIONAL SAMPLE DATA for testing. Not real Instagram data. Not a real-world benchmark.** The businesses, posts, comments, trends and engagement numbers below are invented to test the engine. None of it was observed on Instagram or elsewhere. Do not read any number here as a real-world benchmark.

Historical evaluation date: **2026-11-17**; 4 recommendations per demo; no approved competitors. The recorded tables and **42 of 42** result below are preserved, not re-executed or certified as a current test run.

Regenerate intentionally with `STORAGE_BACKEND=memory python -m app.demos --report`. The current report generator fixes the evaluation date/count; CLI `--as-of`/`--count` apply to ordinary demo runs, not `--report`. Explicit memory selection is for this test-only runner and prevents inherited application-database writes. Regeneration writes this file and currently restores older header wording; its template and report-equality test need a coordinated source follow-up, excluded from this documentation-only audit.

How to read it: each demo's expectation describes the invented pattern in `app/demos/datasets.py`. Each check compares that expectation with what the engine produced. Be aware that the datasets were rebalanced during validation (for example so that the winning topics are not the majority of posts, which would make them the baseline), so these demos are a regression suite for known failure modes, not an independent test of accuracy.

**Result: 42 of 42 checks pass.**

## Restaurant

**Expected:** Thali and biryani are the strong earners; offers and behind-the-scenes underperform. Comments ask about booking, price and delivery.

| Result | Check | Expected | Actual |
|---|---|---|---|
| PASS | specific to the business | >= 3 of 4 mention its own category terms | 4 of 4 |
| PASS | no other business's vocabulary | none | none |
| PASS | analytics finds the designed winners | one of ['regional food', 'biryani', 'festive menu', 'menu'] has index >= 1.10 | regional food 1.2091, biryani 1.0504, festive menu 1.2617, menu 1.2617 |
| PASS | a winning topic drives a recommendation | >= 1 recommendation cites historical evidence on a winning topic | 3 |
| PASS | winners rank near the top | the recommendation with the strongest historical signal is in the top 2 | rank 2 |
| PASS | losing topics are not promoted as strengths | none | none |
| PASS | generic trends are not used | none | none |
| PASS | opportunity and confidence are separate | scores are not identical across ideas | opportunity [64, 44, 37, 28] confidence [52, 42, 58, 48] |
| PASS | no thin-data caveat when data is sufficient | none | none |

**Actual recommendations**

| # | Opportunity | Confidence | Format | Title | Evidence behind it |
|---|---|---|---|---|---|
| 1 | 64 | 52 | REEL | More festive menu: build on what already works | Your 'festive menu' posts perform 26% above a typical post for their format (3 posts).; 'menu' is mentioned in 4 of 20 comments.; 'Restaurants announcing festive menus' is a current trend (Sample Trend Desk (fictional), verified 2026-11-11). This is FICTIONAL SAMPLE data, not a real-world observation. |
| 2 | 44 | 42 | TUTORIAL | The biryani video your audience asked for | 'biryani' content earns 2.2x your typical saves rate.; 'biryani' is mentioned in 2 of 20 comments. |
| 3 | 37 | 58 | PRODUCT_SHOWCASE | Spotlight: thali | Your 'regional food' posts perform 21% above a typical post for their format (7 posts).; 'regional food' is mentioned in 2 of 20 comments. |
| 4 | 28 | 48 | REEL | How to buy from us: order, book or visit in 20 seconds | 4 of 20 comments ask about delivery or booking (e.g. "Do you take bookings for 12 people?"). |

**Engine notes:** No approved competitors, so competitor signals were not used.

## Fashion Creator

**Expected:** Styling and ethnic wear win; product reviews, lifestyle vlogs and new arrivals lag.

| Result | Check | Expected | Actual |
|---|---|---|---|
| PASS | specific to the business | >= 3 of 4 mention its own category terms | 4 of 4 |
| PASS | no other business's vocabulary | none | none |
| PASS | analytics finds the designed winners | one of ['styling', 'ethnic wear'] has index >= 1.10 | ethnic wear 1.309, styling 1.4425 |
| PASS | a winning topic drives a recommendation | >= 1 recommendation cites historical evidence on a winning topic | 2 |
| PASS | winners rank near the top | the recommendation with the strongest historical signal is in the top 2 | rank 1 |
| PASS | losing topics are not promoted as strengths | none | none |
| PASS | generic trends are not used | none | none |
| PASS | opportunity and confidence are separate | scores are not identical across ideas | opportunity [63, 47, 43, 32] confidence [56, 60, 38, 38] |
| PASS | no thin-data caveat when data is sufficient | none | none |

**Actual recommendations**

| # | Opportunity | Confidence | Format | Title | Evidence behind it |
|---|---|---|---|---|---|
| 1 | 63 | 56 | CAROUSEL | Part two on styling: build on what is working | Your 'styling' posts perform 44% above a typical post for their format (8 posts).; 'styling' is mentioned in 3 of 20 comments. |
| 2 | 47 | 60 | TUTORIAL | By request: ethnic wear | Your 'ethnic wear' posts perform 31% above a typical post for their format (13 posts).; 'ethnic wear' is mentioned in 4 of 20 comments. |
| 3 | 43 | 38 | REEL | Wedding-season outfit planning: your take in fashion | 'bridal' content earns 1.4x your typical shares rate.; 'Wedding-season outfit planning' is a current trend (Sample Trend Desk (fictional), verified 2026-11-12). This is FICTIONAL SAMPLE data, not a real-world observation. |
| 4 | 32 | 38 | EDUCATIONAL_POST | Your fashion questions: where to buy or find, answered | Carousel is your best-performing format by engagement rate.; 2 of 20 comments ask about where to buy or find (e.g. "Where can I buy this kurta?"). |

**Engine notes:** No approved competitors, so competitor signals were not used.

## Travel Creator

**Expected:** Itineraries and budget travel win; solo travel, tips and vlogs lag. Comments ask about budget and stays.

| Result | Check | Expected | Actual |
|---|---|---|---|
| PASS | specific to the business | >= 3 of 4 mention its own category terms | 4 of 4 |
| PASS | no other business's vocabulary | none | none |
| PASS | analytics finds the designed winners | one of ['itineraries', 'budget travel'] has index >= 1.10 | itineraries 1.2806, budget travel 1.2812 |
| PASS | a winning topic drives a recommendation | >= 1 recommendation cites historical evidence on a winning topic | 1 |
| PASS | winners rank near the top | the recommendation with the strongest historical signal is in the top 2 | rank 1 |
| PASS | losing topics are not promoted as strengths | none | none |
| PASS | generic trends are not used | none | none |
| PASS | opportunity and confidence are separate | scores are not identical across ideas | opportunity [44, 22, 22, 18] confidence [44, 55, 40, 38] |
| PASS | no thin-data caveat when data is sufficient | none | none |

**Actual recommendations**

| # | Opportunity | Confidence | Format | Title | Evidence behind it |
|---|---|---|---|---|---|
| 1 | 44 | 44 | REEL | Part two on itineraries: build on what is working | Your 'itineraries' posts perform 28% above a typical post for their format (5 posts).; 'itinerary and costs' is mentioned in 6 of 20 comments. |
| 2 | 22 | 55 | REEL | Winter getaway planning: your take in travel | 'Winter getaway planning' is a current trend (Sample Trend Desk (fictional), verified 2026-11-10). This is FICTIONAL SAMPLE data, not a real-world observation. |
| 3 | 22 | 40 | CAROUSEL | Christmas: festive getaways that actually work | Christmas is on 2026-12-25 (date confirmed), 38 days away. Relevant to your travel focus. |
| 4 | 18 | 38 | EDUCATIONAL_POST | Your travel questions: price, answered | 2 of 20 comments ask about price (e.g. "कितना खर्चा आया?"). |

**Engine notes:** No approved competitors, so competitor signals were not used.

## Beauty Creator

**Expected:** Skincare and myths win; product reviews, makeup and vlogs lag. Comments ask about skin types and products.

| Result | Check | Expected | Actual |
|---|---|---|---|
| PASS | specific to the business | >= 3 of 4 mention its own category terms | 4 of 4 |
| PASS | no other business's vocabulary | none | none |
| PASS | analytics finds the designed winners | one of ['skincare', 'myths'] has index >= 1.10 | skincare 1.137, myths 1.2035 |
| PASS | a winning topic drives a recommendation | >= 1 recommendation cites historical evidence on a winning topic | 2 |
| PASS | winners rank near the top | the recommendation with the strongest historical signal is in the top 2 | rank 2 |
| PASS | losing topics are not promoted as strengths | none | none |
| PASS | generic trends are not used | none | none |
| PASS | opportunity and confidence are separate | scores are not identical across ideas | opportunity [71, 41, 28, 27] confidence [68, 30, 28, 44] |
| PASS | no thin-data caveat when data is sufficient | none | none |

**Actual recommendations**

| # | Opportunity | Confidence | Format | Title | Evidence behind it |
|---|---|---|---|---|---|
| 1 | 71 | 68 | TUTORIAL | By request: skincare | Your 'skincare' posts perform 14% above a typical post for their format (11 posts).; 'skincare' is mentioned in 6 of 20 comments.; 'Budget skincare routines' is a current trend (Sample Trend Desk (fictional), verified 2026-11-13). This is FICTIONAL SAMPLE data, not a real-world observation. |
| 2 | 41 | 30 | CAROUSEL | Part two on myths: build on what is working | Your 'myths' posts perform 20% above a typical post for their format (4 posts). 'myths' content earns 3.0x your typical shares rate. |
| 3 | 28 | 28 | REEL | The honest beauty post: what did not work and what I learned | 2 comments describe a problem or a negative experience, such as late delivery, quality, queues or results that did not work. |
| 4 | 27 | 44 | EDUCATIONAL_POST | Your beauty questions: where to buy or find, answered | Carousel is your best-performing format by engagement rate.; 2 of 20 comments ask about where to buy or find (e.g. "Where can I buy that serum?"). |

**Engine notes:** No approved competitors, so competitor signals were not used.

## New Business

**Expected:** Only 3 posts and 2 comments: there is almost nothing to learn from. Confidence must stay low and the output must say why.

| Result | Check | Expected | Actual |
|---|---|---|---|
| PASS | specific to the business | >= 1 of 4 mention its own category terms | 4 of 4 |
| PASS | no other business's vocabulary | none | none |
| PASS | generic trends are not used | none | none |
| PASS | opportunity and confidence are separate | scores are not identical across ideas | opportunity [41, 18, 18, 4] confidence [27, 12, 12, 12] |
| PASS | confidence is honest for thin data | <= 45 | 27 |
| PASS | thin data is explained in every recommendation | every recommendation has a data caveat | 4 of 4 |

**Actual recommendations**

| # | Opportunity | Confidence | Format | Title | Evidence behind it |
|---|---|---|---|---|---|
| 1 | 41 | 27 | REEL | Our take on: Budget skincare routines | 'Budget skincare routines' is a current trend (Sample Trend Desk (fictional), verified 2026-11-13). This is FICTIONAL SAMPLE data, not a real-world observation. |
| 2 | 18 | 12 | PRODUCT_SHOWCASE | Spotlight: rose soap | none (general best practice) |
| 3 | 18 | 12 | BEHIND_THE_SCENES | Behind the scenes: how neem soap is made | none (general best practice) |
| 4 | 4 | 12 | UGC_CONCEPT | Customers with rose soap: a community post | none (general best practice) |

**Caveats attached to every idea:** Fewer than 10 audience comments were available, so what your audience wants is not known yet. Only 3 posts are available (at least 5 are needed for a baseline), so your own performance can not be compared yet.

**Engine notes:** Too few comments to describe the audience reliably; audience signals were not used. No approved competitors, so competitor signals were not used. Not enough distinct strong ideas to apply every variety rule, so one was relaxed.

## Problems the validation found, and what changed

| # | Found | Cause | Fix |
|---|---|---|---|
| 1 | A restaurant was told to post more "festive wear". | The topic `festive wear` matched the bare word "festive". | `festive wear` now needs outfit words; a separate `festive menu` topic was added. |
| 2 | "Honest review of a budget serum" was classed as budget **travel**. | `budget` alone was a travel keyword. | Travel needs `budget travel`, `cost breakdown`, `cheap flights` and similar. |
| 3 | "Packing mistakes to avoid" was classed as a **myth**. | `mistakes` alone was a myths keyword. | Removed; `stop believing` added. |
| 4 | "Sunday thali special" was classed as a menu post. | `special` is too generic. | Removed. |
| 5 | `kurta` was not recognised as ethnic wear. | Missing keyword. | Added. |
| 6 | Every beauty idea looked like a skincare idea and picked up skincare's trend and audience scores. | Ideas were labelled from their own template text, which contains words like "routine". | Ideas are labelled only from their subject (and a trend's or festival's own theme text). |
| 7 | A trend about "winter getaways" boosted every idea about "travel". | A trend's topic fell back to its broad category. | A trend's topic is its own title. |
| 8 | Four near-identical "By request: ..." ideas filled the top of one list. | Only identical topics counted as duplicates. | The same kind of idea in the same format is allowed once; near-identical topic words count as the same topic. |
| 9 | Only the single best topic became a "build on what works" idea, and a topic with strong shares but weak engagement was called a winner. | Only one analytics insight was used. | Up to three genuinely strong topics (at least 10% above typical) are used; saves/shares lifts are merged with engagement and discounted when overall performance is weak. |
| 10 | Ideas said "your audience already loves it" when only shares or saves were high. | One wording for every metric. | The wording states exactly what the data showed. |
| 11 | A brand-new account got 46/100 confidence. | Trends and festivals (market data) raised confidence although the account's own data was missing. | Confidence is scaled by how much of the account's own data exists, and every idea carries a plain caveat saying what is missing. |
| 12 | Generic ideas ("The honest post...") did not mention the niche. | Templates had no subject. | Templates name the niche or product. |
| 13 | A close, relevant festival (Christmas, 15 days away) ranked 9th and never appeared. | Festival-only ideas lose to multi-source ideas, but a festival window cannot be postponed. | When 4 or more ideas are asked for, a relevant festival within 30 days keeps a place. |
| 14 | Evaluating a past date still used later posts and comments. | History was never cut off at `as_of`. | Posts and comments dated after `as_of` are ignored, and the response says how many. |
| 15 | "festive getawaies" and "festival trips" | Naive pluralisation and a wrong phrase. | Vowel-aware plurals; "festive getaway". |

