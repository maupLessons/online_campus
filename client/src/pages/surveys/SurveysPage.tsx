import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  ClipboardList,
  Clock3,
  PlayCircle,
  ShieldCheck,
} from 'lucide-react';
import { surveysApi } from '../../services/surveysApi';
import type { Survey } from '../../types';

function normalizeSurveyDates(survey: Survey) {
  const now = Date.now();
  const endAt = survey.endDate ? new Date(survey.endDate).getTime() : null;

  if (endAt === null || Number.isNaN(endAt)) {
    return {
      isEndingSoon: false,
      isExpired: false,
    };
  }

  return {
    isEndingSoon: endAt - now <= 3 * 24 * 60 * 60 * 1000 && endAt > now,
    isExpired: endAt <= now,
  };
}

export default function SurveysPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';

  const {
    data: surveys = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['surveys', 'active'],
    queryFn: surveysApi.listActive,
  });

  const sortedSurveys = useMemo(() => {
    return [...surveys].sort((a, b) => {
      const aCompleted = a.completed ? 1 : 0;
      const bCompleted = b.completed ? 1 : 0;
      if (aCompleted !== bCompleted) return aCompleted - bCompleted;
      return (
        new Date(a.endDate ?? a.createdAt ?? 0).getTime() -
        new Date(b.endDate ?? b.createdAt ?? 0).getTime()
      );
    });
  }, [surveys]);

  const formatDate = (value?: string) => {
    if (!value) return t('surveys.noDeadline');

    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(new Date(value));
  };

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
        {t('surveys.loadError')}
      </div>
    );
  }

  const completedCount = surveys.filter(
    (survey) => survey.completed,
  ).length;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">
                {t('surveys.title')}
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                {t('surveys.subtitle')}
              </p>
            </div>
          </div>

          <div className="rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
            <span className="font-semibold text-slate-900">
              {completedCount}
            </span>{' '}
            / {surveys.length} {t('surveys.completedCounter')}
          </div>
        </div>
      </section>

      {surveys.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
          {t('surveys.emptyActive')}
        </div>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {sortedSurveys.map((survey) => {
            const completed = Boolean(survey.completed);
            const { isEndingSoon, isExpired } = normalizeSurveyDates(survey);
            const questionsCount = survey.questions?.length ?? 0;

            return (
              <article
                key={survey.id}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ${
                          completed
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {completed ? (
                          <CheckCircle2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        ) : (
                          <PlayCircle
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                        )}
                        {completed
                          ? t('surveys.statusCompleted')
                          : t('surveys.statusAvailable')}
                      </span>

                      {survey.anonymous && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          <ShieldCheck
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
                          {t('surveys.anonymous')}
                        </span>
                      )}
                    </div>

                    <h2 className="text-lg font-semibold text-slate-900">
                      {survey.title}
                    </h2>

                    {survey.description && (
                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                        {survey.description}
                      </p>
                    )}
                  </div>

                  <Link
                    to={`/surveys/${survey.id}`}
                    className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
                      completed
                        ? 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {completed ? t('surveys.openDetails') : t('surveys.start')}
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">
                      {t('surveys.questions')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {questionsCount}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">
                      {t('surveys.endsAt')}
                    </p>
                    <p
                      className={`mt-1 flex items-center gap-1 text-sm font-semibold ${
                        isEndingSoon || isExpired
                          ? 'text-red-700'
                          : 'text-slate-900'
                      }`}
                    >
                      <Clock3 className="h-4 w-4" aria-hidden="true" />
                      {formatDate(survey.endDate)}
                    </p>
                  </div>

                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <p className="text-xs text-slate-500">
                      {t('surveys.target')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {t(`surveys.targetTypes.${survey.targetType}`)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

    </div>
  );
}
