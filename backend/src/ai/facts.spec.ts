import { allowedNumbers, cleanHashtags, cleanPrice, normaliseDigits, numbersIn, pricesMentioned, scriptMatches, unsupportedNumbers } from './facts';

describe('fact guard', () => {
  it('reads Hindi and Marathi digits as ASCII', () => {
    expect(normaliseDigits('कीमत ८९९ रुपये')).toBe('कीमत 899 रुपये');
    expect(numbersIn('₹८९९ और 1,299')).toEqual(['899', '1299']);
  });

  it('flags numbers that no trusted source supplied', () => {
    const allowed = allowedNumbers(['Price 899 rupees', null]);
    expect(unsupportedNumbers(['Only ₹899 today'], allowed)).toEqual([]);
    expect(unsupportedNumbers(['Now just ₹599, 20% off'], allowed).sort()).toEqual(['20', '599']);
  });

  it('cleans prices to digits and rejects nonsense', () => {
    expect(cleanPrice('₹ 899/-')).toBe('899');
    expect(cleanPrice('899.00')).toBe('899');
    expect(cleanPrice('899.50')).toBe('899.50');
    expect(cleanPrice('free')).toBeNull();
    expect(cleanPrice(null)).toBeNull();
  });

  it('finds prices written with a currency marker', () => {
    expect(pricesMentioned('Only ₹899 today')).toEqual(['899']);
    expect(pricesMentioned('Rs. 1,299 मात्र')).toEqual(['1299']);
    expect(pricesMentioned('८९९ रुपये')).toEqual(['899']);
    expect(pricesMentioned('3 colours available')).toEqual([]);
  });

  it('checks the script of Hindi, Marathi and English text', () => {
    expect(scriptMatches('hi', 'नया कलेक्शन आ गया है')).toBe(true);
    expect(scriptMatches('mr', 'नवीन कलेक्शन उपलब्ध आहे')).toBe(true);
    expect(scriptMatches('en', 'New collection is here')).toBe(true);
    expect(scriptMatches('hi', 'New collection is here')).toBe(false);
    expect(scriptMatches('en', 'नया कलेक्शन आ गया है')).toBe(false);
  });

  it('cleans hashtags, including Devanagari with vowel signs', () => {
    expect(cleanHashtags(['CottonKurti', '#New Arrivals', '#नयाकलेक्शन', 'bad<tag>', '#cottonkurti', ''])).toEqual(['#CottonKurti', '#NewArrivals', '#नयाकलेक्शन']);
    expect(cleanHashtags(Array.from({ length: 20 }, (_, i) => `tag${i}`)).length).toBe(8);
  });
});
