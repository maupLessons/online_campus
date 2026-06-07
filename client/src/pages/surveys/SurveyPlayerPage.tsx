import { useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ShieldCheck,
} from 'lucide-react';
import { surveysApi } from '../../services/surveysApi';
import {
  SurveyQuestionType,
  SurveyStatus,
  type SurveyAnswer,
  type SurveyAnswerValue,
  type SurveyMyResponse,
  type SurveyQuestion,
} from '../../types';

type AnswersState = Record<string, SurveyAnswerValue | undefined>;

function isAnswerProvided(value: SurveyAnswerValue | undefined) {
  if (value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return Number.isInteger(value);
}

function normalizeAnswer(question: SurveyQuestion, value: SurveyAnswerValue) {
  if (question.type === SurveyQuestionType.TEXT && typeof value === 'string') {
    return value.trim();
  }

  if (
    question.type === SurveyQuestionType.SINGLE &&
    typeof value === 'string'
  ) {
    return value.trim();
  }

  if (question.type === SurveyQuestionType.MULTIPLE && Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }

  return value;
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }

  return fallback;
}

function PreviousAnswer({
  question,
  answer,
}: {
  question: SurveyQuestion;
  answer: SurveyAnswer | undefined;
}) {
  const { t } = useTranslation();

  if (!answer) {
    return (
      <p className="text-sm text-slate-500">
        {t('surveys.player.noSavedAnswer')}
      </p>
    );
  }

  const value = answer.value;

  if (Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-2">
        {value.map((item) => (
          <span
            key={item}
            className="rounded-md bg-slate-100 px-2.5 py-1 text-sm text-slate-700"
          >
            {item}
          </span>
        ))}
      </div>
    );
  }

  if (question.type === SurveyQuestionType.RATING) {
    return (
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span>{value}</span>
        <span className="text-slate-500">/ 5</span>
      </div>
    );
  }

  return (
    <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
      {String(value)}
    </p>
  );
}

