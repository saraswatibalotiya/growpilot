# Poster module

Turns a product photo into a finished 1080x1350 (4:5) Instagram poster. Claude **designs**; Sharp **draws**.
It never publishes. A poster is only attached to a draft post.

## Who does what

| Step | Who | Notes |
|---|---|---|
| Look at the photo, propose a design | Sonnet (`poster-design`) | Template, background, photo treatment, text positions, colours. Validated JSON. |
| Turn "make it look premium" into a change | Haiku (`poster-edit`) | Returns only the fields to change. It has no text or price fields, so it cannot write either. |
| Draw the poster | Sharp (`poster-renderer.ts`) | Deterministic. Free. No AI. |

Claude describes a design. It never claims to have edited pixels, and the prompts say so.

## Endpoints (`/posters`, login required)

- `GET /options` templates and choices for the editor.
- `POST /generate` Sonnet designs, then the poster is drawn.
- `POST /render` the owner changed a selector: the poster is redrawn, **no AI call**.
- `POST /edit` a short instruction: Haiku patches the design, then the poster is redrawn.
- `POST /:id/save` attaches the poster to a draft post as `posterImageUrl` (refused after approval).

The photo is given as `mediaId` or `imageUrl`; either must belong to the caller's business.

## Templates

`minimal_studio` (cream, centred), `premium_editorial` (taupe, serif), `product_spotlight` (larger product),
`offer_poster` (**only** when the owner typed an offer). A default is chosen from the photo and category.

## Price and offer rules (enforced in code, not only in prompts)

- The price comes from the product record or a price the owner typed (`price`). Claude is told only *whether* a price
  exists, never the amount, and its schema has no price field.
- No verified price means no badge, whatever the design asks for.
- Text from Claude may not contain a number that is not in the owner's own headline, call to action, offer, price or shop name.
- An offer is the owner's own words, shown exactly. The Offer Poster is refused without one.
- Text colour is repaired for contrast (WCAG 4.5:1). Colours must be real hex values.

## Photo is preserved

The photo is fitted inside its frame (never cropped or stretched), gets a gentle tone adjustment only if chosen
(`brighter`, `vivid`, `soft`: a few percent), and rounded corners. Text, badge and ribbon are placed in the space around
the frame and never overlap it (tested for every template). The original upload is never modified: the poster is a new
`media_assets` row with `variant = 'poster'` and `source_asset_id` pointing at the original. The design is stored in that
row's `processing_json`. The same photo and design is served from storage with no redraw.

## Limits

- Portrait only (1080x1350). No background removal: the real background stays inside the frame.
- Text is drawn with the server's fonts. Hindi/Marathi need a Devanagari font on the host (macOS has one; on Linux install
  `fonts-noto` or similar). Without it Devanagari text will not render correctly.
- Publishing still posts the post's photos. The poster is saved as the post's poster image and shown as its cover in the preview.

## Tests

`npm test -- src/poster` (no network, no API key). Real-Claude checks are run by hand.
