import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3 } from 'lucide-react';
import { electivesApi } from '../../services/electivesApi';
import { useAutoDismissState } from '../../hooks/useAutoDismissState';
import type { ActiveElectivePeriod, ElectiveDiscipline } from '../../types';
import { ElectiveDisciplineStatus } from '../../types';
import { getLocalizedApiErrorMessage } from '../../utils/apiErrorMessage';
import { formatTerm } from '../../utils/formatTerm';
import {
  canSaveDraft,
  activeDraft,
  departmentTabs,
  disciplineLock,
  draftCredits,
  sameSet,
  savedDisciplineIds,
  toggleDraft,
} from './electiveDraft';
import { getElectivePhaseView } from './electivePhase';
import SyllabusLink from './SyllabusLink';

type PageMessage = { type: 'success' | 'error'; text: string };

type ErrorBody = {
  code?: unknown;
  message?: unknown;
  disciplineIds?: unknown;
};

// Messages of the server's ensurePeriodIsOpen() check.
const PERIOD_CLOSED_MESSAGES = [
  'Період вибору вже завершений',
  'Період вибору неактивний',
  'Період вибору ще не розпочався',
];

const ACTIVE_KEY = ['electives', 'active'];
const NO_PERIODS: ActiveElectivePeriod[] = [];

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function BackLink({
  dirty,
  confirmText,
  label,
}: {
  dirty: boolean;
  confirmText: string;
  label: string;
}) {
  return (
    <Link
      to="/electives"
      onClick={(event) => {
        if (dirty && !window.confirm(confirmText)) event.preventDefault();
      }}
      className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {label}
    </Link>
  );
}

