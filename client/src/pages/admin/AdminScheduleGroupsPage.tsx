import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, LoaderCircle } from 'lucide-react';
import { scheduleApi, scheduleQueryKeys } from '../../services/scheduleApi';
import {
  referencesApi,
  ReferenceType,
  type GroupReference,
} from '../../services/referencesApi';
import { getLocalizedApiErrorMessage } from '../../utils/apiErrorMessage';
import type { ScheduleMeta } from '../../types';
import { addDaysIso, groupByDate, todayKyivIso } from '../../utils/scheduleDates';
import ScheduleEntryCard from '../../components/schedule/ScheduleEntryCard';
import StaleBanner from '../../components/schedule/StaleBanner';

const GROUPS_QUERY_KEY = ['references', ReferenceType.GROUPS];

export default function AdminScheduleGroupsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [session, setSession] = useState(false);

  const range = useMemo(() => {
    const from = todayKyivIso();
    return { from, to: addDaysIso(from, 30) };
  }, []);

  const formatDateTime = (value: string | null | undefined) =>
    value
      ? new Intl.DateTimeFormat(
          i18n.language.startsWith('en') ? 'en-US' : 'uk-UA',
          { dateStyle: 'short', timeStyle: 'short' },
        ).format(new Date(value))
      : t('schedule.noSnapshot');

  const groups = useQuery({
    queryKey: GROUPS_QUERY_KEY,
    queryFn: () => referencesApi.listOptions<GroupReference>(ReferenceType.GROUPS),
  });

  const cache = useQuery({
    queryKey: scheduleQueryKeys.group(code, range, session),
    queryFn: () => scheduleApi.group(code, range, session),
    enabled: Boolean(code),
  });

  // mutate() takes the group code explicitly (not via a closure over `code`), otherwise
  // clicking another group's row could refresh the group selected just before —
  // setCode() doesn't get applied synchronously before the mutationFn call.
  const refresh = useMutation({
    mutationFn: (groupCode: string) => scheduleApi.refreshGroup(groupCode),
    onSuccess: (_, groupCode) =>
      qc.invalidateQueries({ queryKey: ['schedule', 'group', groupCode] }),
  });

  const refreshAll = useMutation({
    mutationFn: () => scheduleApi.refreshAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule', 'group'] }),
  });

  const grouped = useMemo(() => groupByDate(cache.data?.entries ?? []), [cache.data]);
  // §5.3b has no `meta`: the banner gets the ScheduleMeta assembled here.
  const meta: ScheduleMeta | null = cache.data
    ? { stale: cache.data.stale, ...(cache.data.fetchedAt ? { fetchedAt: cache.data.fetchedAt } : {}) }
    : null;

  const summary = refreshAll.data?.groups ?? [];
  const count = (status: string) => summary.filter((g) => g.status === status).length;
  const problems = summary.filter((g) => g.status !== 'updated');

  const refreshAllErrorMessage = refreshAll.isError
    ? getLocalizedApiErrorMessage(refreshAll.error, i18n.language, t('schedule.refreshError'))
    : null;
  const refreshErrorMessage = refresh.isError
    ? getLocalizedApiErrorMessage(refresh.error, i18n.language, t('schedule.refreshError'))
    : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">{t('nav.scheduleGroups')}</h1>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          disabled={refreshAll.isPending}
          onClick={() => refreshAll.mutate()}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">
          {refreshAll.isPending ? (
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          {t('schedule.refreshAll')}
        </button>
        {refreshAll.data && (
          <span className="text-sm text-gray-700">
            {t('schedule.refreshSummary', {
              updated: count('updated'),
              skipped: count('skipped'),
              failed: count('failed'),
            })}
          </span>
        )}
        {refreshAllErrorMessage && (
          <span className="text-sm text-red-600">{refreshAllErrorMessage}</span>
        )}
      </section>

      {problems.length > 0 && (
        <ul className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {problems.map((g) => (
            <li key={g.groupCode}>
              {g.groupCode} — {t(`schedule.refreshStatus.${g.status}`)}
              {g.reason ? ` (${t(`schedule.refreshReason.${g.reason}`, { defaultValue: g.reason })})` : ''}
            </li>
          ))}
        </ul>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-600">
              <th className="p-3">{t('schedule.groupColumn')}</th>
              <th className="p-3">{t('schedule.fetchedAt')}</th>
              <th className="p-3">{t('schedule.entriesCount')}</th>
              <th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {groups.isError && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-sm text-red-600">
                  {t('references.loadError')}
                </td>
              </tr>
            )}
            {groups.data?.map((g) => (
              <tr key={g.id} className={g.code === code ? 'bg-blue-50' : ''}>
                <td className="p-3">
                  <button
                    type="button"
                    className="text-blue-700 underline"
                    onClick={() => setCode(g.code)}>
                    {g.code}
                  </button>
                </td>
                <td className="p-3">
                  {g.code === code ? formatDateTime(cache.data?.fetchedAt) : '—'}
                </td>
                <td className="p-3">
                  {g.code === code ? cache.data?.entries.length ?? 0 : '—'}
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    disabled={refreshAll.isPending || (refresh.isPending && refresh.variables === g.code)}
                    onClick={() => {
                      setCode(g.code);
                      refresh.mutate(g.code);
                    }}
                    className="inline-flex items-center gap-1 text-blue-700 disabled:opacity-60">
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    {t('schedule.refreshFromApi')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={session} onChange={(e) => setSession(e.target.checked)} />
          {t('nav.scheduleSession')}
        </label>
        {refreshErrorMessage && <span className="text-sm text-red-600">{refreshErrorMessage}</span>}
        {cache.isError && <span className="text-sm text-red-600">{t('schedule.errors.load')}</span>}
      </section>

      {meta && <StaleBanner meta={meta} />}
      {grouped.map(([date, entries]) => (
        <section key={date} className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">{date}</h3>
          {entries.map((e) => (
            <ScheduleEntryCard key={e.id} entry={e} />
          ))}
        </section>
      ))}
    </div>
  );
}
