import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsFeedResponse, NewsItem } from './news.types';

export const NEWS_FEED_FETCH = Symbol('NEWS_FEED_FETCH');
export type NewsFetch = typeof fetch;

type CachedFeed = {
  feed: NewsFeedResponse;
  expiresAt: number;
};

const DEFAULT_FEED_URL = 'https://maup.com.ua/ua/feed.xml';
const DEFAULT_ALLOWED_HOST = 'maup.com.ua';
const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

@Injectable()
export class NewsService {
  private readonly logger = new Logger(NewsService.name);
  private readonly feedUrl: URL;
  private readonly allowedHost: string;
  private readonly cacheTtlMs: number;
  private readonly timeoutMs: number;
  private readonly maxItems: number;
  private readonly maxResponseBytes: number;

  private cache?: CachedFeed;

  constructor(
    private readonly config: ConfigService,
    @Inject(NEWS_FEED_FETCH) private readonly fetchImpl: NewsFetch,
  ) {
    this.feedUrl = new URL(
      this.config.get<string>('MAUP_NEWS_FEED_URL') ?? DEFAULT_FEED_URL,
    );
    this.allowedHost =
      this.config.get<string>('MAUP_NEWS_FEED_ALLOWED_HOST') ??
      DEFAULT_ALLOWED_HOST;
    this.cacheTtlMs = this.readNumber('MAUP_NEWS_FEED_CACHE_TTL_MS', 600_000);
    this.timeoutMs = this.readNumber('MAUP_NEWS_FEED_TIMEOUT_MS', 5_000);
    this.maxItems = Math.min(
      this.readNumber('MAUP_NEWS_FEED_MAX_ITEMS', 12),
      MAX_LIMIT,
    );
    this.maxResponseBytes = this.readNumber(
      'MAUP_NEWS_FEED_MAX_RESPONSE_BYTES',
      1_000_000,
    );
  }

