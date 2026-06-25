import { ConfigService } from '@nestjs/config';
import { NewsFetch, NewsService } from './news.service';

const SAMPLE_RSS = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0">
  <channel>
    <title>МАУП</title>
    <item>
      <title>Перша новина МАУП</title>
      <link>https://maup.com.ua/ua/news/first.html</link>
      <guid isPermaLink="true">https://maup.com.ua/ua/news/first.html</guid>
      <description><![CDATA[ Текст із <strong>HTML</strong> та &laquo;лапками&raquo;. ]]></description>
      <pubDate>2026-06-25 00:59:27</pubDate>
    </item>
    <item>
      <title>Зовнішнє посилання</title>
      <link>https://example.com/news.html</link>
      <description>Не має пройти host allowlist</description>
    </item>
  </channel>
</rss>`;

function createService(
  fetchMock: jest.MockedFunction<NewsFetch>,
  overrides: Record<string, string> = {},
) {
  const values: Record<string, string> = {
    MAUP_NEWS_FEED_URL: 'https://maup.com.ua/ua/feed.xml',
    MAUP_NEWS_FEED_ALLOWED_HOST: 'maup.com.ua',
    MAUP_NEWS_FEED_CACHE_TTL_MS: '600000',
    MAUP_NEWS_FEED_TIMEOUT_MS: '1000',
    MAUP_NEWS_FEED_MAX_ITEMS: '12',
    MAUP_NEWS_FEED_MAX_RESPONSE_BYTES: '100000',
    ...overrides,
  };
  const config = {
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;

  return new NewsService(config, fetchMock);
}

function xmlResponse(xml: string) {
  return Promise.resolve(
    new Response(xml, {
      status: 200,
      headers: {
        'content-length': String(Buffer.byteLength(xml, 'utf8')),
        'content-type': 'text/xml; charset=UTF-8',
      },
    }),
  );
}

describe('NewsService', () => {
  let fetchMock: jest.MockedFunction<NewsFetch>;

  beforeEach(() => {
    fetchMock = jest.fn<ReturnType<NewsFetch>, Parameters<NewsFetch>>();
  });

  it('loads, sanitizes and normalizes the MAUP RSS feed', async () => {
    fetchMock.mockReturnValueOnce(xmlResponse(SAMPLE_RSS));
    const service = createService(fetchMock);

    const result = await service.findLatest(10);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe('https://maup.com.ua/ua/feed.xml');
    expect((init.headers as Record<string, string>).Accept).toContain(
      'application/rss+xml',
    );
    expect(result).toEqual(
      expect.objectContaining({
        cached: false,
        stale: false,
        unavailable: false,
        sourceUrl: 'https://maup.com.ua/ua/feed.xml',
      }),
    );
    expect(result.items).toEqual([
      {
        id: 'https://maup.com.ua/ua/news/first.html',
        title: 'Перша новина МАУП',
        summary: 'Текст із HTML та «лапками».',
        url: 'https://maup.com.ua/ua/news/first.html',
        publishedAt: '2026-06-25 00:59:27',
      },
    ]);
  });

  it('serves fresh responses from cache within the configured TTL', async () => {
    fetchMock.mockReturnValueOnce(xmlResponse(SAMPLE_RSS));
    const service = createService(fetchMock);

    await service.findLatest(1);
    const cached = await service.findLatest(1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cached.cached).toBe(true);
    expect(cached.stale).toBe(false);
    expect(cached.items).toHaveLength(1);
  });

  it('returns stale cache instead of failing the dashboard', async () => {
    const nowSpy = jest.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1_000);
    fetchMock.mockReturnValueOnce(xmlResponse(SAMPLE_RSS));
    const service = createService(fetchMock, {
      MAUP_NEWS_FEED_CACHE_TTL_MS: '1',
    });

    await service.findLatest(1);

    nowSpy.mockReturnValueOnce(2_000);
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    const stale = await service.findLatest(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(stale.cached).toBe(true);
    expect(stale.stale).toBe(true);
    expect(stale.unavailable).toBe(true);
    expect(stale.items).toHaveLength(1);

    nowSpy.mockRestore();
  });

  it('returns an empty unavailable feed when there is no cache', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network error'));
    const service = createService(fetchMock);

    const result = await service.findLatest(3);

    expect(result.items).toEqual([]);
    expect(result.unavailable).toBe(true);
    expect(result.fetchedAt).toBeNull();
  });
});
