# AI module

Turns what a shop owner says (voice transcript or text) and a product photo into Instagram content, using Claude.
It **generates content only**. It never publishes: publishing needs the owner's separate approval and the existing
publishing workflow, and nothing in this module can call it.

## Models

| Tier | Env var | Used for |
|---|---|---|
| **Haiku** (light, fast) | `CLAUDE_HAIKU_MODEL` | Intent classification, extracting product / price / offer, understanding an edit instruction, conversation summaries |
| **Sonnet** (quality, vision) | `CLAUDE_SONNET_MODEL` | Photo analysis, captions, headlines, CTAs, hashtags, Hindi / Marathi / English writing, poster specification, editing a draft |

`ModelRouterService` maps each task to a tier. There is **no automatic fallback from Sonnet to Haiku**: if Sonnet is
unavailable the request fails clearly rather than returning weaker marketing copy.

Model IDs live only in the environment (`ai.config.ts` holds the defaults used when a variable is unset). To change a
model, edit `.env` and restart:

```env
CLAUDE_SONNET_MODEL=claude-sonnet-5-5
CLAUDE_HAIKU_MODEL=claude-haiku-5-5
```

The code sends no `temperature`, `thinking`, `effort` or forced `tool_choice`, so it works with any current model
(newer ones reject some of those). Structured output uses `output_config.format` with Zod schemas.

## Setup

1. `npm install` (adds `@anthropic-ai/sdk` and `zod`).
2. Put a real key in `backend/.env`: `ANTHROPIC_API_KEY=sk-ant-...`. Never expose it to the frontend.
3. Optional: set the model IDs and timeouts from `.env.example`.
4. Restart the API. Swagger at `/docs` lists the three `AI` endpoints.

Without a key the API still starts. AI endpoints answer `503 The AI service is not configured`.

## Architecture

```
POST /ai/*  ->  AiController (HTTP only)
                  -> AiOrchestratorService   sequences one request, saves the draft, records the conversation
                       -> BusinessContextService      trusted facts from the existing database, owner-scoped
                       -> IntentClassificationService Haiku: intent, product, price, offer, tone, language
                       -> ImageAnalysisService        validates the URL, then Sonnet vision
                       -> ContentGenerationService    Sonnet + checks in code
                       -> ContentEditingService       Haiku plan, Sonnet edit + checks in code
                       -> ConversationSummaryService  Haiku summary stored as a system message
                  all model calls -> ClaudeProviderService (the only class that talks to Anthropic)
                                     ModelRouterService (task -> model), PromptBuilderService (versioned prompts)
```

Context comes from the existing tables: `businesses`, `business_preferences`, `products`, the last 5 approved or
published `generated_posts`, and the conversation (a stored summary plus the last 6 messages). No RAG, embeddings or
vector search. Missing facts are passed as `null` and as a "not provided" list. They are never guessed.

## Accuracy: how invented facts are blocked

Prompts forbid inventing prices, offers, specs, addresses, contacts, stock, delivery, warranty, testimonials and
achievements. A prompt is not a guarantee, so the same rules are enforced in code (`facts.ts`):

- **Entities are grounded.** An extracted price must appear in the owner's words; a discount's numbers must too.
- **Every number in generated text** (headline, caption, CTA, hashtags, poster text) must come from the owner's words,
  the product record, or the shop's own name and descriptions. Otherwise the reply is rejected.
- **The price is never the model's.** The price shown comes from the owner's words or the product record, and we format
  it ourselves (`₹899`). If none exists, the poster price is `null`.
- **Offer poster only with an offer.** `boutique_special_offer_01` is replaced by the new-arrival template unless the
  owner stated a discount.
- **Language is checked** (Hindi and Marathi must be Devanagari, English must be Latin), as are hashtags and poster identifiers.
- A rejected reply gets **one repair attempt** that says exactly what was wrong. Still wrong: a safe `502`, never fabricated content.

## Photos

