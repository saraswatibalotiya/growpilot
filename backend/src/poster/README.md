# Poster module

Turns a product photo into a finished 1080x1350 (4:5) Instagram poster. Claude **designs**; Sharp **draws**.
It never publishes. A poster is only attached to a draft post.

## Who does what

| Step | Who | Notes |
|---|---|---|
| Look at the photo, propose a design | Sonnet (`poster-design`) | Template, background, photo treatment, text positions, colours. Validated JSON. |
| Turn "make it look premium" into a change | Haiku (`poster-edit`) | Returns only the fields to change. It has no text or price fields, so it cannot write either. |
| Optional photo enhancement | Configured Gemini image editor | Cached separate photo copy; skipped when disabled or unavailable; original-photo fallback on failure. |
| Draw the poster | Sharp (`poster-renderer.ts`) | Deterministic local rendering; no model call for drawing itself. |

Claude describes a design. It never claims to have edited pixels, and the prompts say so.

## Endpoints (`/posters`, login required)

- `GET /options` templates and choices for the editor.
- `POST /generate` Sonnet designs, then the poster is drawn.
- `POST /render` redraws an owner-selected design without a design-model call. Shared context may still perform the optional cached Gemini enhancement unless `enhance=false`.
- `POST /edit` a short instruction: Haiku patches the design, then the poster is redrawn.
- `POST /:id/save` attaches the poster to a draft post as `posterImageUrl` (refused after approval).

The photo is given as `mediaId` or `imageUrl`; either must belong to the caller's business.

## Templates

`cover_card`, `minimal_studio` (cream, centred), `premium_editorial` (taupe, serif), `product_spotlight` (larger product),
`offer_poster` (**only** when the owner typed an offer). A default is chosen from the photo and category.

## Price and offer rules (enforced in code, not only in prompts)

- The price comes from the product record or a price the owner typed (`price`). Claude is told only *whether* a price
  exists, never the amount, and its schema has no price field.
- No verified price means no badge, whatever the design asks for.
- Text from Claude may not contain a number that is not in the owner's own headline, call to action, offer, price or shop name.
- An offer is the owner's own words, shown exactly. The Offer Poster is refused without one.
- Text colour is repaired for contrast (WCAG 4.5:1). Colours must be real hex values.

## Photo Preservation And Enhancement

`enhance` defaults to enabled. If Gemini is configured, the shared request context can make/reuse a portrait enhancement before design/render/edit. The original upload remains untouched. Already AI-edited assets are not enhanced again. Missing Gemini, quota failures, timeouts and rejected output do not block poster creation: the original is used; failed enhancement adds a note. Direct studio editing has a separate error contract.

Framed templates fit the photo without cropping/stretching, apply a gentle selected tone treatment, and place text around the frame. **`cover_card` is different:** it uses an attention-positioned 4:5 cover crop, full-canvas photo and top/bottom fades with text overlaid. Do not promise that this template preserves the complete source composition or that overlays can never obscure a product. Review the rendered result. The original upload is never modified: the poster is a new
`media_assets` row with `variant = 'poster'` and `source_asset_id` pointing at the original. The design is stored in that
row's `processing_json`. The same photo and design is served from storage with no redraw.

## Limits

- Portrait only (1080x1350). Sharp rendering itself does not remove/replace the background; the optional Gemini enhancement is a separate preprocessing step. A framed original keeps its real background, while cover-card rendering can crop its edges.
- Text is drawn with the server's fonts. Hindi/Marathi need a Devanagari font on the host (macOS has one; on Linux install
  `fonts-noto` or similar). Without it Devanagari text will not render correctly.
- Publishing uses the approved poster as the first slide, followed by the real photos, capped at ten slides. The separate publisher owns approval and live-account gates; this module never publishes.

## Tests

`npm test -- src/poster` (no network, no API key). Real-Claude checks are run by hand.
