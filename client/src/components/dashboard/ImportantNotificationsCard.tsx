import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Notification } from '../../types';

type Props = { items: Notification[]; isLoading: boolean };

const internalUrl = (url?: string) =>
  url && url.startsWith('/') && !url.startsWith('//') && !url.startsWith('/\\') ? url : null;

export default function ImportantNotificationsCard({ items, isLoading }: Props) {
  const { t } = useTranslation();
  const visible = items.slice(0, 3);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.importantNotifications.title')}</h3>
        <Link to="/notifications" className="text-sm font-medium text-blue-700 hover:text-blue-900">
          {t('dashboard.importantNotifications.all')}
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[140px] items-center rounded-3xl bg-slate-50 px-6 py-5">
          <p className="text-sm leading-6 text-slate-500">{t('dashboard.importantNotifications.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => {
            const href = internalUrl(item.actionUrl);
            const body = (
              <>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{item.message}</p>
              </>
            );
            return href ? (
              <Link key={item.id} to={href} className="block rounded-2xl border-l-4 border-amber-400 bg-amber-50 px-5 py-4 transition hover:bg-amber-100">{body}</Link>
            ) : (
              <div key={item.id} className="rounded-2xl border-l-4 border-amber-400 bg-amber-50 px-5 py-4">{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
