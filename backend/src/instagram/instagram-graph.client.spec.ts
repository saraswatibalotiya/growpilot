import { ConfigService } from '@nestjs/config';
import { InstagramGraphClient } from './instagram-graph.client';
import { MetaApiError } from './meta-api.error';

const TOKEN = 'EAAtoken';

function client(mode: 'live' | 'mock' = 'live') {
  return new InstagramGraphClient(new ConfigService({ INSTAGRAM_MODE: mode, INSTAGRAM_APP_ID: 'app', INSTAGRAM_APP_SECRET: 'secret' }));
}

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
const invalidMetric = (name: string) =>
  respond({ error: { message: `metric ${name} not supported for this media`, code: 100 } }, 400);

describe('InstagramGraphClient.getMediaInsights', () => {
  const fetchSpy = jest.spyOn(globalThis, 'fetch');
  afterEach(() => fetchSpy.mockReset());
  afterAll(() => fetchSpy.mockRestore());

  const metricsOf = (call: number) => new URL(String(fetchSpy.mock.calls[call]![0])).searchParams.get('metric');

  it('reads all metrics in one request', async () => {
    fetchSpy.mockResolvedValueOnce(respond({ data: [
      { name: 'reach', values: [{ value: 10 }] },
      { name: 'views', values: [{ value: 0 }] },
    ] }));
    const result = await client().getMediaInsights(TOKEN, 'media-1', ['reach', 'views', 'saves']);
    expect(result).toEqual({ reach: 10, views: 0, saves: null }); // missing -> null, real 0 stays 0
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(metricsOf(0)).toBe('reach,views,saves');
  });

  it('falls back to one metric at a time when one is unsupported, leaving it null', async () => {
    fetchSpy
      .mockResolvedValueOnce(invalidMetric('profile_visits')) // combined request rejected
      .mockResolvedValueOnce(respond({ data: [{ name: 'reach', values: [{ value: 7 }] }] }))
      .mockResolvedValueOnce(invalidMetric('profile_visits'));
    const result = await client().getMediaInsights(TOKEN, 'media-1', ['reach', 'profile_visits']);
    expect(result).toEqual({ reach: 7, profile_visits: null });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('does not swallow auth or rate-limit errors', async () => {
    fetchSpy.mockResolvedValueOnce(respond({ error: { message: 'token expired', code: 190 } }, 401));
    await expect(client().getMediaInsights(TOKEN, 'media-1', ['reach'])).rejects.toBeInstanceOf(MetaApiError);
    fetchSpy.mockResolvedValueOnce(respond({ error: { message: 'too many calls', code: 4 } }, 429));
    await expect(client().getMediaInsights(TOKEN, 'media-1', ['reach'])).rejects.toMatchObject({ isRateLimit: true });
  });

  it('never fabricates metrics in mock mode', async () => {
    const result = await client('mock').getMediaInsights(TOKEN, 'media-1', ['reach', 'views']);
    expect(result).toEqual({ reach: null, views: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('InstagramGraphClient Reel container', () => {
  let fetchSpy: jest.SpyInstance;
  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });
  afterEach(() => fetchSpy.mockRestore());

  it('creates a REELS container from the video URL', async () => {
    fetchSpy.mockResolvedValue(respond({ id: 'c1' }));
    await client().createReelContainer(TOKEN, '1784', { videoUrl: 'https://v/x.mp4', caption: 'Hi' });
    const body = new URLSearchParams(String((fetchSpy.mock.calls[0]![1] as RequestInit).body));
    expect(body.get('media_type')).toBe('REELS');
    expect(body.get('video_url')).toBe('https://v/x.mp4');
  });
});
