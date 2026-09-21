import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExternalDataStatusBar from '../../components/external/ExternalDataStatusBar';
import { useActiveStudentProfile } from '../../hooks/useActiveStudentProfile';
import {
  gradebookApi,
  gradebookQueryKeys,
  type GradebookSemester,
} from '../../services/gradebookApi';
import { getExternalDataErrorCode } from '../../utils/externalDataError';
import { getGradebookCell, TONE_CLASS } from '../../utils/gradebookStatus';

function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const { t } = useTranslation();
  const code = getExternalDataErrorCode(error);
  const message =
    code === 'maup_disabled' ? t('externalData.disabled') : t('externalData.unavailable');
  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-600">
      <p>{message}</p>
      {code !== 'maup_disabled' && (
        <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {t('externalData.retry')}
        </button>
      )}
    </div>
  );
}

function SemesterCard({ semester, defaultOpen }: { semester: GradebookSemester; defaultOpen: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-6 py-4 text-left">
        <span className="text-lg font-semibold text-slate-900">
          {t('gradebook.semesterTitle', { year: semester.academicYear, semester: semester.semester })}
        </span>
        <span className="flex items-center gap-3 text-sm text-slate-500">
          {semester.isCurrent && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              {t('gradebook.currentSemester')}
            </span>
          )}
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        semester.entries.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-slate-500">{t('gradebook.emptySemester')}</p>
        ) : (
          <div className="overflow-x-auto px-2 pb-4">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">{t('gradebook.columns.subject')}</th>
                  <th className="px-4 py-2">{t('gradebook.columns.teacher')}</th>
                  <th className="px-4 py-2">{t('gradebook.columns.controlType')}</th>
                  <th className="px-4 py-2">{t('gradebook.columns.score')}</th>
                  <th className="px-4 py-2">{t('gradebook.columns.ects')}</th>
                  <th className="px-4 py-2">{t('gradebook.columns.date')}</th>
                </tr>
              </thead>
              <tbody>
                {semester.entries.map((entry, index) => {
                  const cell = getGradebookCell(entry, t);
                  return (
                    <tr key={`${entry.subject}-${index}`} className="border-t border-slate-100">
                      <td className="px-4 py-3 text-slate-900">{entry.subject}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.teacher ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.controlType}</td>
                      <td className={`px-4 py-3 ${TONE_CLASS[cell.tone]}`}>{cell.text}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.ects ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{entry.date ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

export default function GradebookPage() {
  const { t } = useTranslation();
  const profile = useActiveStudentProfile();
  const profileId = profile?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: gradebookQueryKeys.my(profileId),
    queryFn: gradebookApi.getMy,
    enabled: profileId !== null,
    retry: false,
    staleTime: 5 * 60 * 1000,
  });

  const refresh = useMutation({
    mutationFn: gradebookApi.refresh,
    onSuccess: (data) => queryClient.setQueryData(gradebookQueryKeys.my(profileId), data),
  });

  const semesters = query.data?.semesters ?? [];
  const firstOpenIndex = Math.max(0, semesters.findIndex((s) => s.isCurrent));
  // Спека §6: `no_active_profile` — це не помилка, а порожній розділ з поясненням.
  const noProfile = query.data?.meta.reason === 'no_active_profile';

  return (
    <div className="space-y-6">
      <header className="rounded-[32px] bg-gradient-to-br from-blue-700 to-slate-900 p-8 text-white">
        <h1 className="text-3xl font-bold tracking-tight">{t('gradebook.title')}</h1>
        <p className="mt-2 text-sm text-blue-100">{t('gradebook.subtitle')}</p>
      </header>

      <ExternalDataStatusBar
        fetchedAt={query.data?.meta.fetchedAt ?? undefined}
        stale={query.data?.meta.stale}
        isRefreshing={refresh.isPending}
        onRefresh={() => refresh.mutate()}
      />

      {query.isLoading ? (
        <p className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-500">{t('common.loading')}</p>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : noProfile ? (
        <p className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-600">{t('externalData.noProfile')}</p>
      ) : semesters.length === 0 ? (
        <p className="rounded-[28px] border border-slate-200 bg-white p-8 text-sm text-slate-500">{t('gradebook.empty')}</p>
      ) : (
        <div className="space-y-4">
          {semesters.map((semester, index) => (
            <SemesterCard
              key={`${semester.academicYear}-${semester.semester}`}
              semester={semester}
              defaultOpen={index === firstOpenIndex}
            />
          ))}
        </div>
      )}
      {refresh.isError && <ErrorState error={refresh.error} onRetry={() => refresh.mutate()} />}
    </div>
  );
}