export default function ElectiveSelectionPage() {
  const { periodId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const [message, setMessage] = useAutoDismissState<PageMessage | null>(null);
  // `null` means "follow the saved set"; the key ties a draft to the saved set
  // it was made from, so a refetch that changes the saved set discards it.
  const [draftState, setDraftState] = useState<{
    key: string;
    ids: string[];
  } | null>(null);
  const [activeTab, setActiveTab] = useState('');

  const {
    data,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ACTIVE_KEY,
    queryFn: electivesApi.listActive,
    refetchOnWindowFocus: true,
  });

  const activePeriods = data ?? NO_PERIODS;
  const [now, setNow] = useState(() => Date.now());
  const item = activePeriods.find((entry) => entry.period.id === periodId);
  const saved = useMemo(() => (item ? savedDisciplineIds(item) : []), [item]);
  const savedKey = [...saved].sort().join();
  const draft = useMemo(
    () =>
      activeDraft(
        draftState?.key === savedKey ? draftState.ids : saved,
        item?.disciplines ?? [],
      ),
    [draftState, savedKey, saved, item],
  );
  const canSelect = item ? getElectivePhaseView(item.phase).canSelect : false;
  const dirty = canSelect && !sameSet(draft, saved);

  const saveMutation = useMutation({
    mutationFn: (ids: string[]) => electivesApi.replaceSelections(periodId, ids),
    onSuccess: async (response) => {
      // An in-flight refetch could otherwise overwrite the fresh response.
      await queryClient.cancelQueries({ queryKey: ACTIVE_KEY });
      queryClient.setQueryData<ActiveElectivePeriod[]>(ACTIVE_KEY, (old) =>
        old?.map((entry) => (entry.period.id === periodId ? response : entry)),
      );
      setDraftState(null);
      setMessage({ type: 'success', text: t('electives.saved') });
    },
    onError: async (saveError) => {
      const body: ErrorBody | undefined = axios.isAxiosError(saveError)
        ? saveError.response?.data
        : undefined;

      if (body?.code === 'elective_capacity_full') {
        const failed = Array.isArray(body.disciplineIds)
          ? (body.disciplineIds as string[])
          : [];
        const titles = (item?.disciplines ?? [])
          .filter((discipline) => failed.includes(discipline.id))
          .map((discipline) => discipline.title)
          .join(', ');
        setDraftState({
          key: savedKey,
          ids: draft.filter((id) => !failed.includes(id)),
        });
        setMessage({
          type: 'error',
          text: t('electives.capacityFull', { titles }),
        });
        await queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
        return;
      }

      if (body?.code === 'elective_discipline_unavailable') {
        const failed = Array.isArray(body.disciplineIds)
          ? (body.disciplineIds as string[])
          : [];
        const titles = (item?.disciplines ?? [])
          .filter((discipline) => failed.includes(discipline.id))
          .map((discipline) => discipline.title)
          .join(', ');
        setDraftState({
          key: savedKey,
          ids: draft.filter((id) => !failed.includes(id)),
        });
        setMessage({
          type: 'error',
          text: t('electives.disciplineUnavailable', { titles }),
        });
        await queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
        return;
      }

      if (body?.code === 'elective_selection_conflict') {
        setMessage({ type: 'error', text: t('electives.selectionConflict') });
        await queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
        setDraftState(null);
        return;
      }

      if (
        typeof body?.message === 'string' &&
        PERIOD_CLOSED_MESSAGES.some((text) => body.message === text)
      ) {
        setMessage({ type: 'error', text: t('electives.periodClosedOnSave') });
        await queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
        return;
      }

      setMessage({
        type: 'error',
        text: getLocalizedApiErrorMessage(
          saveError,
          i18n.language,
          t('electives.actionError'),
        ),
      });
    },
  });

  // Refetch when the deadline passes, as ElectivesPage does, so the screen
  // leaves the selectable phase without waiting for the next poll.
  const endsAt = item ? Date.parse(item.period.endsAt) : NaN;
  useEffect(() => {
    if (!Number.isFinite(endsAt) || endsAt <= now) return undefined;

    const timeoutId = window.setTimeout(
      () => {
        setNow(Date.now());
        void queryClient.invalidateQueries({ queryKey: ACTIVE_KEY });
      },
      Math.min(endsAt - now + 250, 2_147_483_647),
    );
    return () => window.clearTimeout(timeoutId);
  }, [endsAt, now, queryClient]);

  useEffect(() => {
    if (!dirty) return undefined;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);

  const tabs = useMemo(
    () => departmentTabs(item?.disciplines ?? [], draft),
    [item, draft],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (isError && !data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {getLocalizedApiErrorMessage(
          error,
          i18n.language,
          t('electives.loadError'),
        )}
      </div>
    );
  }

  const backLink = (
    <BackLink
      dirty={dirty}
      confirmText={t('electives.unsavedConfirm')}
      label={t('electives.backToPeriods')}
    />
  );

  if (!item) {
    return (
      <div className="space-y-6">
        {backLink}
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Clock3 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {t('electives.periodUnavailable')}
          </p>
        </div>
      </div>
    );
  }

  const { period } = item;
  const requiredChoices = period.requiredChoices;
  const phaseView = getElectivePhaseView(item.phase);
  const currentTab = tabs.find((tab) => tab.id === activeTab) ?? tabs[0];
  const activeDisciplines = item.disciplines.filter(
    (discipline) => discipline.status === ElectiveDisciplineStatus.ACTIVE,
  );
  const notEnough = canSelect && activeDisciplines.length < requiredChoices;
  const canSave =
    canSelect &&
    !notEnough &&
    !saveMutation.isPending &&
    canSaveDraft(draft, saved, requiredChoices);
  const hasIncompleteSetNotice =
    item.phase === 'finalized' &&
    item.selections.some(
      (selection) => selection.cancelReason === 'incomplete_set',
    );

  const renderCard = (discipline: ElectiveDiscipline) => {
    const isTicked = draft.includes(discipline.id);
    const isSaved = saved.includes(discipline.id);
    const isCancelled =
      discipline.status === ElectiveDisciplineStatus.CANCELLED;
    const lock = disciplineLock(discipline, draft, saved, requiredChoices);
    const disabled = lock !== null || saveMutation.isPending;
    const hint =
      lock === 'full'
        ? t('electives.noSeats')
        : lock === 'limit'
          ? t('electives.limitHint')
          : null;
    const shownAsSelected = canSelect ? isTicked : isSaved;

    const body = (
      <>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">
              {discipline.title}
            </h3>
            {!canSelect && isSaved && (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {t('electives.selected')}
              </span>
            )}
            {isCancelled && (
              <span className="inline-flex items-center rounded-md bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                {t('electives.cancelledBadge')}
              </span>
            )}
          </div>
          {discipline.description && (
            <p className="mt-1 line-clamp-3 text-sm text-slate-500">
              {discipline.description}
            </p>
          )}
          <p className="mt-1 text-sm text-slate-600">
            {t('electives.teacher')}: {discipline.teacher?.name ?? '—'}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {discipline.credits} {t('electives.credits')} ·{' '}
            {discipline.availableSeats <= 0
              ? t('electives.noSeats')
              : `${t('electives.availableSeats')} ${discipline.availableSeats} / ${discipline.capacity}`}
          </p>
          {isCancelled && discipline.cancelReason && (
            <p className="mt-1 text-xs text-red-700">
              {discipline.cancelReason}
            </p>
          )}
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
      </>
    );

    const cardClass = `rounded-lg border p-4 transition ${
      shownAsSelected
        ? 'border-blue-200 bg-blue-50'
        : 'border-slate-200 bg-white'
    }`;

    return (
      <article key={discipline.id} className={cardClass}>
        {canSelect && !isCancelled ? (
          <label
            className={`flex items-start gap-3 ${
              disabled && !isTicked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
            }`}
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0"
              checked={isTicked}
              disabled={disabled}
              onChange={() =>
                setDraftState({
                  key: savedKey,
                  ids: toggleDraft(draft, discipline.id, requiredChoices),
                })
              }
            />
            {body}
          </label>
        ) : (
          <div className="flex items-start gap-3">{body}</div>
        )}
        <div className="mt-3">
          <SyllabusLink url={discipline.syllabusUrl} />
        </div>
      </article>
    );
  };

  return (
    <div className="space-y-6">
      {backLink}

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${phaseView.tone}`}
          >
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
            {t(phaseView.labelKey)}
          </span>
          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
            {formatTerm(period.term, t)}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900">{period.title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t('electives.periodWindow', {
            start: formatDate(period.startsAt, locale),
            end: formatDate(period.endsAt, locale),
          })}
        </p>
        {item.phase === 'upcoming' && (
          <p className="mt-2 text-sm font-medium text-amber-800">
            {t('electives.phase.opensAt', {
              date: formatDate(period.startsAt, locale),
            })}
          </p>
        )}
        {item.phase === 'closed' && (
          <p className="mt-2 text-sm text-slate-600">
            {t('electives.phase.awaitingFinalization')}
          </p>
        )}
        {hasIncompleteSetNotice && (
          <p className="mt-2 text-sm font-medium text-red-700">
            {t('electives.incompleteSetNotice')}
          </p>
        )}
      </section>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {message.text}
        </div>
      )}

      {notEnough && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {t('electives.notEnoughDisciplines')}
        </div>
      )}

      {tabs.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Clock3 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {t('electives.periodUnavailable')}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            role="tablist"
            className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-2"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === currentTab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {tab.name}
                  {tab.selectedCount > 0 && ` · ${tab.selectedCount}`}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" className="grid gap-4 xl:grid-cols-2">
            {currentTab.disciplines.map(renderCard)}
          </div>
        </div>
      )}

      {canSelect && (
        <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-md sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-700">
            <span className="font-semibold text-slate-900">
              {t('electives.selectedOf', {
                count: draft.length,
                total: requiredChoices,
              })}
            </span>
            {' · '}
            {t('electives.creditsTotal', {
              count: draftCredits(draft, item.disciplines),
            })}
            <p className="mt-1 text-xs text-slate-500">
              {t('electives.changeUntil', {
                date: formatDate(period.endsAt, locale),
              })}
            </p>
          </div>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              setMessage(null);
              saveMutation.mutate(draft);
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {saveMutation.isPending ? t('electives.saving') : t('electives.save')}
          </button>
        </div>
      )}
    </div>
  );
}
