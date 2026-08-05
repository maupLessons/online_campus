import { useMemo } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

import type { NotificationItem } from '../../pages/shared/DashboardPage';

type Props = {
  items: NotificationItem[];
};

export default function SurveyHighlightCard({ items }: Props) {
  const { t } = useTranslation();

  const surveyItems = useMemo(() => {
    return items
      .filter(
        (item) => item.type === 'new_survey' || item.entityType === 'survey',
      )
      .slice(0, 3);
  }, [items]);

  return (
    <div className="rounded-[28px] bg-blue-600 p-6 text-white shadow-[0_10px_30px_rgba(37,99,235,0.28)]">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-white">
          {t('dashboard.surveysTitle')}
        </h3>
      </div>

      {surveyItems.length === 0 ? (
        <div className="flex min-h-[140px] items-center rounded-3xl bg-blue-500/40 px-6 py-5">
          <p className="text-sm leading-6 text-blue-50">
            {t('dashboard.noSurveys')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {surveyItems.map((item, index) => (
            <Link
              key={`${item.id ?? item.title}-${index}`}
              to={
                item.actionUrl?.startsWith('/') &&
                !item.actionUrl.startsWith('//')
                  ? item.actionUrl
                  : '/surveys'
              }
              className="block rounded-2xl bg-blue-500/40 px-5 py-4 transition hover:bg-blue-500/60"
            >
              <p className="text-sm font-semibold text-white">
                {item.title || t('dashboard.surveysTitle')}
              </p>

              <p className="mt-2 text-sm leading-6 text-blue-50">
                {item.message || t('dashboard.noExtraInfo')}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
