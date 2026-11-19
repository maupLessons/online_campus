import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  BookOpenCheck,
  CalendarClock,
  Clock3,
  GraduationCap,
} from 'lucide-react';
import { electivesApi } from '../../services/electivesApi';
import type { ActiveElectivePeriod } from '../../types';
import { getLocalizedApiErrorMessage } from '../../utils/apiErrorMessage';
import { formatTerm } from '../../utils/formatTerm';
import { getElectivePhaseView } from './electivePhase';

type EntityWithId = {
  id?: string;
  _id?: string;
};

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

function ActivePeriodCard({
  item,
  locale,
}: {
  item: ActiveElectivePeriod;
  locale: string;
}) {
  const { t } = useTranslation();
  const periodId = getEntityId(item.period);
  const phaseView = getElectivePhaseView(item.phase);
  const hasIncompleteSetNotice =
    item.phase === 'finalized' &&
    item.selections.some(
      (selection) => selection.cancelReason === 'incomplete_set',
    );

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${phaseView.tone}`}>
              <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
              {t(phaseView.labelKey)}
            </span>
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {formatTerm(item.period.term, t)}
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
          {item.phase === 'upcoming' && (
            <p className="mt-2 text-sm font-medium text-amber-800">
              {t('electives.phase.opensAt', {
                date: formatDate(item.period.startsAt, locale),
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
        </div>

        {item.phase !== 'upcoming' && (
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
        )}
      </div>

      {item.phase !== 'upcoming' && (
        <div className="mt-5">
          <Link
            to={`/electives/periods/${periodId}`}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <BookOpenCheck className="h-4 w-4" aria-hidden="true" />
            {item.phase === 'open'
              ? t('electives.openSelection')
              : t('electives.viewSelection')}
          </Link>
        </div>
      )}
    </section>
  );
}

export default function ElectivesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const [now, setNow] = useState(() => Date.now());

  const {
    data: activePeriods = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ['electives', 'active'],
    queryFn: electivesApi.listActive,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const futureDeadlines = activePeriods
      .map((item) => Date.parse(item.period.endsAt))
      .filter((deadline) => Number.isFinite(deadline) && deadline > now);
    const nextDeadline = Math.min(...futureDeadlines);

    if (!Number.isFinite(nextDeadline)) return;

    const timeoutId = window.setTimeout(() => {
      setNow(Date.now());
      void queryClient.invalidateQueries({
        queryKey: ['electives', 'active'],
      });
    }, Math.min(nextDeadline - now + 250, 2_147_483_647));

    return () => window.clearTimeout(timeoutId);
  }, [activePeriods, now, queryClient]);

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
        {getLocalizedApiErrorMessage(
          error,
          i18n.language,
          t('electives.loadError'),
        )}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}
