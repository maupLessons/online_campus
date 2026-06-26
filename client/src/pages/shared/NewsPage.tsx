import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { newsApi, newsQueryKeys, type NewsItem } from '../../services/newsApi';

function formatDateTime(value: string | null | undefined, locale: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function NewsCard({ item, locale }: { item: NewsItem; locale: string }) {
  const { t } = useTranslation();
  const publishedAt = formatDateTime(item.publishedAt, locale);

  return (
    <article className="flex h-full flex-col rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      {publishedAt && (
        <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">
          {publishedAt}
        </p>
      )}

      <h3 className="mt-3 text-lg font-semibold leading-7 text-slate-900">
        {item.title}
      </h3>

      {item.summary && (
        <p className="mt-3 flex-1 text-sm leading-6 text-slate-500">
          {item.summary}
        </p>
      )}

      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="mt-5 inline-flex w-fit rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
        {t('news.open')}
      </a>
    </article>
  );
}

export default function NewsPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const limit = 12;

  const {
    data,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: newsQueryKeys.latest(limit),
    queryFn: () => newsApi.listLatest(limit),
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const items = data?.items ?? [];
  const statusText =
    data?.unavailable || isError
      ? t('news.unavailable')
      : data?.fetchedAt
        ? t('news.lastUpdated', {
            date: formatDateTime(data.fetchedAt, locale),
          })
        : t('news.source');

  return (
    <div className="space-y-6">
      <div className="rounded-[32px] bg-gradient-to-br from-blue-700 to-slate-900 p-8 text-white shadow-[0_14px_38px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-100">
              {t('news.source')}
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight">
              {t('news.title')}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="w-fit rounded-full bg-white px-5 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-70">
            {isFetching ? t('common.loading') : t('news.refresh')}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        {statusText}
      </div>

      {isLoading ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-500">
          {t('news.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-500">
          {data?.unavailable || isError ? t('news.unavailable') : t('news.empty')}
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <NewsCard key={item.id} item={item} locale={locale} />
          ))}
        </div>
      )}
    </div>
  );
}
