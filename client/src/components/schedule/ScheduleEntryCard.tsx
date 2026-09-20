import { useTranslation } from 'react-i18next';
import type { ScheduleEntry } from '../../types';

type Props = { entry: ScheduleEntry; canEditLink?: boolean; onEditLink?: (entry: ScheduleEntry) => void };

export default function ScheduleEntryCard({ entry, canEditLink, onEditLink }: Props) {
  const { t } = useTranslation();
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" data-testid="schedule-entry">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-gray-900">{entry.courseTitle}</p>
          <p className="mt-1 text-xs text-gray-500">
            {entry.controlType ? t(`schedule.controlTypes.${entry.controlType}`) : t(`schedule.types.${entry.type}`)}
            {entry.teacherName ? ` • ${entry.teacherName}` : ''}
          </p>
        </div>
        <div className="text-right text-xs text-gray-500"><p>{entry.startTime}</p><p>{entry.endTime}</p></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {entry.onlineFormat ? (
          <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{t('schedule.online')}</span>
        ) : (
          <span className="text-gray-600">{t('schedule.classroom')}: {entry.classroom}</span>
        )}
        {entry.onlineUrl && (
          <a href={entry.onlineUrl} target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">
            {t('schedule.openOnlineClass')}
          </a>
        )}
        {canEditLink && (
          <button type="button" onClick={() => onEditLink?.(entry)} className="ml-auto text-blue-700">
            {t('schedule.setLink')}
          </button>
        )}
      </div>
    </article>
  );
}
