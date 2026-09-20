import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { scheduleApi, scheduleQueryKeys } from '../../services/scheduleApi';
import { useAuthStore } from '../../store/authStore';
import { Role, type ScheduleEntry } from '../../types';
import { groupByDate, rangeFor, shiftAnchor, todayKyivIso } from '../../utils/scheduleDates';
import ScheduleEntryCard from '../../components/schedule/ScheduleEntryCard';
import OnlineLinkModal from '../../components/schedule/OnlineLinkModal';
import StaleBanner from '../../components/schedule/StaleBanner';

export default function SchedulePage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [params] = useSearchParams();
  const [view, setView] = useState<'day' | 'week'>('week');
  const [anchor, setAnchor] = useState(params.get('date') ?? todayKyivIso());
  const [editing, setEditing] = useState<ScheduleEntry | null>(null);
  const range = useMemo(() => rangeFor(view, anchor), [view, anchor]);
  const canEditLink = user?.role === Role.TEACHER;

  const query = useQuery({ queryKey: scheduleQueryKeys.my(range), queryFn: () => scheduleApi.my(range) });
  const links = useQuery({ queryKey: scheduleQueryKeys.myLinks(), queryFn: scheduleApi.myLinks, enabled: canEditLink });
  const grouped = useMemo(() => groupByDate(query.data?.entries ?? []), [query.data]);
  const locale = i18n.language === 'en' ? 'en-US' : 'uk-UA';
  const exportLocale = i18n.language === 'en' ? 'en' : 'uk';
  const findExistingLink = (entry: ScheduleEntry) =>
    links.data?.find((l) => l.groupCode === entry.groupCode && l.subjectKey === entry.subjectKey && ((l.date === entry.date && l.startTime === entry.startTime) || l.date === null));

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t('schedule.prev')} onClick={() => setAnchor((a) => shiftAnchor(view, a, -1))}>←</button>
          <button type="button" onClick={() => setAnchor(todayKyivIso())}>{t('schedule.today')}</button>
          <button type="button" aria-label={t('schedule.next')} onClick={() => setAnchor((a) => shiftAnchor(view, a, 1))}>→</button>
          <span className="text-sm text-gray-600">{range.from} — {range.to}</span>
        </div>
        <div className="flex gap-2">
          <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>{t('schedule.day')}</button>
          <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>{t('schedule.week')}</button>
          <button type="button" onClick={() => scheduleApi.export(range, 'csv', exportLocale)}>CSV</button>
          <button type="button" onClick={() => scheduleApi.export(range, 'xlsx', exportLocale)}>XLSX</button>
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
      {query.data && !query.data.meta.reason && grouped.length === 0 && <p>{t('schedule.emptyRange')}</p>}

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