  async findLatest(limit = DEFAULT_LIMIT): Promise<NewsFeedResponse> {
    const safeLimit = clampLimit(limit);
    const now = Date.now();

    if (this.cache && this.cache.expiresAt > now) {
      return this.withFlags(this.cache.feed, safeLimit, {
        cached: true,
        stale: false,
        unavailable: false,
      });
    }

    try {
      const feed = await this.fetchFeed();
      this.cache = {
        feed,
        expiresAt: now + this.cacheTtlMs,
      };

      return this.withFlags(feed, safeLimit, {
        cached: false,
        stale: false,
        unavailable: false,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `MAUP news feed unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
      );

      if (this.cache) {
        return this.withFlags(this.cache.feed, safeLimit, {
          cached: true,
          stale: true,
          unavailable: true,
        });
      }

      return {
        items: [],
        sourceUrl: this.feedUrl.toString(),
        fetchedAt: null,
        cached: false,
        stale: false,
        unavailable: true,
      };
    }
  }

  private async fetchFeed(): Promise<NewsFeedResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref();

    try {
      const response = await this.fetchImpl(this.feedUrl, {
        headers: {
          Accept: 'application/rss+xml, application/atom+xml, text/xml',
        },
        signal: controller.signal,
      });

      const declaredSize = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(declaredSize) &&
        declaredSize > this.maxResponseBytes
      ) {
        throw new Error('news feed response is too large');
      }

      if (!response.ok) {
        throw new Error(`news feed returned HTTP ${response.status}`);
      }

      const xml = await response.text();
      if (Buffer.byteLength(xml, 'utf8') > this.maxResponseBytes) {
        throw new Error('news feed response is too large');
      }

      const items = parseNewsFeed(xml)
        .filter((item) => this.isAllowedNewsUrl(item.url))
        .slice(0, this.maxItems);

      return {
        items,
        sourceUrl: this.feedUrl.toString(),
        fetchedAt: new Date().toISOString(),
        cached: false,
        stale: false,
        unavailable: false,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private withFlags(
    feed: NewsFeedResponse,
    limit: number,
    flags: Pick<NewsFeedResponse, 'cached' | 'stale' | 'unavailable'>,
  ): NewsFeedResponse {
    return {
      ...feed,
      ...flags,
      items: feed.items.slice(0, limit),
    };
  }

  private isAllowedNewsUrl(value: string): boolean {
    try {
      const url = new URL(value);
      return isAllowedHost(url.hostname, this.allowedHost);
    } catch {
      return false;
    }
  }

  private readNumber(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}

export function parseNewsFeed(xml: string): NewsItem[] {
  const rssItems = matchTagBlocks(xml, 'item');
  if (rssItems.length > 0) {
    return rssItems
      .map((item, index) => parseRssItem(item, index))
      .filter((item): item is NewsItem => item !== null);
  }

  return matchTagBlocks(xml, 'entry')
    .map((item, index) => parseAtomItem(item, index))
    .filter((item): item is NewsItem => item !== null);
}

function parseRssItem(block: string, index: number): NewsItem | null {
  const title = normalizeText(extractTag(block, 'title'));
  const url = normalizeUrl(extractTag(block, 'link'));
  const publishedAt = normalizeText(extractTag(block, 'pubDate')) || undefined;
  const summary = summarize(
    extractTag(block, 'description') ?? extractTag(block, 'content:encoded'),
  );
  const guid = normalizeText(extractTag(block, 'guid'));

  if (!title || !url) {
    return null;
  }

  return {
    id: guid || url || `${title}-${index}`,
    title,
    summary,
    url,
    publishedAt,
  };
}

function parseAtomItem(block: string, index: number): NewsItem | null {
  const title = normalizeText(extractTag(block, 'title'));
  const url = normalizeUrl(extractAtomLink(block));
  const publishedAt =
    normalizeText(extractTag(block, 'updated')) ||
    normalizeText(extractTag(block, 'published')) ||
    undefined;
  const summary = summarize(
    extractTag(block, 'summary') ?? extractTag(block, 'content'),
  );
  const id = normalizeText(extractTag(block, 'id'));

  if (!title || !url) {
    return null;
  }

  return {
    id: id || url || `${title}-${index}`,
    title,
    summary,
    url,
    publishedAt,
  };
}

function matchTagBlocks(xml: string, tag: string): string[] {
  const safeTag = escapeRegExp(tag);
  return Array.from(
    xml.matchAll(new RegExp(`<${safeTag}\\b[\\s\\S]*?<\\/${safeTag}>`, 'gi')),
    (match) => match[0],
  );
}

function extractTag(block: string, tag: string): string | undefined {
  const safeTag = escapeRegExp(tag);
  return block.match(
    new RegExp(`<${safeTag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${safeTag}>`, 'i'),
  )?.[1];
}

function extractAtomLink(block: string): string | undefined {
  return (
    extractTag(block, 'link') ??
    block.match(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i)?.[1]
  );
}

function normalizeUrl(value: string | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '';
  }

  try {
    const url = new URL(normalized);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function summarize(value: string | undefined): string {
  const text = normalizeText(value);
  if (text.length <= 260) {
    return text;
  }

  return `${text.slice(0, 257).trim()}…`;
}

function normalizeText(value: string | undefined): string {
  if (!value) {
    return '';
  }

  return decodeEntities(
    value
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    apos: "'",
    laquo: '«',
    ldquo: '“',
    lsquo: '‘',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rdquo: '”',
    rsquo: '’',
    lt: '<',
    gt: '>',
  };

  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    )
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&([a-z]+);/gi, (match, entity: string) => {
      return namedEntities[entity.toLowerCase()] ?? match;
    });
}

function clampLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

function isAllowedHost(hostname: string, allowedHost: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedAllowedHost = allowedHost.toLowerCase();
  return (
    normalizedHostname === normalizedAllowedHost ||
    normalizedHostname.endsWith(`.${normalizedAllowedHost}`)
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
