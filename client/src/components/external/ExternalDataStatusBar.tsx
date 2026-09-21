import { useTranslation } from 'react-i18next';

type Props = {
  fetchedAt?: string;
  stale?: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
};

function formatFetchedAt(value: string | undefined, locale: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export default function ExternalDataStatusBar({ fetchedAt, stale, isRefreshing, onRefresh }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const updated = formatFetchedAt(fetchedAt, locale);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-500">
        <span>{updated ? t('externalData.updatedAt', { time: updated }) : t('externalData.notLoaded')}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
          {isRefreshing ? t('common.loading') : t('externalData.refresh')}
        </button>
      </div>
      {stale && updated && (
        <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm text-amber-900">
          {t('externalData.stale', { time: updated })}
        </div>
      )}
    </div>
  );
}
