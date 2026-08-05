import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { NewsItem } from '../../services/newsApi';

type Props = {
  items: NewsItem[];
  isLoading: boolean;
  unavailable: boolean;
};

function formatNewsDate(value: string | undefined, locale: string) {
  if (!value) {
    return null;
  }

  const date = new Date(value.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }

  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
  }).format(date);
}

export default function CampusNewsCard({
  items,
  isLoading,
  unavailable,
}: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('dashboard.newsTitle')}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {t('dashboard.newsSubtitle')}
          </p>
        </div>

        <Link
          to="/news"
          className="shrink-0 rounded-full bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition hover:bg-blue-100">
          {t('dashboard.newsAll')}
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="rounded-3xl bg-slate-50 px-6 py-5">
          <p className="text-sm leading-6 text-slate-500">
            {unavailable ? t('dashboard.newsUnavailable') : t('dashboard.newsEmpty')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-2xl bg-slate-50 px-5 py-4 transition hover:bg-slate-100">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-900">
                  {item.title}
                </p>
                {formatNewsDate(item.publishedAt, locale) && (
                  <span className="shrink-0 text-xs font-medium text-slate-400">
                    {formatNewsDate(item.publishedAt, locale)}
                  </span>
                )}
              </div>

              {item.summary && (
                <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">
                  {item.summary}
                </p>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
