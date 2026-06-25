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
