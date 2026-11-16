import { BadGatewayException } from '@nestjs/common';
import { FakeProvider } from '../ai/test-helpers';
import { checkReelScript, REEL_SCRIPT_SYSTEM, ReelScriptService, reelScriptUser, timeScenes, wordRange, type ReelScriptInput } from './reel-script.service';

const input = (over: Partial<ReelScriptInput> = {}): ReelScriptInput => ({
  language: 'en', template: 'SHOWCASE', tone: 'elegant', captionLength: 'medium', hashtagLevel: 'medium', productName: 'Cotton Kurti', price: '899', offerText: null, businessName: 'Shree Fashion', instruction: null, ...over,
});

const EN_SCRIPT = 'Meet our new cotton kurti from Shree Fashion. Soft, light and perfect for every day, now available for just 899 rupees. Message us to order yours today.';
const good = (over: Record<string, unknown> = {}) => ({
  script: EN_SCRIPT,
  scenes: [{ label: 'intro', text: 'Cotton Kurti' }, { label: 'price', text: 'Only 899 rupees' }, { label: 'cta', text: 'Message us to order' }],
  caption: 'Cotton Kurti from Shree Fashion.',
  hashtags: ['#CottonKurti', '#Kurti', '#Fashion', '#Style', '#Ethnic', '#Women', '#Daily', '#Boutique'],
  ...over,
});

describe('caption length and hashtag level', () => {
  it('puts the owner\'s choices in the request', () => {
    const user = reelScriptUser(input({ captionLength: 'short', hashtagLevel: 'many' }));
    expect(user).toContain('Caption length: 1 short line');
    expect(user).toContain('Number of hashtags: 10 to 12');
  });

  it('wants as many hashtags as the level says', () => {
    expect(checkReelScript(good({ hashtags: ['#A1', '#B2', '#C3'] }), input({ hashtagLevel: 'few' }))).toBeNull();
    expect(checkReelScript(good({ hashtags: ['#A1', '#B2', '#C3'] }), input({ hashtagLevel: 'medium' }))).toContain('5 to 7');
  });
});

describe('checkReelScript', () => {
  it('accepts a script that sticks to the facts', () => {
    expect(checkReelScript(good(), input())).toBeNull();
  });

  it('rejects a voiceover that is too long or too short for 10 seconds', () => {
    expect(checkReelScript(good({ script: 'Too short.' }), input())).toContain('words');
    expect(checkReelScript(good({ script: EN_SCRIPT.repeat(3) }), input())).toContain('words');
  });

  it('rejects numbers that were not supplied', () => {
    expect(checkReelScript(good({ caption: 'Now only 499 rupees' }), input())).toContain('499');
  });

  it('rejects money and offer talk when no price or offer was given', () => {
    expect(checkReelScript(good(), input({ price: null }))).toBeTruthy();
    const noOffer = good({ script: EN_SCRIPT.replace('for just 899 rupees', 'with a big discount today'), scenes: [{ label: 'a', text: 'Cotton Kurti' }, { label: 'b', text: 'Soft and light' }, { label: 'c', text: 'Message us' }] });
    expect(checkReelScript(noOffer, input({ price: null }))).toContain('discount');
  });

  it('rejects the wrong language or script', () => {
    expect(checkReelScript(good(), input({ language: 'hi' }))).toBeTruthy();
    const hi = 'हमारी नई कॉटन कुर्ती आ गई है। नरम हल्की और रोज़ पहनने के लिए बिल्कुल सही। आज ही हमें संदेश भेजकर अपना ऑर्डर दें।';
    expect(checkReelScript(good({ script: hi, caption: 'नई कुर्ती', scenes: [{ label: 'a', text: 'कॉटन कुर्ती' }, { label: 'b', text: 'नरम और हल्की' }, { label: 'c', text: 'ऑर्डर करें' }] }), input({ language: 'hi', price: null }))).toBeNull();
  });

  it('requires 3 or 4 scenes and enough hashtags', () => {
    expect(checkReelScript(good({ scenes: good().scenes.slice(0, 2) }), input())).toContain('scenes');
    expect(checkReelScript(good({ hashtags: ['#a', '#b'] }), input())).toContain('hashtags');
  });
});

describe('timeScenes', () => {
  it('spreads scenes across the 10 seconds without overlap', () => {
    const scenes = timeScenes(good().scenes);
    expect(scenes[0]!.startSec).toBeGreaterThan(0);
    expect(scenes.at(-1)!.endSec).toBeLessThanOrEqual(10);
    scenes.slice(1).forEach((s, i) => expect(s.startSec).toBe(scenes[i]!.endSec));
  });
});

describe('duration', () => {
  it('scales the word budget, the prompt and the scene timing with the Reel length', () => {
    expect(wordRange('en', 10)).toEqual([18, 32]);
    const [lo30, hi30] = wordRange('en', 30);
    expect(lo30).toBeGreaterThan(50);
    expect(hi30).toBeLessThan(110);
    expect(reelScriptUser({ language: 'en', template: 'SHOWCASE', tone: 'elegant', captionLength: 'medium', hashtagLevel: 'medium', productName: 'Kurti', price: null, offerText: null, businessName: 'Shop', instruction: null, duration: 15 })).toContain('Reel length: 15 seconds');
    expect(timeScenes([{ label: 'a', text: 'x' }, { label: 'b', text: 'y' }], 30).at(-1)!.endSec).toBeCloseTo(29.7, 1);
  });
});

describe('prompt', () => {
  it('forbids inventing facts and passes only supplied facts', () => {
    expect(REEL_SCRIPT_SYSTEM).toContain('Never invent');
    const user = reelScriptUser(input({ price: null, instruction: 'for weddings' }));
    expect(user).toContain('Price: not provided');
    expect(user).toContain('Offer text: not provided');
    expect(user).toContain('for weddings');
  });
});

describe('ReelScriptService', () => {
  it('returns timed scenes and clean hashtags', async () => {
    const provider = new FakeProvider().queue('reel-script', good());
    const out = await new ReelScriptService(provider as never).write(input());
    expect(out.script).toBe(EN_SCRIPT);
    expect(out.scenes).toHaveLength(3);
    expect(out.hashtags).toHaveLength(7); // the default level is medium: at most 7
  });

  it('repairs once with the reason, then gives up with a safe error', async () => {
    const provider = new FakeProvider().queue('reel-script', good({ caption: 'Only 499 rupees' }), good());
    await new ReelScriptService(provider as never).write(input());
    expect(provider.calls[1]!.user).toContain('499');

    const failing = new FakeProvider().queue('reel-script', good({ caption: 'Only 499' }), good({ caption: 'Only 499' }));
    await expect(new ReelScriptService(failing as never).write(input())).rejects.toBeInstanceOf(BadGatewayException);
  });
});
