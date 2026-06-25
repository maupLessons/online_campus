import api from './api';

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  url: string;
  publishedAt?: string;
}

export interface NewsFeedResponse {
  items: NewsItem[];
  sourceUrl: string;
  fetchedAt: string | null;
  cached: boolean;
  stale: boolean;
  unavailable: boolean;
}

export const newsQueryKeys = {
  latest: (limit: number) => ['news', 'latest', limit] as const,
};

export const newsApi = {
  async listLatest(limit = 6): Promise<NewsFeedResponse> {
    const { data } = await api.get<NewsFeedResponse>('/news', {
      params: { limit },
    });

    return {
      items: Array.isArray(data.items) ? data.items.map(normalizeNewsItem) : [],
      sourceUrl: data.sourceUrl ?? '',
      fetchedAt: data.fetchedAt ?? null,
      cached: data.cached === true,
      stale: data.stale === true,
      unavailable: data.unavailable === true,
    };
  },
};

function normalizeNewsItem(item: NewsItem): NewsItem {
  return {
    id: item.id ?? item.url ?? item.title,
    title: item.title ?? '',
    summary: item.summary ?? '',
    url: item.url ?? '',
    publishedAt: item.publishedAt,
  };
}
