import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { scheduleApi, scheduleQueryKeys } from '../../services/scheduleApi';
import { useAuthStore } from '../../store/authStore';
import { Role, type ScheduleEntry } from '../../types';
import { addDaysIso, groupByDate, todayKyivIso } from '../../utils/scheduleDates';
import ScheduleEntryCard from '../../components/schedule/ScheduleEntryCard';
import OnlineLinkModal from '../../components/schedule/OnlineLinkModal';
import StaleBanner from '../../components/schedule/StaleBanner';

export default function ScheduleSessionPage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);
  // Range ≤ 62 days (ScheduleRangeQueryDto constraint): today + 60.
  const range = useMemo(() => {
    const from = todayKyivIso();
    return { from, to: addDaysIso(from, 60) };
  }, []);
  const canEditLink = user?.role === Role.TEACHER;

  const query = useQuery({ queryKey: scheduleQueryKeys.session(range), queryFn: () => scheduleApi.session(range) });
  const links = useQuery({ queryKey: scheduleQueryKeys.myLinks(), queryFn: scheduleApi.myLinks, enabled: canEditLink });
  const grouped = useMemo(() => groupByDate(query.data?.entries ?? []), [query.data]);
  const locale = i18n.language === 'en' ? 'en-US' : 'uk-UA';
  const exportLocale = i18n.language === 'en' ? 'en' : 'uk';
  const findExistingLink = (entry: ScheduleEntry) =>
    links.data?.find((l) => l.groupCode === entry.groupCode && l.subjectKey === entry.subjectKey && ((l.date === entry.date && l.startTime === entry.startTime) || l.date === null));

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <h2 className="text-base font-semibold text-gray-900">{t('schedule.sessionTitle')}</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => scheduleApi.export(range, 'csv', exportLocale, true)}>CSV</button>
          <button type="button" onClick={() => scheduleApi.export(range, 'xlsx', exportLocale, true)}>XLSX</button>
        </div>
      </section>

      {query.data && (
        <StaleBanner
          meta={query.data.meta}
          noSnapshotKey={canEditLink ? 'schedule.noSnapshotTeacher' : 'schedule.unavailable'}
        />
      )}
      {query.isLoading && <p>{t('schedule.loading')}</p>}
      {query.isError && <p className="text-red-600">{t('schedule.errors.load')}</p>}
      {query.data && !query.data.meta.reason && grouped.length === 0 && <p>{t('schedule.emptySession')}</p>}

      {grouped.map(([date, entries]) => (
        <section key={date} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            {new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${date}T00:00:00`))}
          </h3>
          {entries.map((entry) => (
            <ScheduleEntryCard key={entry.id} entry={entry} canEditLink={canEditLink} onEditLink={setEditing} />
          ))}
        </section>
      ))}

      {editing && <OnlineLinkModal entry={editing} existingLink={findExistingLink(editing)} onClose={() => setEditing(null)} />}
    </div>
  );
}