export default function SurveyPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<AnswersState>({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const myResponseQueryKey = ['surveys', id, 'my-response'] as const;

  const surveyQuery = useQuery({
    queryKey: ['surveys', id],
    enabled: Boolean(id),
    queryFn: () => surveysApi.getById(id as string),
  });

  const responseQuery = useQuery({
    queryKey: myResponseQueryKey,
    enabled: Boolean(id),
    queryFn: () => surveysApi.getMyResponse(id as string),
  });

  const submitMutation = useMutation({
    mutationFn: (payload: { surveyId: string; answers: SurveyAnswer[] }) =>
      surveysApi.submit(payload.surveyId, { answers: payload.answers }),
    onSuccess: async (result) => {
      queryClient.setQueryData<SurveyMyResponse>(
        myResponseQueryKey,
        (current) => ({
          completed: true,
          anonymous: result.anonymous,
          response: current?.response ?? null,
        }),
      );
      setSuccessMessage(t('surveys.player.submitSuccess'));
      setFormError('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['surveys', 'active'] }),
        queryClient.invalidateQueries({ queryKey: myResponseQueryKey }),
      ]);
    },
    onError: (error) => {
      setSuccessMessage('');
      setFormError(
        getRequestErrorMessage(error, t('surveys.player.submitError')),
      );
    },
  });

  const survey = surveyQuery.data;
  const sortedQuestions = useMemo(() => {
    return [...(survey?.questions ?? [])].sort((a, b) => a.order - b.order);
  }, [survey?.questions]);

  const savedAnswers = useMemo(() => {
    return new Map(
      responseQuery.data?.response?.answers.map((answer) => [
        answer.questionId,
        answer,
      ]) ?? [],
    );
  }, [responseQuery.data?.response?.answers]);

  const completed = Boolean(responseQuery.data?.completed);
  const startsAt = survey?.startDate
    ? new Date(survey.startDate).getTime()
    : null;
  const endsAt = survey?.endDate ? new Date(survey.endDate).getTime() : null;
  const now = surveyQuery.dataUpdatedAt;
  const isScheduled =
    !completed &&
    startsAt !== null &&
    !Number.isNaN(startsAt) &&
    startsAt > now;
  const isClosed =
    !completed &&
    (survey?.status === SurveyStatus.CLOSED ||
      (endsAt !== null && !Number.isNaN(endsAt) && endsAt <= now));
  const requiredQuestions = useMemo(
    () => sortedQuestions.filter((question) => question.required),
    [sortedQuestions],
  );
  const requiredAnsweredCount = requiredQuestions.filter((question) =>
    isAnswerProvided(answers[question.id]),
  ).length;
  const progressAnsweredCount = completed
    ? sortedQuestions.length
    : requiredAnsweredCount;
  const progressTotalCount = completed
    ? sortedQuestions.length
    : requiredQuestions.length;
  const progress = completed
    ? 100
    : progressTotalCount === 0
      ? 0
      : Math.round((progressAnsweredCount / progressTotalCount) * 100);
  const progressCaption =
    !completed && progressTotalCount === 0
      ? t('surveys.player.noRequiredQuestions')
      : `${progressAnsweredCount} / ${progressTotalCount} ${
          completed
            ? t('surveys.player.answered')
            : t('surveys.player.requiredAnswered')
        }`;

  useEffect(() => {
    if (!successMessage) return undefined;

    const timeoutId = window.setTimeout(() => setSuccessMessage(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [successMessage]);

  const updateAnswer = (
    questionId: string,
    value: SurveyAnswerValue | undefined,
  ) => {
    setAnswers((current) => ({
      ...current,
      [questionId]: value,
    }));
    setFormError('');
  };

  const toggleMultipleAnswer = (questionId: string, option: string) => {
    const current = answers[questionId];
    const selected = Array.isArray(current) ? current : [];
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];

    updateAnswer(questionId, next);
  };

  const handleSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();

    if (!id || !survey) return;

    const missingQuestion = sortedQuestions.find(
      (question) => question.required && !isAnswerProvided(answers[question.id]),
    );

    if (missingQuestion) {
      setSuccessMessage('');
      setFormError(t('surveys.player.requiredError'));
      return;
    }

    const payload = sortedQuestions.reduce<SurveyAnswer[]>((acc, question) => {
      const rawValue = answers[question.id];
      if (!isAnswerProvided(rawValue)) return acc;

      const value = normalizeAnswer(question, rawValue as SurveyAnswerValue);
      if (!isAnswerProvided(value)) return acc;

      acc.push({
        questionId: question.id,
        value,
      });
      return acc;
    }, []);

    if (!window.confirm(t('surveys.player.confirmSubmit'))) {
      return;
    }

    submitMutation.mutate({
      surveyId: id,
      answers: payload,
    });
  };

  if (surveyQuery.isLoading || responseQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (surveyQuery.isError || responseQuery.isError || !survey) {
    return (
      <div className="space-y-4">
        <Link
          to="/surveys"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-700"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('common.back')}
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {t('surveys.player.loadError')}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link
        to="/surveys"
        className="inline-flex items-center gap-2 text-sm font-medium text-blue-700"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('common.back')}
      </Link>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {survey.anonymous && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('surveys.anonymous')}
                </span>
              )}

              {completed && (
                <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2.5 py-1 text-xs font-semibold text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('surveys.statusCompleted')}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-slate-900">
              {survey.title}
            </h1>

            {survey.description && (
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {survey.description}
              </p>
            )}
          </div>

          <div className="min-w-52 rounded-lg bg-slate-50 px-4 py-3">
            <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
              <span>{t('surveys.player.progress')}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-blue-600 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {progressCaption}
            </p>
          </div>
        </div>
      </section>

      {completed ? (
        <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <ClipboardCheck className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {t('surveys.player.completedTitle')}
              </h2>
              <p className="text-sm text-slate-500">
                {responseQuery.data?.anonymous
                  ? t('surveys.player.anonymousCompleted')
                  : t('surveys.player.savedAnswers')}
              </p>
            </div>
          </div>

          {!responseQuery.data?.anonymous && (
            <div className="space-y-3">
              {sortedQuestions.map((question) => (
                <div
                  key={question.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <p className="mb-3 break-words text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                    {question.order + 1}. {question.text}
                  </p>
                  <PreviousAnswer
                    question={question}
                    answer={savedAnswers.get(question.id)}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : isScheduled || isClosed ? (
        <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                isScheduled
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {isScheduled
                  ? t('surveys.player.scheduledTitle')
                  : t('surveys.player.closedTitle')}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                {isScheduled && survey.startDate
                  ? t('surveys.player.scheduledDescription', {
                      date: new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(survey.startDate)),
                    })
                  : t('surveys.player.closedDescription')}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {sortedQuestions.map((question, index) => (
            <fieldset
              key={question.id}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
              <legend className="sr-only">
                {index + 1}. {question.text}
                {question.required && (
                  <span> *</span>
                )}
              </legend>
              <div className="mb-4 flex min-w-0 items-start gap-1 text-base font-semibold text-slate-900">
                <span className="shrink-0">{index + 1}.</span>
                <span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">
                  {question.text}
                </span>
                {question.required && (
                  <span className="shrink-0 text-red-600">*</span>
                )}
              </div>

              {question.type === SurveyQuestionType.SINGLE && (
                <div className="space-y-2">
                  {question.options.map((option) => (
                    <label
                      key={option}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name={question.id}
                        value={option}
                        checked={answers[question.id] === option}
                        onChange={() => updateAnswer(question.id, option)}
                        className="h-4 w-4 text-blue-600"
                      />
                      {option}
                    </label>
                  ))}
                </div>
              )}

              {question.type === SurveyQuestionType.MULTIPLE && (
                <div className="space-y-2">
                  {question.options.map((option) => {
                    const selected = Array.isArray(answers[question.id])
                      ? (answers[question.id] as string[])
                      : [];

                    return (
                      <label
                        key={option}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          value={option}
                          checked={selected.includes(option)}
                          onChange={() =>
                            toggleMultipleAnswer(question.id, option)
                          }
                          className="h-4 w-4 rounded text-blue-600"
                        />
                        {option}
                      </label>
                    );
                  })}
                </div>
              )}

              {question.type === SurveyQuestionType.RATING && (
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      onClick={() => updateAnswer(question.id, rating)}
                      className={`flex h-11 w-11 items-center justify-center rounded-lg border text-sm font-semibold transition ${
                        answers[question.id] === rating
                          ? 'border-blue-600 bg-blue-600 text-white'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              )}

              {question.type === SurveyQuestionType.TEXT && (
                <textarea
                  value={
                    typeof answers[question.id] === 'string'
                      ? (answers[question.id] as string)
                      : ''
                  }
                  onChange={(event) =>
                    updateAnswer(question.id, event.target.value)
                  }
                  maxLength={5000}
                  rows={5}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  placeholder={t('surveys.player.textPlaceholder')}
                />
              )}
            </fieldset>
          ))}

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {successMessage}
            </div>
          )}

          <div className="sticky bottom-4 flex justify-end">
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {submitMutation.isPending
                ? t('surveys.player.submitting')
                : t('surveys.player.submit')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
