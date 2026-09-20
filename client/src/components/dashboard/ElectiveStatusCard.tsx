import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { ActiveElectivePeriod } from '../../types';

type Props = { items: ActiveElectivePeriod[]; isLoading: boolean };

export default function ElectiveStatusCard({ items, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const fmt = (v: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).format(new Date(v));

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <h3 className="mb-5 text-lg font-semibold text-slate-900">{t('dashboard.electives.title')}</h3>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="rounded-3xl bg-slate-50 px-6 py-5 text-sm text-slate-500">{t('dashboard.electives.empty')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const { period, phase } = item;
            return (
              <div key={period.id} className="rounded-2xl bg-slate-50 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">{period.title}</p>
                {phase && (
                  <p className="mt-2 text-sm text-slate-600">
                    {phase === 'upcoming' && t('dashboard.electives.upcoming', { date: fmt(period.startsAt) })}
                    {phase === 'open' &&
                      t('dashboard.electives.open', {
                        date: fmt(period.endsAt),
                        selected: item.selectedCount,
                        required: period.requiredChoices,
                      })}
                    {phase === 'closed' && t('dashboard.electives.closed')}
                    {phase === 'finalized' && t('dashboard.electives.finalized')}
                  </p>
                )}
                {phase === 'open' && (
                  <Link
                    to="/electives"
                    className="mt-3 inline-flex rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700">
                    {t('dashboard.electives.action')}
                  </Link>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
