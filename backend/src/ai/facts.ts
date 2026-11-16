import type { Language } from '../common/constants';
/**
 * Fact guard. The prompts tell the model never to invent prices, discounts or other numbers, but a prompt is
 * not a guarantee. These helpers check the output in code: every number in generated text must come from the
 * owner's own words, the product record, or the shop's own name and descriptions.
 */

const DEVANAGARI_DIGITS = '०१२३४५६७८९';

/** Hindi and Marathi digits (०-९) become ASCII so "८९९" and "899" compare equal. */
export function normaliseDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

/** Digit groups in the text, with thousands commas removed: "₹1,299" -> "1299". */
export function numbersIn(text: string): string[] {
  const found = normaliseDigits(text).match(/\d+(?:[.,]\d+)*/g) ?? [];
  return found.map((n) => n.replace(/,(?=\d{3}\b)/g, '').replace(/\.0+$/, ''));
}

export function allowedNumbers(sources: Array<string | null | undefined>): Set<string> {
  const allowed = new Set<string>();
  for (const source of sources) {
    if (!source) continue;
    for (const n of numbersIn(source)) allowed.add(n);
  }
  return allowed;
}

/** Numbers that appear in generated text but in none of the trusted sources. */
export function unsupportedNumbers(generated: Array<string | null | undefined>, allowed: Set<string>): string[] {
  const bad = new Set<string>();
  for (const text of generated) {
    if (!text) continue;
    for (const n of numbersIn(text)) if (!allowed.has(n)) bad.add(n);
  }
  return [...bad];
}

/** "899", "899.00" and "₹ 899/-" all become "899". Returns null when there is no usable price. */
export function cleanPrice(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const [first] = numbersIn(raw);
  if (!first || !/^\d{1,7}(\.\d{1,2})?$/.test(first)) return null;
  return first;
}

const DEVANAGARI = /[ऀ-ॿ]/g;
const LETTERS = /\p{L}/gu;

/**
 * Rough script check: Hindi and Marathi must be written mostly in Devanagari, English mostly in Latin.
 * Catches the model answering in the wrong language, which a schema can't.
 */
export function scriptMatches(language: Language, text: string): boolean {
  const letters = text.match(LETTERS)?.length ?? 0;
  if (letters === 0) return true;
  const devanagari = text.match(DEVANAGARI)?.length ?? 0;
  const ratio = devanagari / letters;
  return language === 'en' ? ratio < 0.2 : ratio > 0.5;
}

const HASHTAG = /^#[\p{L}\p{M}\p{N}_]{1,59}$/u;

/** Normalises model hashtags to "#Tag": drops invalid ones and duplicates, caps the count. */
export function cleanHashtags(tags: string[], max = 8): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, '');
    const withHash = tag.startsWith('#') ? tag : `#${tag}`;
    if (!HASHTAG.test(withHash)) continue;
    const key = withHash.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(withHash);
    if (out.length === max) break;
  }
  return out;
}

/** Prices written with a currency marker ("₹899", "Rs. 1,299", "899 रुपये"). Used to find the price in an existing draft. */
export function pricesMentioned(text: string): string[] {
  const t = normaliseDigits(text);
  const out = new Set<string>();
  const patterns = [/(?:₹|rs\.?|inr|रु\.?|रुपये|रुपया|rupees?)\s*([\d,]+(?:\.\d+)?)/gi, /([\d,]+(?:\.\d+)?)\s*(?:₹|rs\b\.?|inr|रु\.?|रुपये|रुपया|rupees?|\/-)/gi];
  for (const pattern of patterns) {
    for (const match of t.matchAll(pattern)) {
      const price = cleanPrice(match[1] ?? null);
      if (price) out.add(price);
    }
  }
  return [...out];
}
