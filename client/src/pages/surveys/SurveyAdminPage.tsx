import { useEffect, useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  FilePlus2,
  Filter,
  ListChecks,
  Plus,
  Rocket,
  Search,
  SquarePen,
  Trash2,
  XCircle,
} from 'lucide-react';
import { surveysApi, type SurveyListFilters } from '../../services/surveysApi';
import { useAuthStore } from '../../store/authStore';
import {
  Role,
  SurveyQuestionType,
  SurveyStatus,
  SurveyTargetType,
  type CreateSurveyInput,
  type CreateSurveyQuestionInput,
  type Survey,
} from '../../types';

type BuilderQuestion = {
  localId: string;
  type: SurveyQuestionType;
  text: string;
  options: string[];
  required: boolean;
};

type SurveyFormState = {
  title: string;
  description: string;
  anonymous: boolean;
  targetType: SurveyTargetType;
  targetIds: string[];
  startDate: string;
  endDate: string;
  questions: BuilderQuestion[];
};

function createLocalId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `question-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const createQuestion = (): BuilderQuestion => ({
  localId: createLocalId(),
  type: SurveyQuestionType.SINGLE,
  text: '',
  options: ['', ''],
  required: true,
});

const initialForm = (): SurveyFormState => ({
  title: '',
  description: '',
  anonymous: true,
  targetType: SurveyTargetType.ALL,
  targetIds: [],
  startDate: '',
  endDate: '',
  questions: [createQuestion()],
});

const surveyTargetTypesWithIds = new Set<SurveyTargetType>([
  SurveyTargetType.GROUPS,
  SurveyTargetType.COURSE,
]);

function surveyTargetTypeRequiresIds(targetType: SurveyTargetType) {
  return surveyTargetTypesWithIds.has(targetType);
}

function toIsoDateTime(value: string) {
  if (!value) return undefined;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function toDateTimeLocalValue(value?: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }

  return fallback;
}

function surveyToFormState(survey: Survey): SurveyFormState {
  const questions = [...survey.questions]
    .sort((a, b) => a.order - b.order)
    .map((question) => ({
      localId: question.id || createLocalId(),
      type: question.type,
      text: question.text,
      options:
        question.type === SurveyQuestionType.SINGLE ||
        question.type === SurveyQuestionType.MULTIPLE
          ? question.options.length > 0
            ? question.options
            : ['', '']
          : [],
      required: question.required,
    }));

  return {
    title: survey.title,
    description: survey.description ?? '',
    anonymous: survey.anonymous,
    targetType: survey.targetType,
    targetIds: [...survey.targetIds],
    startDate: toDateTimeLocalValue(survey.startDate),
    endDate: toDateTimeLocalValue(survey.endDate),
    questions: questions.length > 0 ? questions : [createQuestion()],
  };
}

function buildSurveyPayload(form: SurveyFormState): CreateSurveyInput {
  const questions: CreateSurveyQuestionInput[] = form.questions.map(
    (question, index) => {
      const isChoice =
        question.type === SurveyQuestionType.SINGLE ||
        question.type === SurveyQuestionType.MULTIPLE;

      return {
        type: question.type,
        text: question.text.trim(),
        required: question.required,
        order: index,
        ...(isChoice
          ? {
              options: [
                ...new Set(
                  question.options
                    .map((option) => option.trim())
                    .filter(Boolean),
                ),
              ],
            }
          : {}),
      };
    },
  );

  return {
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    anonymous: form.anonymous,
    targetType: form.targetType,
    targetIds: surveyTargetTypeRequiresIds(form.targetType)
      ? [...new Set(form.targetIds)]
      : [],
    startDate: toIsoDateTime(form.startDate),
    endDate: toIsoDateTime(form.endDate),
    questions,
  };
}

function validateSurveyForm(form: SurveyFormState, t: (key: string) => string) {
  if (!form.title.trim()) {
    return t('surveys.admin.validation.titleRequired');
  }

  if (
    surveyTargetTypeRequiresIds(form.targetType) &&
    form.targetIds.length === 0
  ) {
    return t('surveys.admin.validation.targetRequired');
  }

  if (form.startDate && form.endDate) {
    const start = new Date(form.startDate).getTime();
    const end = new Date(form.endDate).getTime();
    if (!Number.isNaN(start) && !Number.isNaN(end) && end <= start) {
      return t('surveys.admin.validation.endAfterStart');
    }
  }

  const invalidQuestion = form.questions.find((question) => {
    if (!question.text.trim()) return true;
    if (
      question.type === SurveyQuestionType.SINGLE ||
      question.type === SurveyQuestionType.MULTIPLE
    ) {
      return (
        [
          ...new Set(
            question.options.map((option) => option.trim()).filter(Boolean),
          ),
        ].length < 2
      );
    }
    return false;
  });

  if (invalidQuestion) {
    return t('surveys.admin.validation.questionInvalid');
  }

  return '';
}

function statusBadgeClass(status: SurveyStatus) {
  if (status === SurveyStatus.ACTIVE) {
    return 'bg-green-100 text-green-700';
  }

  if (status === SurveyStatus.CLOSED) {
    return 'bg-slate-200 text-slate-700';
  }

  return 'bg-amber-100 text-amber-700';
}

function SurveyManagementRow({
  survey,
  canDelete,
  onPublish,
  onClose,
  onRemove,
  onEdit,
  isWorking,
}: {
  survey: Survey;
  canDelete: boolean;
  onPublish: (id: string) => void;
  onClose: (id: string) => void;
  onRemove: (id: string) => void;
  onEdit: (survey: Survey) => void;
  isWorking: boolean;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const isScheduled =
    survey.status === SurveyStatus.ACTIVE &&
    Boolean(survey.startDate) &&
    Boolean(survey.publishedAt) &&
    new Date(survey.startDate as string).getTime() >
      new Date(survey.publishedAt as string).getTime();

  const formatDate = (value?: string) =>
    value
      ? new Intl.DateTimeFormat(locale, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(new Date(value))
      : '—';

  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                survey.status,
              )}`}
            >
              {isScheduled
                ? t('surveys.statuses.scheduled')
                : t(`surveys.statuses.${survey.status}`)}
            </span>
            <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
              {t(`surveys.targetTypes.${survey.targetType}`)}
            </span>
            {survey.anonymous && (
              <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                {t('surveys.anonymous')}
              </span>
            )}
          </div>

          <h3 className="text-base font-semibold text-slate-900">
            {survey.title}
          </h3>
          {survey.description && (
            <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">
              {survey.description}
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span>
              {t('surveys.questions')}: {survey.questions.length}
            </span>
            <span>
              {t('surveys.startsAt')}: {formatDate(survey.startDate)}
            </span>
            <span>
              {t('surveys.endsAt')}: {formatDate(survey.endDate)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Link
            to={`/surveys/admin/${survey.id}/results`}
            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            {t('surveys.admin.results')}
          </Link>

          {survey.status === SurveyStatus.DRAFT && (
            <button
              type="button"
              disabled={isWorking}
              onClick={() => onEdit(survey)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <SquarePen className="h-4 w-4" aria-hidden="true" />
              {t('surveys.admin.edit')}
            </button>
          )}

          {survey.status === SurveyStatus.DRAFT && (
            <button
              type="button"
              disabled={isWorking}
              onClick={() => onPublish(survey.id)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <Rocket className="h-4 w-4" aria-hidden="true" />
              {t('surveys.admin.publish')}
            </button>
          )}

          {survey.status === SurveyStatus.ACTIVE && (
            <button
              type="button"
              disabled={isWorking}
              onClick={() => onClose(survey.id)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
            >
              <XCircle className="h-4 w-4" aria-hidden="true" />
              {t('surveys.admin.close')}
            </button>
          )}

          {canDelete && survey.status === SurveyStatus.DRAFT && (
            <button
              type="button"
              disabled={isWorking}
              onClick={() => onRemove(survey.id)}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-red-300"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              {t('surveys.admin.delete')}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function SurveyAdminPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [filters, setFilters] = useState<SurveyListFilters>({
    search: '',
    status: '',
    targetType: '',
  });
  const [form, setForm] = useState<SurveyFormState>(() => initialForm());
  const [editingSurvey, setEditingSurvey] = useState<Survey | null>(null);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const effectiveFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [debouncedSearch, filters],
  );

  const queryKey = useMemo(
    () => [
      'surveys',
      'managed',
      debouncedSearch,
      filters.status,
      filters.targetType,
    ],
    [debouncedSearch, filters.status, filters.targetType],
  );

  const {
    data: surveys = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey,
    queryFn: () => surveysApi.listManaged(effectiveFilters),
  });
  const groupsQuery = useQuery({
    queryKey: ['surveys', 'target-options', 'groups'],
    enabled: form.targetType === SurveyTargetType.GROUPS,
    queryFn: surveysApi.listTargetGroups,
  });
  const coursesQuery = useQuery({
    queryKey: ['surveys', 'target-options', 'courses'],
    enabled: form.targetType === SurveyTargetType.COURSE,
    queryFn: surveysApi.listTargetCourses,
  });

  const targetOptions = useMemo(() => {
    const options =
      form.targetType === SurveyTargetType.GROUPS
        ? (groupsQuery.data ?? []).map((group) => ({
            id: group.id,
            label: group.code ?? group.name ?? group.id,
          }))
        : form.targetType === SurveyTargetType.COURSE
          ? (coursesQuery.data ?? []).map((course) => ({
              id: course.id,
              label: `${course.code} · ${course.name}`,
            }))
          : [];
    const knownIds = new Set(options.map((option) => option.id));

    return [
      ...options,
      ...form.targetIds
        .filter((id) => !knownIds.has(id))
        .map((id) => ({ id, label: id })),
    ];
  }, [
    coursesQuery.data,
    form.targetIds,
    form.targetType,
    groupsQuery.data,
  ]);
  const isLoadingTargetOptions =
    groupsQuery.isLoading || coursesQuery.isLoading;
  const hasTargetOptionsError = groupsQuery.isError || coursesQuery.isError;

  const invalidateSurveys = () =>
    queryClient.invalidateQueries({ queryKey: ['surveys'] });

  const createMutation = useMutation({
    mutationFn: surveysApi.create,
    onSuccess: async () => {
      setForm(initialForm());
      setEditingSurvey(null);
      setFormError('');
      setNotice(t('surveys.admin.createSuccess'));
      await invalidateSurveys();
    },
    onError: (error) => {
      setNotice('');
      setFormError(
        getRequestErrorMessage(error, t('surveys.admin.createError')),
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateSurveyInput;
    }) => surveysApi.update(id, payload),
    onSuccess: async () => {
      setForm(initialForm());
      setEditingSurvey(null);
      setFormError('');
      setNotice(t('surveys.admin.updateSuccess'));
      await invalidateSurveys();
    },
    onError: (error) => {
      setNotice('');
      setFormError(
        getRequestErrorMessage(error, t('surveys.admin.updateError')),
      );
    },
  });

  const publishMutation = useMutation({
    mutationFn: surveysApi.publish,
    onSuccess: async () => {
      setNotice(t('surveys.admin.publishSuccess'));
      await invalidateSurveys();
    },
  });

  const closeMutation = useMutation({
    mutationFn: surveysApi.close,
    onSuccess: async () => {
      setNotice(t('surveys.admin.closeSuccess'));
      await invalidateSurveys();
    },
  });

  const removeMutation = useMutation({
    mutationFn: surveysApi.remove,
    onSuccess: async () => {
      setNotice(t('surveys.admin.deleteSuccess'));
      await invalidateSurveys();
    },
  });

  const actionError =
    publishMutation.error || closeMutation.error || removeMutation.error;
  const actionErrorMessage = actionError
    ? getRequestErrorMessage(actionError, t('surveys.admin.actionError'))
    : '';
  const isWorking =
    createMutation.isPending ||
    updateMutation.isPending ||
    publishMutation.isPending ||
    closeMutation.isPending ||
    removeMutation.isPending;

  useEffect(() => {
    if (!notice) return undefined;

    const timeoutId = window.setTimeout(() => setNotice(''), 5000);
    return () => window.clearTimeout(timeoutId);
  }, [notice]);

  useEffect(() => {
    const timeoutId = window.setTimeout(
      () => setDebouncedSearch(filters.search ?? ''),
      300,
    );
    return () => window.clearTimeout(timeoutId);
  }, [filters.search]);

  const updateQuestion = (
    localId: string,
    patch: Partial<BuilderQuestion>,
  ) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.localId === localId ? { ...question, ...patch } : question,
      ),
    }));
    setFormError('');
  };

  const updateQuestionType = (
    localId: string,
    type: SurveyQuestionType,
  ) => {
    const options =
      type === SurveyQuestionType.SINGLE ||
      type === SurveyQuestionType.MULTIPLE
        ? ['', '']
        : [];
    updateQuestion(localId, { type, options });
  };

  const updateQuestionOption = (
    localId: string,
    optionIndex: number,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) => {
        if (question.localId !== localId) return question;

        return {
          ...question,
          options: question.options.map((option, index) =>
            index === optionIndex ? value : option,
          ),
        };
      }),
    }));
    setFormError('');
  };

  const addQuestionOption = (localId: string) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.localId === localId
          ? { ...question, options: [...question.options, ''] }
          : question,
      ),
    }));
  };

  const removeQuestionOption = (localId: string, optionIndex: number) => {
    setForm((current) => ({
      ...current,
      questions: current.questions.map((question) =>
        question.localId === localId
          ? {
              ...question,
              options: question.options.filter(
                (_, index) => index !== optionIndex,
              ),
            }
          : question,
      ),
    }));
  };

  const addQuestion = () => {
    setForm((current) => ({
      ...current,
      questions: [...current.questions, createQuestion()],
    }));
  };

  const removeQuestion = (localId: string) => {
    setForm((current) => ({
      ...current,
      questions:
        current.questions.length === 1
          ? current.questions
          : current.questions.filter((question) => question.localId !== localId),
    }));
  };

  const moveQuestion = (localId: string, direction: -1 | 1) => {
    setForm((current) => {
      const currentIndex = current.questions.findIndex(
        (question) => question.localId === localId,
      );
      const nextIndex = currentIndex + direction;

      if (
        currentIndex < 0 ||
        nextIndex < 0 ||
        nextIndex >= current.questions.length
      ) {
        return current;
      }

      const questions = [...current.questions];
      const [question] = questions.splice(currentIndex, 1);
      questions.splice(nextIndex, 0, question);

      return {
        ...current,
        questions,
      };
    });
  };

  const handleSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();

    const validationError = validateSurveyForm(form, t);
    if (validationError) {
      setNotice('');
      setFormError(validationError);
      return;
    }

    const payload = buildSurveyPayload(form);
    if (editingSurvey) {
      updateMutation.mutate({ id: editingSurvey.id, payload });
      return;
    }

    createMutation.mutate(payload);
  };

  const handleEditSurvey = (survey: Survey) => {
    setEditingSurvey(survey);
    setForm(surveyToFormState(survey));
    setFormError('');
    setNotice('');
  };

  const handleCancelEdit = () => {
    setEditingSurvey(null);
    setForm(initialForm());
    setFormError('');
  };

  const handleFilterChange = (
    key: keyof SurveyListFilters,
    event: SyntheticEvent<HTMLSelectElement, Event>,
  ) => {
    setFilters((current) => ({
      ...current,
      [key]: event.currentTarget.value,
    }));
  };

  const toggleTarget = (targetId: string) => {
    setForm((current) => ({
      ...current,
      targetIds: current.targetIds.includes(targetId)
        ? current.targetIds.filter((id) => id !== targetId)
        : [...current.targetIds, targetId],
    }));
    setFormError('');
  };

  const canDelete = user?.role === Role.ADMIN;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <ListChecks className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('surveys.admin.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('surveys.admin.subtitle')}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <form
          onSubmit={handleSubmit}
          className="space-y-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <FilePlus2 className="h-5 w-5 text-blue-700" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-900">
              {editingSurvey
                ? t('surveys.admin.editTitle')
                : t('surveys.admin.createTitle')}
            </h2>
          </div>

          <div className="grid gap-4">
            <label className="space-y-1 text-sm text-slate-600">
              <span>{t('surveys.admin.fields.title')}</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                maxLength={200}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-600">
              <span>{t('surveys.admin.fields.description')}</span>
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    description: event.target.value,
                  }))
                }
                maxLength={2000}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('surveys.admin.fields.targetType')}</span>
                <select
                  value={form.targetType}
                  onChange={(event) => {
                    const nextTargetType = event.target
                      .value as SurveyTargetType;
                    setForm((current) => ({
                      ...current,
                      targetType: nextTargetType,
                      targetIds:
                        current.targetType === nextTargetType
                          ? current.targetIds
                          : [],
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  {Object.values(SurveyTargetType).map((targetType) => (
                    <option key={targetType} value={targetType}>
                      {t(`surveys.targetTypes.${targetType}`)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-slate-600">
                <span className="invisible select-none" aria-hidden="true">
                  {t('surveys.admin.fields.anonymous')}
                </span>
                <span className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.anonymous}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        anonymous: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 shrink-0 rounded text-blue-600"
                  />
                  {t('surveys.admin.fields.anonymous')}
                </span>
              </label>
            </div>

            {surveyTargetTypeRequiresIds(form.targetType) && (
              <fieldset className="space-y-2">
                <legend className="text-sm text-slate-600">
                  {t('surveys.admin.fields.targetIds')}
                </legend>
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-slate-300 p-2">
                  {isLoadingTargetOptions && (
                    <p className="px-2 py-3 text-sm text-slate-500">
                      {t('common.loading')}
                    </p>
                  )}
                  {hasTargetOptionsError && (
                    <p className="px-2 py-3 text-sm text-red-700">
                      {t('surveys.admin.targetOptionsError')}
                    </p>
                  )}
                  {!isLoadingTargetOptions &&
                    !hasTargetOptionsError &&
                    targetOptions.length === 0 && (
                      <p className="px-2 py-3 text-sm text-slate-500">
                        {t('surveys.admin.targetOptionsEmpty')}
                      </p>
                    )}
                  {targetOptions.map((option) => (
                    <label
                      key={option.id}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={form.targetIds.includes(option.id)}
                        onChange={() => toggleTarget(option.id)}
                        className="h-4 w-4 shrink-0 rounded text-blue-600"
                      />
                      <span className="min-w-0 break-words">
                        {option.label}
                      </span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate-500">
                  {t('surveys.admin.selectedTargets', {
                    count: form.targetIds.length,
                  })}
                </p>
              </fieldset>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('surveys.startsAt')}</span>
                <input
                  type="datetime-local"
                  value={form.startDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      startDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('surveys.endsAt')}</span>
                <input
                  type="datetime-local"
                  value={form.endDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      endDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {t('surveys.admin.questionsTitle')}
              </h3>
              <button
                type="button"
                onClick={addQuestion}
                className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t('surveys.admin.addQuestion')}
              </button>
            </div>

            {form.questions.map((question, index) => {
              const isChoice =
                question.type === SurveyQuestionType.SINGLE ||
                question.type === SurveyQuestionType.MULTIPLE;

              return (
                <div
                  key={question.localId}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <SquarePen className="h-4 w-4" aria-hidden="true" />
                      {t('surveys.admin.question')} {index + 1}
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(question.localId, -1)}
                        disabled={index === 0}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        title={t('surveys.admin.moveUp')}
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(question.localId, 1)}
                        disabled={index === form.questions.length - 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        title={t('surveys.admin.moveDown')}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(question.localId)}
                        disabled={form.questions.length === 1}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                        title={t('surveys.admin.delete')}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid gap-3">
                    <label className="space-y-1 text-sm text-slate-600">
                      <span>{t('surveys.admin.fields.questionText')}</span>
                      <input
                        value={question.text}
                        onChange={(event) =>
                          updateQuestion(question.localId, {
                            text: event.target.value,
                          })
                        }
                        maxLength={1000}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      />
                    </label>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm text-slate-600">
                        <span>{t('surveys.admin.fields.questionType')}</span>
                        <select
                          value={question.type}
                          onChange={(event) =>
                            updateQuestionType(
                              question.localId,
                              event.target.value as SurveyQuestionType,
                            )
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        >
                          {Object.values(SurveyQuestionType).map((type) => (
                            <option key={type} value={type}>
                              {t(`surveys.questionTypes.${type}`)}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-sm text-slate-600">
                        <span className="invisible select-none" aria-hidden="true">
                          {t('surveys.admin.fields.required')}
                        </span>
                        <span className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-slate-700">
                          <input
                            type="checkbox"
                            checked={question.required}
                            onChange={(event) =>
                              updateQuestion(question.localId, {
                                required: event.target.checked,
                              })
                            }
                            className="h-4 w-4 shrink-0 rounded text-blue-600"
                          />
                          {t('surveys.admin.fields.required')}
                        </span>
                      </label>
                    </div>

                    {isChoice && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-700">
                            {t('surveys.admin.options')}
                          </span>
                          <button
                            type="button"
                            onClick={() => addQuestionOption(question.localId)}
                            className="text-sm font-medium text-blue-700 hover:text-blue-800"
                          >
                            {t('surveys.admin.addOption')}
                          </button>
                        </div>

                        {question.options.map((option, optionIndex) => (
                          <div
                            key={`${question.localId}-${optionIndex}`}
                            className="flex gap-2"
                          >
                            <input
                              value={option}
                              onChange={(event) =>
                                updateQuestionOption(
                                  question.localId,
                                  optionIndex,
                                  event.target.value,
                                )
                              }
                              maxLength={200}
                              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                removeQuestionOption(
                                  question.localId,
                                  optionIndex,
                                )
                              }
                              disabled={question.options.length <= 2}
                              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {index === form.questions.length - 1 && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={addQuestion}
                        className="inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 sm:w-auto"
                      >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        {t('surveys.admin.addQuestion')}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          {notice && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {notice}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            {editingSurvey && (
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={isWorking}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-300"
              >
                {t('surveys.admin.cancelEdit')}
              </button>
            )}
            <button
              type="submit"
              disabled={isWorking}
              className="inline-flex min-h-11 flex-[2] items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {editingSurvey
                ? updateMutation.isPending
                  ? t('surveys.admin.updating')
                  : t('surveys.admin.update')
                : createMutation.isPending
                  ? t('surveys.admin.creating')
                  : t('surveys.admin.create')}
            </button>
          </div>
        </form>

        <section className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {t('surveys.admin.filters')}
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={filters.search ?? ''}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      search: event.target.value,
                    }))
                  }
                  maxLength={100}
                  placeholder={t('surveys.admin.searchPlaceholder')}
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <select
                value={filters.status}
                onChange={(event) => handleFilterChange('status', event)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">{t('surveys.admin.allStatuses')}</option>
                {Object.values(SurveyStatus).map((status) => (
                  <option key={status} value={status}>
                    {t(`surveys.statuses.${status}`)}
                  </option>
                ))}
              </select>

              <select
                value={filters.targetType}
                onChange={(event) => handleFilterChange('targetType', event)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">{t('surveys.admin.allTargets')}</option>
                {Object.values(SurveyTargetType).map((targetType) => (
                  <option key={targetType} value={targetType}>
                    {t(`surveys.targetTypes.${targetType}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {actionErrorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {actionErrorMessage}
            </div>
          )}

          {isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {t('surveys.admin.loadError')}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center rounded-lg border border-slate-200 bg-white py-16 shadow-sm">
              <div className="h-9 w-9 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            </div>
          ) : surveys.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-500 shadow-sm">
              {t('surveys.admin.empty')}
            </div>
          ) : (
            <div className="space-y-3">
              {surveys.map((survey) => (
                <SurveyManagementRow
                  key={survey.id}
                  survey={survey}
                  canDelete={canDelete}
                  isWorking={isWorking}
                  onPublish={(surveyId) => {
                    if (window.confirm(t('surveys.admin.publishConfirm'))) {
                      publishMutation.mutate(surveyId);
                    }
                  }}
                  onClose={(surveyId) => {
                    if (window.confirm(t('surveys.admin.closeConfirm'))) {
                      closeMutation.mutate(surveyId);
                    }
                  }}
                  onEdit={handleEditSurvey}
                  onRemove={(surveyId) => {
                    if (window.confirm(t('surveys.admin.deleteConfirm'))) {
                      removeMutation.mutate(surveyId);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
