import type { ReelLanguage, ReelScene, ReelTemplate } from '../reels.constants';

/** Every piece of on-screen text in the Reel, one owner per scene. No sentence appears twice. */
export interface ReelCopy {
  /** Scene 1, small, top. Null when the business has no usable name. */
  brand: string | null;
  /** Scene 1, the strong product title. */
  title: string;
  /** Scene 1 pill, e.g. "NEW ARRIVAL". */
  kicker: string | null;
  /** Scene 2, one supporting line. */
  showcase: string | null;
  /** Scene 3, up to two short feature labels. */
  features: string[];
  /** Scene 4. Null when no price was supplied. */
  price: string | null;
  /** Scene 4. Only the owner's own words. */
  offer: string | null;
  /** Scene 4 call to action. */
  cta: string;
}

const NEW_LABEL: Record<ReelLanguage, string> = { en: 'NEW ARRIVAL', hi: 'नया आगमन', mr: 'नवीन आगमन' };
const CTA: Record<ReelLanguage, string> = { en: 'DM now', hi: 'अभी DM करें', mr: 'आता DM करा' };

/** Lower-case letters and digits only, so "Cotton Kurti!" and "cotton kurti" count as the same line. */
export const normalise = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** One line repeats another when either contains the other after normalising. */
function repeats(candidate: string, seen: string[]): boolean {
  const c = normalise(candidate);
  return !c || seen.some((s) => s === c || (s.length >= 4 && c.includes(s)) || (c.length >= 4 && s.includes(c)));
}

export function buildCopy(input: {
  language: ReelLanguage;
  template: ReelTemplate;
  productName: string;
  businessName: string | null;
  scenes: ReelScene[];
  priceText: string | null;
  offerText: string | null;
}): ReelCopy {
  const seen: string[] = [];
  const take = (text: string | null | undefined): string | null => {
    const t = text?.replace(/\s+/g, ' ').trim();
    if (!t || repeats(t, seen)) return null;
    seen.push(normalise(t));
    return t;
  };

  const title = take(input.productName) ?? input.productName.trim();
  const brand = take(input.businessName);
  const kicker = input.template === 'NEW_ARRIVALS' ? take(NEW_LABEL[input.language]) : null;
  const price = take(input.priceText);
  const offer = take(input.offerText);

  const lines = input.scenes.map((s) => take(s.text)).filter((t): t is string => t !== null);
  const showcase = lines.shift() ?? null;
  // The script's last line is usually its call to action; use it when it is not needed as a feature.
  const scriptCta = lines.length >= 2 ? lines.pop()! : null;
  const features = lines.slice(0, 2);
  const cta = scriptCta ?? take(CTA[input.language]) ?? CTA[input.language];
  return { brand, title, kicker, showcase, features, price, offer, cta };
}

/** Every visible line, for the no-repeats check. */
export const copyLines = (c: ReelCopy): string[] => [c.brand, c.title, c.kicker, c.showcase, ...c.features, c.price, c.offer, c.cta].filter((t): t is string => !!t);
