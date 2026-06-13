import { useTranslation } from 'react-i18next';

import type { ScheduleItem } from '../../pages/shared/DashboardPage';

type Props = {
  items: ScheduleItem[];
  isLoading: boolean;
};

function getLessonTitle(item: ScheduleItem, fallback: string) {
  return item.title || item.subjectName || item.courseName || fallback;
}

function getLessonMeta(item: ScheduleItem) {
  return [item.lessonType, item.teacherName].filter(Boolean).join(' • ');
}

function getLessonRoom(item: ScheduleItem) {
  return item.classroom || item.classroomName || '—';
}

export default function TodayScheduleCard({ items, isLoading }: Props) {
  const { t } = useTranslation();

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">
            {t('dashboard.todaySchedule')}
          </h3>

          <p className="mt-3 text-sm text-slate-500">
            {items.length > 0 && (
              <p className="mt-3 text-sm text-slate-500">
                {t('dashboard.lessonsCount', { count: items.length })}
              </p>
            )}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <div className="flex min-h-[170px] items-center justify-between gap-6 rounded-3xl bg-slate-50 px-6 py-5">
          <div>
            <p className="text-base font-medium text-slate-700">
              {t('dashboard.noClassesToday')}
            </p>

            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
              {t('dashboard.freeDayHint')}
            </p>
          </div>

          <img
            src="/Notebook-pana.svg"
            alt=""
            className="hidden h-40 w-auto shrink-0 object-contain lg:block"
            aria-hidden="true"
          />
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={`${item.id ?? item.title}-${index}`}
              className="rounded-2xl bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {getLessonTitle(item, t('dashboard.lessonFallback'))}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {getLessonMeta(item) || t('dashboard.noExtraInfo')}
                  </p>
                </div>

                <div className="text-right text-xs text-slate-400">
                  <p>{item.startTime || '—'}</p>
                  <p>{item.endTime || ''}</p>
                </div>
              </div>

              <p className="mt-3 text-xs text-slate-500">
                {getLessonRoom(item)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
