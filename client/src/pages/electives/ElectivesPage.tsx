import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Undo2,
} from 'lucide-react';
import { electivesApi } from '../../services/electivesApi';
import type {
  ActiveElectivePeriod,
  ElectiveDiscipline,
  ElectiveSelection,
  ReferenceView,
} from '../../types';

type EntityWithId = {
  id?: string;
  _id?: string;
};

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }

  return fallback;
}

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function getEntityId(entity?: EntityWithId | null) {
  return entity?.id ?? entity?._id ?? '';
}

function selectionForDiscipline(
  selections: ElectiveSelection[],
  discipline: ElectiveDiscipline,
) {
  const disciplineId = getEntityId(discipline);
  return selections.find(
    (selection) => getEntityId(selection.discipline) === disciplineId,
  );
}

function referenceLabel(reference: ReferenceView) {
  return reference.name ?? reference.code ?? getEntityId(reference);
}

function ActivePeriodCard({
  item,
  locale,
  onSelect,
  onCancel,
  workingKey,
}: {
  item: ActiveElectivePeriod;
  locale: string;
  onSelect: (periodId: string, disciplineId: string) => void;
  onCancel: (periodId: string, selectionId: string) => void;
  workingKey: string;
}) {
  const { t } = useTranslation();
  const periodId = getEntityId(item.period);
  const selectedDisciplineIds = useMemo(
    () =>
      new Set(
        item.selections
          .map((selection) => getEntityId(selection.discipline))
          .filter(Boolean),
      ),
    [item.selections],
  );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {t('electives.periodActive')}
            </span>
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {item.period.academicYear}, {item.period.semester}{' '}
              {t('electives.semesterShort')}
            </span>
          </div>

          <h2 className="text-xl font-bold text-slate-900">
            {item.period.title}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t('electives.periodWindow', {
              start: formatDate(item.period.startsAt, locale),
              end: formatDate(item.period.endsAt, locale),
            })}
          </p>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 sm:min-w-64">
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">
              {t('electives.requiredChoices')}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {item.selectedCount} / {item.period.requiredChoices}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2">
            <p className="text-xs text-slate-500">
              {t('electives.remainingChoices')}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {item.remainingChoices}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-2">
        {item.disciplines.map((discipline) => {
          const disciplineId = getEntityId(discipline);
          const selection = selectionForDiscipline(item.selections, discipline);
          const selectionId = getEntityId(selection);
          const isSelected = selectedDisciplineIds.has(disciplineId);
          const availableSeats = Number(discipline.availableSeats);
          const remainingChoices = Number(item.remainingChoices);
          const isFull =
            Number.isFinite(availableSeats) && availableSeats <= 0 && !isSelected;
          const isLimitReached =
            Number.isFinite(remainingChoices) &&
            remainingChoices <= 0 &&
            !isSelected;
          const actionKey = `${periodId}:${disciplineId}`;
          const cancelKey = selection ? `${periodId}:${selectionId}` : '';
          const isWorking =
            Boolean(workingKey) &&
            (workingKey === actionKey ||
              (Boolean(cancelKey) && workingKey === cancelKey));
          const hasSelectableIds = Boolean(periodId && disciplineId);
          const canCancel = Boolean(periodId && selectionId) && !isWorking;
          const canSelect =
            hasSelectableIds &&
            !isWorking &&
            !isFull &&
            !isLimitReached;
          const selectLabel = !hasSelectableIds
            ? t('electives.unavailable')
            : isWorking
              ? t('electives.processing')
              : isFull
                ? t('electives.noSeats')
                : isLimitReached
                  ? t('electives.limitReached')
                  : t('electives.select');

          return (
            <article
              key={disciplineId || discipline.code}
              className={`rounded-lg border p-4 transition ${
                isSelected
                  ? 'border-blue-200 bg-blue-50'
                  : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                      {discipline.code}
                    </span>
                    {isSelected && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white">
                        <CheckCircle2
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        {t('electives.selected')}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-semibold text-slate-900">
                    {discipline.title}
                  </h3>
                  {discipline.description && (
                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                      {discipline.description}
                    </p>
                  )}
                </div>

                {isSelected && selection ? (
                  <button
                    type="button"
                    disabled={!canCancel}
                    onClick={() => onCancel(periodId, selectionId)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white disabled:cursor-not-allowed disabled:text-slate-300"
                  >
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                    {t('electives.cancel')}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!canSelect}
                    onClick={() => onSelect(periodId, disciplineId)}
                    className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
                    {selectLabel}
                  </button>
                )}
              </div>

              <div className="mt-4 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
                <div className="rounded-lg bg-white/80 px-3 py-2">
                  <p className="text-xs text-slate-500">
                    {t('electives.credits')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {discipline.credits}
                  </p>
                </div>
                <div className="rounded-lg bg-white/80 px-3 py-2">
                  <p className="text-xs text-slate-500">
                    {t('electives.availableSeats')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">
                    {discipline.availableSeats} / {discipline.capacity}
                  </p>
                </div>
                <div className="rounded-lg bg-white/80 px-3 py-2">
                  <p className="text-xs text-slate-500">
                    {t('electives.department')}
                  </p>
                  <p className="mt-1 truncate text-sm font-semibold text-slate-900">
                    {referenceLabel(discipline.department)}
                  </p>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default function ElectivesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const [pendingActionKey, setPendingActionKey] = useState('');

  const {
    data: activePeriods = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['electives', 'active'],
    queryFn: electivesApi.listActive,
  });

  const selectMutation = useMutation({
    mutationFn: ({
      periodId,
      disciplineId,
    }: {
      periodId: string;
      disciplineId: string;
    }) => electivesApi.select(periodId, disciplineId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['electives'] });
    },
    onSettled: () => {
      setPendingActionKey('');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      periodId,
      selectionId,
    }: {
      periodId: string;
      selectionId: string;
    }) => electivesApi.cancelSelection(periodId, selectionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['electives'] });
    },
    onSettled: () => {
      setPendingActionKey('');
    },
  });

  const workingKey =
    selectMutation.isPending || cancelMutation.isPending
      ? pendingActionKey
      : '';

  const actionError = selectMutation.error ?? cancelMutation.error;

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {getRequestErrorMessage(error, t('electives.loadError'))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('electives.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('electives.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {getRequestErrorMessage(actionError, t('electives.actionError'))}
        </div>
      )}

      {activePeriods.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Clock3 className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm text-slate-500">
            {t('electives.emptyActive')}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {activePeriods.map((item) => (
            <ActivePeriodCard
              key={item.period.id}
              item={item}
              locale={locale}
              workingKey={workingKey}
              onSelect={(periodId, disciplineId) => {
                setPendingActionKey(`${periodId}:${disciplineId}`);
                selectMutation.reset();
                cancelMutation.reset();
                selectMutation.mutate({ periodId, disciplineId });
              }}
              onCancel={(periodId, selectionId) => {
                setPendingActionKey(`${periodId}:${selectionId}`);
                selectMutation.reset();
                cancelMutation.reset();
                cancelMutation.mutate({ periodId, selectionId });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
