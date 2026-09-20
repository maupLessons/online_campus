import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { Survey } from '../../types';

type Props = { surveys: Survey[]; isLoading: boolean };

const at = (s: Survey) => {
  const t = Date.parse(s.endDate ?? '');
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t;
};

export default function ActiveSurveysCard({ surveys, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';

  const visible = useMemo(
    () =>
      surveys
        .filter((s) => !s.completed)
        .sort((a, b) => at(a) - at(b))
        .slice(0, 3),
    [surveys],
  );

  const formatDeadline = (value: string) => {
    const ms = Date.parse(value);
    if (Number.isNaN(ms)) return null;
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(new Date(ms));
  };

  return (
    <div className="rounded-[28px] bg-blue-600 p-6 text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-white">{t('dashboard.surveysTitle')}</h3>
        <Link to="/surveys" className="text-sm font-medium text-blue-100 hover:text-white">
          {t('dashboard.surveysAll')}
        </Link>
      </div>

      {isLoading ? (
        <p className="text-sm text-blue-50">{t('common.loading')}</p>
      ) : visible.length === 0 ? (
        <div className="flex min-h-[140px] items-center rounded-3xl bg-blue-500/40 px-6 py-5">
          <p className="text-sm leading-6 text-blue-50">{t('dashboard.noSurveys')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => {
            const deadline = formatDeadline(s.endDate);
            return (
              <Link key={s.id} to={`/surveys/${s.id}`} className="block rounded-2xl bg-blue-500/40 px-5 py-4 transition hover:bg-blue-500/60">
                <p className="text-sm font-semibold text-white">{s.title}</p>
                <p className="mt-2 text-xs text-blue-50">
                  {deadline && t('dashboard.surveyDeadline', { date: deadline })}
                  {s.anonymous && <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5">{t('surveys.anonymous')}</span>}
                  {s.estimatedMinutes && (
                    <span className="ml-2 rounded-full bg-white/20 px-2 py-0.5">
                      {t('dashboard.surveyMinutes', { count: s.estimatedMinutes })}
                    </span>
                  )}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
