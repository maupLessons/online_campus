import { useTranslation } from 'react-i18next';
import type { ScheduleEntry, ScheduleMeta } from '../../types';
import { formatShortName } from '../../utils/formatShortName';

type Props = {
  session: ScheduleEntry[];   // §5.3a: session entries are rendered FIRST (controlType badge)
  lessons: ScheduleEntry[];
  meta: ScheduleMeta;
  isLoading: boolean;
};

function EntryRow({ entry }: { entry: ScheduleEntry }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-2xl bg-slate-50 p-4" data-testid="today-schedule-entry">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-900">{entry.courseTitle}</p>
          <p className="mt-1 text-xs text-slate-500">
            {entry.controlType ? t(`schedule.controlTypes.${entry.controlType}`) : t(`schedule.types.${entry.type}`)}
            {entry.teacherName ? ` • ${formatShortName(entry.teacherName)}` : ''}
          </p>
        </div>
        <div className="text-right text-xs text-slate-400">
          <p>{entry.startTime}</p>
          <p>{entry.endTime}</p>
        </div>
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        {entry.onlineFormat ? (
          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{t('schedule.online')}</span>
        ) : (
          <span>{entry.classroom}</span>
        )}
        {entry.onlineUrl?.startsWith('https://') && (
          <a href={entry.onlineUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            {t('schedule.openOnlineClass')}
          </a>
        )}
      </p>
    </div>
  );
}

export default function TodayScheduleCard({ session, lessons, meta, isLoading }: Props) {
  const { t, i18n } = useTranslation();
  const all = [...session, ...lessons];
  // Empty-state texts — §7 of spec 03: this is not a loading error.
  const reasonKey =
    meta.reason === 'no_current_term' ? 'schedule.noCurrentTerm'
    : meta.reason === 'no_active_profile' ? 'schedule.noActiveProfile'
    : meta.reason === 'no_snapshot' ? 'schedule.unavailable'
    : meta.reason === 'no_external_teacher_id' ? 'schedule.noExternalTeacherId'
    : null;
  const staleAt = meta.stale && meta.fetchedAt
    ? new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-US' : 'uk-UA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(meta.fetchedAt))
    : null;

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-slate-900">{t('dashboard.todaySchedule')}</h3>
        {all.length > 0 && (
          <p className="mt-3 text-sm text-slate-500">{t('dashboard.lessonsCount', { count: all.length })}</p>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-500">{t('common.loading')}</p>
      ) : reasonKey ? (
        <p className="rounded-3xl bg-slate-50 px-6 py-5 text-sm text-slate-600">{t(reasonKey)}</p>
      ) : all.length === 0 ? (
        <div className="flex min-h-[170px] items-center justify-between gap-6 rounded-3xl bg-slate-50 px-6 py-5">
          <div>
            <p className="text-base font-medium text-slate-700">{t('dashboard.noClassesToday')}</p>
            <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">{t('dashboard.freeDayHint')}</p>
          </div>
          <img src="/Notebook-pana.svg" alt="" className="hidden h-40 w-auto shrink-0 object-contain lg:block" aria-hidden="true" />
        </div>
      ) : (
        <div className="space-y-3">
          {all.map((entry) => <EntryRow key={entry.id} entry={entry} />)}
        </div>
      )}

      {staleAt && <p className="mt-4 text-xs text-slate-400">{t('schedule.stale', { at: staleAt })}</p>}
    </div>
  );
}