Claude fetches the image itself, so before any request the URL must be `https`, on a trusted host
(`AI_TRUSTED_IMAGE_HOSTS`, default `res.cloudinary.com`), under our Cloudinary cloud path, **and** be a photo this
shop uploaded through `/media/upload` (type and size were validated at upload). JPEG, PNG and WEBP up to 5 MB.
If Claude can't read an accepted photo, content is still generated and `warnings` says so. Claude describes the photo;
it does not edit pixels. Poster rendering stays separate.

## Endpoints

All require the normal login token. All are rate limited. All validate UUIDs and length limits.

### `POST /ai/classify-intent` (Haiku)
```json
{ "conversationId": "uuid", "transcript": "New cotton kurtis aaye hain. Ek attractive post banao." }
```
```json
{ "intent": "CREATE", "confidence": 0.96, "language": "hi",
  "entities": { "productName": "Cotton kurtis", "price": null, "discount": null, "tone": "attractive" },
  "requiresClarification": false, "clarificationQuestion": null }
```
`intent` is one of `CREATE EDIT REGENERATE PUBLISH CANCEL ASK_QUESTION`. A `PUBLISH` intent is only information: this module never publishes.

### `POST /ai/generate-content` (Haiku, then Sonnet)
```json
{ "conversationId": "uuid", "postId": "uuid", "productId": "uuid", "imageUrl": "https://res.cloudinary.com/...",
  "transcript": "New cotton kurtis aaye hain. Ek attractive post banao.", "language": "hi" }
```
`postId`, `productId`, `imageUrl` and `language` are optional. Language order: request, shop preference, transcript.
Response: `language`, `productUnderstanding {name, category, price}`, `headline`, `caption`, `callToAction`,
`hashtags`, `posterSpecification {template, theme, layout, headline, priceText, ctaText}`, `imageAnalysis`,
`warnings`, `postId`, `postStatus`, `promptVersion`. If an essential fact is missing (for example a sale with no
discount), the response is `{ "requiresClarification": true, "clarificationQuestion": "..." }` and nothing is generated.
With `postId`, the content is saved to that draft and the post moves `DRAFT -> CONTENT_GENERATED -> PREVIEW_READY`.
It is never moved to approved or published.

### `POST /ai/edit-content` (Haiku plans, Sonnet edits)
```json
{ "conversationId": "uuid", "postId": "uuid", "instruction": "Make it shorter and use Marathi. Remove the price." }
```
Returns the complete updated draft plus `changesApplied`. Only the requested parts change; confirmed prices are kept
unless changed or removed; removing a price removes it from the caption, headline, CTA, hashtags and poster text;
changing language translates and keeps product names and facts. Approved or published posts return `409`.

## Errors

| Situation | Response |
|---|---|
| Missing/invalid fields, bad image URL, image not uploaded through GrowPilot | 400 |
| Conversation, product or post is not yours | 404 |
| Post already approved/published, closed conversation | 409 |
| Model declined the request | 422 |
| Rate limited (ours, or Anthropic's) | 429 |
| Model returned unusable output twice | 502 |
| No/invalid API key, unknown model | 503 (generic message; details only in server logs) |
| Anthropic timeout | 504 |

The SDK retries 408/429/5xx and connection errors with backoff (`AI_MAX_RETRIES`, default 2). Authentication and
validation errors are never retried. Logs carry only task, model, request id, latency, token counts and error category:
no transcripts, images or keys. Token and call counts per model are kept in memory (`usageSnapshot()`) for later cost monitoring.

## Prompts and versions

Prompts are in `prompts/v1/*.prompt.ts`. Stable rules sit in `system`; business facts and the owner's words sit in the
user turn inside tags, and the system prompt tells the model to treat tagged text as data, not instructions. To ship new
wording as a new version, copy `prompts/v1` to `prompts/v2`, edit it, and change the import and `PROMPT_VERSION`.
Responses report `promptVersion`.

## Tests

```bash
npm test -- src/ai      # all AI tests, no network, no API key needed
```
Every model reply in the tests is canned and checked against the real Zod schema. No real Anthropic call is made.
