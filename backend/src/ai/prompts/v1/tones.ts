import type { CaptionLength, Tone } from '../../../common/constants';

/** What each tone means for the writer. The model gets the tone name and this guide. */
export const TONE_GUIDES: Record<Tone, string> = {
  professional: 'clear, polished and trustworthy; no slang, no emojis',
  trendy: 'fresh and current, short punchy lines, a few well-placed emojis',
  friendly: 'warm and chatty, like talking to a regular customer',
  luxury: 'refined and exclusive, calm confident words, no exclamation marks',
  promotional: 'sales-focused and urgent, lead with the benefit or offer, clear call to action',
  storytelling: 'a tiny story or moment around the product that draws the reader in',
  funny: 'light, playful humour and wordplay; never mock customers or other brands',
  minimal: 'very few words, clean and simple',
  festive: 'celebratory and joyful, in the spirit of the occasion',
  influencer: 'confident, personal and energetic, like a creator recommending a find',
  elegant: 'graceful and understated, soft words, quiet confidence',
  local: 'everyday neighbourhood-shop voice, simple local words and warmth, the way a shopkeeper talks to nearby customers',
};

/** Caption size for a post (a few sentences) and for a reel (a few short lines). */
export const POST_CAPTION_GUIDES: Record<CaptionLength, string> = {
  short: '1 short sentence',
  medium: '2 to 3 short sentences',
  long: '4 to 5 sentences',
};
export const REEL_CAPTION_GUIDES: Record<CaptionLength, string> = {
  short: '1 short line',
  medium: '2 short lines',
  long: '3 short lines',
};
