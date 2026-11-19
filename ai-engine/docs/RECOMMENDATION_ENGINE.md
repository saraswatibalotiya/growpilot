# Recommendation engine

One pipeline for every profile; business and creator profiles differ only in the strategy that turns evidence into an idea.

```
signals (analytics, audience, approved competitors, current trends, upcoming festivals, learning)
  -> seeds         a reason to post, each with its own evidence
  -> candidates    strategy (business | creator) builds a concrete idea per seed
  -> signals       six 0-1 scores per candidate (None when the source does not exist)
  -> scoring       opportunity (0-100) and, separately, confidence (0-100)
  -> learning      bounded adjustment from past feedback and outcomes
  -> diversity     choose 3-5 that are not variations of one idea
  -> explanation   the seven questions, evidence list, sources, caveats
```

## Signals and weights

| Signal | Default weight | Source |
|---|---|---|
| historical | 0.25 | Topic performance index and best-format from the account's own posts |
| audience | 0.20 | Question themes, requests and concerns in comments |
| trend | 0.20 | Sourced trends that are fresh and relevant to the profile |
| festival | 0.15 | Upcoming festivals relevant to the profile and region |
| competitor | 0.10 | Topics approved competitors repeat that the account has not covered |
| goal | 0.10 | Fit to the goal (request override or profile goals) and stated preferences |

Weights come from `WEIGHT_*` env vars and are **renormalised over the signals that exist**.

- `None`: the source does not exist (no comments supplied, no current trend, no approved competitor). Excluded, not penalised.
- `0.0`: the source exists and gives this idea no support. This does lower the score.

## Opportunity vs confidence

- **Opportunity** = 100 x weighted mean of the available signals (+ learning adjustment). It ranks ideas. It is **not a prediction**
  of views, reach or sales.
- **Confidence** = quality of the supporting evidence (sample sizes, source confidence, freshness), scaled up when several
  independent sources agree and when more data sources exist. An idea backed by no data source gets a low confidence (<= 20).
  An idea can be high-opportunity and low-confidence, and the output says so.

## Strategies

Business ideas aim at sales, leads, product discovery and brand awareness (price posts, ordering walkthroughs, variants, festive
product showcases). Creator ideas aim at reach, saves, shares, community and education (tutorials, takes on trends, series, UGC).
Wording is industry-specific (fashion, jewellery, beauty, food, restaurant, travel, fitness, general).

## Diversity rules

No duplicate fingerprints or titles; no two ideas on the same topic (or near-same topic words); no more than ceil(count/2) of one
format or one seed kind; at most one festival idea unless five are requested. If too few ideas pass, rules relax in order and a
note says so. If fewer than `count` distinct supported ideas exist, fewer are returned with a note.

## Rules that protect users

- Excluded topics (profile setting) are removed from candidates.
- Hashtags appear only if a verified trend carries them or the owner already used them at least twice on that topic.
- Festival ideas get a publish date before the festival, never in the past. Past festivals are never recommended.
- Stale, expired or unsourced trends are never described as current.
- Ideas the owner dismissed, marked not relevant, already posted, created or published are not offered again.

## Learning (rule-based, not a trained model)

For each dimension (format, objective, driver tag) the engine tracks positive reactions (SAVED, LIKED, CREATED, PUBLISHED, and
outcomes at least 1.15x the format baseline) against negative ones (DISMISSED, NOT_RELEVANT, outcomes at most 0.85x). With at
least `MIN_LEARNING_SAMPLES` (3) reactions, matching ideas move by `8 x mean x n/(n+3)` points, never more than +/-8. `GET /learning`
lists every adjustment.

## Added during quality validation

- **Data sufficiency.** Confidence is multiplied by a factor for how much of the account's OWN data exists: x0.65 with no post
  history, x0.7 with fewer than 5 posts (no baseline), x0.85 with too few comments. Trends and festivals describe the market, so they
  can not make up for it. Every recommendation then carries a plain caveat saying what is missing.
- **Time-critical festival.** With 4+ ideas requested, the best idea for a relevant festival (relevance >= 0.8) within 30 days is
  guaranteed a place, and a note says so.
- **Same kind, same format.** Two ideas of the same seed kind in the same format count as one idea twice.
- **Labels.** An idea is matched to evidence by its subject only, never by template wording.
- **History cut-off.** Posts and comments dated after `as_of` are ignored.
