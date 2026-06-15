import { useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import {
  Archive,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FilePenLine,
  Filter,
  GraduationCap,
  PlayCircle,
  Save,
  SquarePen,
  XCircle,
} from 'lucide-react';
import {
  electiveReferencesApi,
  electivesApi,
  type ElectiveDisciplineFilters,
  type ElectiveExportFormat,
  type ElectivePeriodFilters,
} from '../../services/electivesApi';
import {
  ElectiveDisciplineStatus,
  ElectivePeriodStatus,
  Role,
  type CreateElectiveDisciplineInput,
  type CreateElectivePeriodInput,
  type ElectiveDiscipline,
  type ElectivePeriod,
} from '../../types';
import { useAuthStore } from '../../store/authStore';
import { downloadBlob } from '../../utils/spreadsheetExport';

type DisciplineFormState = {
  code: string;
  title: string;
  description: string;
  departmentId: string;
  teacherId: string;
  semester: string;
  credits: string;
  capacity: string;
};

type PeriodFormState = {
  title: string;
  academicYear: string;
  semester: string;
  startsAt: string;
  endsAt: string;
  targetGroupIds: string[];
  requiredChoices: string;
};

function initialDisciplineForm(): DisciplineFormState {
  return {
    code: '',
    title: '',
    description: '',
    departmentId: '',
    teacherId: '',
    semester: '1',
    credits: '3',
    capacity: '30',
  };
}

function initialPeriodForm(): PeriodFormState {
  const now = new Date();
  const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  return {
    title: '',
    academicYear: `${now.getFullYear()}/${now.getFullYear() + 1}`,
    semester: '1',
    startsAt: toDateTimeLocalValue(now.toISOString()),
    endsAt: toDateTimeLocalValue(end.toISOString()),
    targetGroupIds: [],
    requiredChoices: '1',
  };
}

function toDateTimeLocalValue(value?: string) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function getRequestErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  }

  return fallback;
}

function buildDisciplinePayload(
  form: DisciplineFormState,
): CreateElectiveDisciplineInput {
  return {
    code: form.code.trim(),
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    departmentId: form.departmentId,
    teacherId: form.teacherId || undefined,
    semester: Number(form.semester),
    credits: Number(form.credits),
    capacity: Number(form.capacity),
  };
}

function buildPeriodPayload(form: PeriodFormState): CreateElectivePeriodInput {
  return {
    title: form.title.trim(),
    academicYear: form.academicYear.trim(),
    semester: Number(form.semester),
    startsAt: toIsoDateTime(form.startsAt),
    endsAt: toIsoDateTime(form.endsAt),
    targetGroupIds: form.targetGroupIds,
    requiredChoices: Number(form.requiredChoices),
  };
}

function disciplineToForm(discipline: ElectiveDiscipline): DisciplineFormState {
  return {
    code: discipline.code,
    title: discipline.title,
    description: discipline.description ?? '',
    departmentId: discipline.department.id,
    teacherId: discipline.teacher?.id ?? '',
    semester: String(discipline.semester),
    credits: String(discipline.credits),
    capacity: String(discipline.capacity),
  };
}

function periodToForm(period: ElectivePeriod): PeriodFormState {
  return {
    title: period.title,
    academicYear: period.academicYear,
    semester: String(period.semester),
    startsAt: toDateTimeLocalValue(period.startsAt),
    endsAt: toDateTimeLocalValue(period.endsAt),
    targetGroupIds: period.targetGroups.map((group) => group.id),
    requiredChoices: String(period.requiredChoices),
  };
}

function statusBadgeClass(status: ElectiveDisciplineStatus | ElectivePeriodStatus) {
  if (status === ElectivePeriodStatus.FINALIZED) {
    return 'bg-emerald-100 text-emerald-700';
  }

  if (status === ElectiveDisciplineStatus.ACTIVE) {
    return 'bg-green-100 text-green-700';
  }

  if (
    status === ElectiveDisciplineStatus.ARCHIVED ||
    status === ElectivePeriodStatus.CLOSED
  ) {
    return 'bg-slate-200 text-slate-700';
  }

  return 'bg-amber-100 text-amber-700';
}

export default function ElectiveAdminPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
  const canManagePeriods = user?.role !== Role.DEPARTMENT_HEAD;

  const [disciplineForm, setDisciplineForm] = useState(() =>
    initialDisciplineForm(),
  );
  const [periodForm, setPeriodForm] = useState(() => initialPeriodForm());
  const [editingDiscipline, setEditingDiscipline] =
    useState<ElectiveDiscipline | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<ElectivePeriod | null>(
    null,
  );
  const [disciplineFilters, setDisciplineFilters] =
    useState<ElectiveDisciplineFilters>({
      status: '',
      semester: '',
      departmentId: '',
    });
  const [periodFilters, setPeriodFilters] = useState<ElectivePeriodFilters>({
    status: '',
    semester: '',
  });
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const disciplineQueryKey = useMemo(
    () => [
      'electives',
      'admin',
      'disciplines',
      disciplineFilters.status,
      disciplineFilters.semester,
      disciplineFilters.departmentId,
    ],
    [
      disciplineFilters.departmentId,
      disciplineFilters.semester,
      disciplineFilters.status,
    ],
  );
  const periodQueryKey = useMemo(
    () => [
      'electives',
      'admin',
      'periods',
      periodFilters.status,
      periodFilters.semester,
    ],
    [periodFilters.semester, periodFilters.status],
  );

  const { data: departments = [] } = useQuery({
    queryKey: ['references', 'departments'],
    queryFn: electiveReferencesApi.listDepartments,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ['references', 'groups'],
    queryFn: electiveReferencesApi.listGroups,
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ['users', 'department-teachers', disciplineForm.departmentId],
    enabled: Boolean(disciplineForm.departmentId),
    queryFn: () =>
      electiveReferencesApi.listTeachersByDepartment(
        disciplineForm.departmentId,
      ),
  });

  const {
    data: disciplines = [],
    isLoading: disciplinesLoading,
    isError: disciplinesError,
  } = useQuery({
    queryKey: disciplineQueryKey,
    queryFn: () => electivesApi.listDisciplines(disciplineFilters),
  });
  const {
    data: periods = [],
    isLoading: periodsLoading,
    isError: periodsError,
  } = useQuery({
    queryKey: periodQueryKey,
    enabled: canManagePeriods,
    queryFn: () => electivesApi.listPeriods(periodFilters),
  });

  const invalidateElectives = async () => {
    await queryClient.invalidateQueries({ queryKey: ['electives'] });
  };

  const createDisciplineMutation = useMutation({
    mutationFn: electivesApi.createDiscipline,
    onSuccess: async () => {
      setDisciplineForm(initialDisciplineForm());
      setEditingDiscipline(null);
      setFormError('');
      setNotice(t('electives.admin.disciplineSaved'));
      await invalidateElectives();
    },
    onError: (error) => {
      setNotice('');
      setFormError(
        getRequestErrorMessage(error, t('electives.admin.saveError')),
      );
    },
  });

  const updateDisciplineMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateElectiveDisciplineInput;
    }) => electivesApi.updateDiscipline(id, payload),
    onSuccess: async () => {
      setDisciplineForm(initialDisciplineForm());
      setEditingDiscipline(null);
      setFormError('');
      setNotice(t('electives.admin.disciplineSaved'));
      await invalidateElectives();
    },
    onError: (error) => {
      setNotice('');
      setFormError(
        getRequestErrorMessage(error, t('electives.admin.saveError')),
      );
    },
  });

  const createPeriodMutation = useMutation({
    mutationFn: electivesApi.createPeriod,
    onSuccess: async () => {
      setPeriodForm(initialPeriodForm());
      setEditingPeriod(null);
      setFormError('');
      setNotice(t('electives.admin.periodSaved'));
      await invalidateElectives();
    },
    onError: (error) => {
      setNotice('');
      setFormError(
        getRequestErrorMessage(error, t('electives.admin.saveError')),
      );
    },
  });

  const updatePeriodMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: CreateElectivePeriodInput;
    }) => electivesApi.updatePeriod(id, payload),
    onSuccess: async () => {
      setPeriodForm(initialPeriodForm());
      setEditingPeriod(null);
      setFormError('');
      setNotice(t('electives.admin.periodSaved'));
      await invalidateElectives();
    },
    onError: (error) => {
      setNotice('');
      setFormError(
        getRequestErrorMessage(error, t('electives.admin.saveError')),
      );
    },
  });

  const setDisciplineStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: ElectiveDisciplineStatus;
    }) => electivesApi.setDisciplineStatus(id, status),
    onSuccess: invalidateElectives,
  });
  const setPeriodStatusMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: ElectivePeriodStatus;
    }) => electivesApi.setPeriodStatus(id, status),
    onSuccess: invalidateElectives,
  });
  const finalizePeriodMutation = useMutation({
    mutationFn: electivesApi.finalizePeriod,
    onSuccess: async () => {
      setNotice(t('electives.admin.finalizedSuccess'));
      await invalidateElectives();
    },
  });
  const exportMutation = useMutation({
    mutationFn: ({
      id,
      format,
    }: {
      id: string;
      format: ElectiveExportFormat;
    }) => electivesApi.exportPeriodResults(id, format),
    onSuccess: (blob, { id, format }) => {
      downloadBlob(blob, `elective-period-${id}-results.${format}`);
    },
  });

  const isWorking =
    createDisciplineMutation.isPending ||
    updateDisciplineMutation.isPending ||
    createPeriodMutation.isPending ||
    updatePeriodMutation.isPending ||
    setDisciplineStatusMutation.isPending ||
    setPeriodStatusMutation.isPending ||
    finalizePeriodMutation.isPending ||
    exportMutation.isPending;

  const actionError =
    setDisciplineStatusMutation.error ||
    setPeriodStatusMutation.error ||
    finalizePeriodMutation.error ||
    exportMutation.error;
  const actionErrorMessage = actionError
    ? getRequestErrorMessage(actionError, t('electives.admin.actionError'))
    : '';

  const handleDisciplineSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    const payload = buildDisciplinePayload(disciplineForm);

    if (!payload.code || !payload.title || !payload.departmentId) {
      setFormError(t('electives.admin.requiredError'));
      return;
    }

    if (editingDiscipline) {
      updateDisciplineMutation.mutate({ id: editingDiscipline.id, payload });
      return;
    }

    createDisciplineMutation.mutate(payload);
  };

  const handlePeriodSubmit = (
    event: SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) => {
    event.preventDefault();
    const payload = buildPeriodPayload(periodForm);

    if (!payload.title || payload.targetGroupIds.length === 0) {
      setFormError(t('electives.admin.requiredError'));
      return;
    }

    if (editingPeriod) {
      updatePeriodMutation.mutate({ id: editingPeriod.id, payload });
      return;
    }

    createPeriodMutation.mutate(payload);
  };

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {t('electives.admin.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {t('electives.admin.subtitle')}
            </p>
          </div>
        </div>
      </section>

      {(formError || notice || actionErrorMessage) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            formError || actionErrorMessage
              ? 'border-red-200 bg-red-50 text-red-700'
              : 'border-green-200 bg-green-50 text-green-700'
          }`}
        >
          {formError || actionErrorMessage || notice}
        </div>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <div className="space-y-6">
          <form
            onSubmit={handleDisciplineSubmit}
            className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingDiscipline
                  ? t('electives.admin.editDiscipline')
                  : t('electives.admin.newDiscipline')}
              </h2>
              {editingDiscipline && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingDiscipline(null);
                    setDisciplineForm(initialDisciplineForm());
                    setFormError('');
                  }}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  {t('surveys.admin.cancelEdit')}
                </button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.admin.fields.code')}</span>
                <input
                  value={disciplineForm.code}
                  onChange={(event) => {
                    const code = event.target.value;
                    setDisciplineForm((current) => ({
                      ...current,
                      code,
                    }));
                  }}
                  maxLength={24}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.semester')}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={disciplineForm.semester}
                  onChange={(event) => {
                    const semester = event.target.value;
                    setDisciplineForm((current) => ({
                      ...current,
                      semester,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm text-slate-600">
              <span>{t('electives.admin.fields.title')}</span>
              <input
                value={disciplineForm.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setDisciplineForm((current) => ({
                    ...current,
                    title,
                  }));
                }}
                maxLength={160}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <label className="space-y-1 text-sm text-slate-600">
              <span>{t('electives.admin.fields.description')}</span>
              <textarea
                value={disciplineForm.description}
                onChange={(event) => {
                  const description = event.target.value;
                  setDisciplineForm((current) => ({
                    ...current,
                    description,
                  }));
                }}
                rows={3}
                maxLength={2000}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.department')}</span>
                <select
                  value={disciplineForm.departmentId}
                  onChange={(event) => {
                    const departmentId = event.target.value;
                    setDisciplineForm((current) => ({
                      ...current,
                      departmentId,
                      teacherId: '',
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="">{t('electives.admin.selectDepartment')}</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name ?? department.id}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.teacher')}</span>
                <select
                  value={disciplineForm.teacherId}
                  onChange={(event) => {
                    const teacherId = event.target.value;
                    setDisciplineForm((current) => ({
                      ...current,
                      teacherId,
                    }));
                  }}
                  disabled={!disciplineForm.departmentId}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-slate-100"
                >
                  <option value="">{t('electives.admin.noTeacher')}</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {[teacher.lastName, teacher.firstName, teacher.middleName]
                        .filter(Boolean)
                        .join(' ')}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.credits')}</span>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={disciplineForm.credits}
                  onChange={(event) => {
                    const credits = event.target.value;
                    setDisciplineForm((current) => ({
                      ...current,
                      credits,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>

              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.capacity')}</span>
                <input
                  type="number"
                  min={1}
                  max={500}
                  value={disciplineForm.capacity}
                  onChange={(event) => {
                    const capacity = event.target.value;
                    setDisciplineForm((current) => ({
                      ...current,
                      capacity,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isWorking}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {editingDiscipline
                ? t('surveys.admin.update')
                : t('surveys.admin.create')}
            </button>
          </form>

          {canManagePeriods && (
            <form
              onSubmit={handlePeriodSubmit}
              className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
            >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-900">
                {editingPeriod
                  ? t('electives.admin.editPeriod')
                  : t('electives.admin.newPeriod')}
              </h2>
              {editingPeriod && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingPeriod(null);
                    setPeriodForm(initialPeriodForm());
                    setFormError('');
                  }}
                  className="text-sm font-medium text-slate-600 hover:text-slate-900"
                >
                  {t('surveys.admin.cancelEdit')}
                </button>
              )}
            </div>

            <label className="space-y-1 text-sm text-slate-600">
              <span>{t('electives.admin.fields.title')}</span>
              <input
                value={periodForm.title}
                onChange={(event) => {
                  const title = event.target.value;
                  setPeriodForm((current) => ({
                    ...current,
                    title,
                  }));
                }}
                maxLength={160}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.academicYear')}</span>
                <input
                  value={periodForm.academicYear}
                  onChange={(event) => {
                    const academicYear = event.target.value;
                    setPeriodForm((current) => ({
                      ...current,
                      academicYear,
                    }));
                  }}
                  maxLength={9}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.semester')}</span>
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={periodForm.semester}
                  onChange={(event) => {
                    const semester = event.target.value;
                    setPeriodForm((current) => ({
                      ...current,
                      semester,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.requiredChoices')}</span>
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={periodForm.requiredChoices}
                  onChange={(event) => {
                    const requiredChoices = event.target.value;
                    setPeriodForm((current) => ({
                      ...current,
                      requiredChoices,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.startsAt')}</span>
                <input
                  type="datetime-local"
                  value={periodForm.startsAt}
                  onChange={(event) => {
                    const startsAt = event.target.value;
                    setPeriodForm((current) => ({
                      ...current,
                      startsAt,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
              <label className="space-y-1 text-sm text-slate-600">
                <span>{t('electives.endsAt')}</span>
                <input
                  type="datetime-local"
                  value={periodForm.endsAt}
                  onChange={(event) => {
                    const endsAt = event.target.value;
                    setPeriodForm((current) => ({
                      ...current,
                      endsAt,
                    }));
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm text-slate-600">
              <span>{t('electives.groups')}</span>
              <select
                multiple
                value={periodForm.targetGroupIds}
                onChange={(event) => {
                  const targetGroupIds = Array.from(
                    event.currentTarget.selectedOptions,
                    (option) => option.value,
                  );
                  setPeriodForm((current) => ({
                    ...current,
                    targetGroupIds,
                  }));
                }}
                className="min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.code ?? group.name ?? group.id}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              disabled={isWorking}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {editingPeriod
                ? t('surveys.admin.update')
                : t('surveys.admin.create')}
            </button>
            </form>
          )}
        </div>

        <section className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Filter className="h-4 w-4" aria-hidden="true" />
              {t('surveys.admin.filters')}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <select
                value={disciplineFilters.status}
                onChange={(event) => {
                  const status = event.target
                    .value as ElectiveDisciplineStatus | '';
                  setDisciplineFilters((current) => ({
                    ...current,
                    status,
                  }));
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('surveys.admin.allStatuses')}</option>
                {Object.values(ElectiveDisciplineStatus).map((status) => (
                  <option key={status} value={status}>
                    {t(`electives.statuses.${status}`)}
                  </option>
                ))}
              </select>
              <select
                value={disciplineFilters.departmentId}
                onChange={(event) => {
                  const departmentId = event.target.value;
                  setDisciplineFilters((current) => ({
                    ...current,
                    departmentId,
                  }));
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('electives.admin.allDepartments')}</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name ?? department.id}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={12}
                placeholder={t('electives.semester')}
                value={disciplineFilters.semester}
                onChange={(event) => {
                  const semester = event.target.value
                    ? Number(event.target.value)
                    : '';
                  setDisciplineFilters((current) => ({
                    ...current,
                    semester,
                  }));
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {t('electives.admin.disciplines')}
            </h2>
            {disciplinesError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('electives.admin.loadError')}
              </div>
            )}
            {disciplinesLoading ? (
              <div className="flex justify-center rounded-lg border border-slate-200 bg-white py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : disciplines.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                {t('electives.admin.emptyDisciplines')}
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-2">
                {disciplines.map((discipline) => (
                  <article
                    key={discipline.id}
                    className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                              discipline.status,
                            )}`}
                          >
                            {t(`electives.statuses.${discipline.status}`)}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                            {discipline.code}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {discipline.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {discipline.department.name ?? discipline.department.id}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <button
                          type="button"
                          disabled={isWorking}
                          onClick={() => {
                            setEditingDiscipline(discipline);
                            setDisciplineForm(disciplineToForm(discipline));
                            setFormError('');
                          }}
                          className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          <SquarePen className="h-4 w-4" aria-hidden="true" />
                          {t('surveys.admin.edit')}
                        </button>
                        {discipline.status !== ElectiveDisciplineStatus.ACTIVE && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() =>
                              setDisciplineStatusMutation.mutate({
                                id: discipline.id,
                                status: ElectiveDisciplineStatus.ACTIVE,
                              })
                            }
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                          >
                            <PlayCircle
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            {t('electives.admin.activate')}
                          </button>
                        )}
                        {discipline.status !==
                          ElectiveDisciplineStatus.ARCHIVED && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() =>
                              setDisciplineStatusMutation.mutate({
                                id: discipline.id,
                                status: ElectiveDisciplineStatus.ARCHIVED,
                              })
                            }
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <Archive className="h-4 w-4" aria-hidden="true" />
                            {t('electives.admin.archive')}
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-3 grid gap-2 border-t border-slate-100 pt-3 sm:grid-cols-3">
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        {discipline.credits} {t('electives.credits')}
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        {discipline.semester} {t('electives.semesterShort')}
                      </div>
                      <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
                        {discipline.enrolledCount}/{discipline.capacity}{' '}
                        {t('electives.seats')}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          {canManagePeriods && (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 grid gap-3 md:grid-cols-2">
              <select
                value={periodFilters.status}
                onChange={(event) => {
                  const status = event.target.value as ElectivePeriodStatus | '';
                  setPeriodFilters((current) => ({
                    ...current,
                    status,
                  }));
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">{t('surveys.admin.allStatuses')}</option>
                {Object.values(ElectivePeriodStatus).map((status) => (
                  <option key={status} value={status}>
                    {t(`electives.statuses.${status}`)}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={12}
                placeholder={t('electives.semester')}
                value={periodFilters.semester}
                onChange={(event) => {
                  const semester = event.target.value
                    ? Number(event.target.value)
                    : '';
                  setPeriodFilters((current) => ({
                    ...current,
                    semester,
                  }));
                }}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <h2 className="text-lg font-semibold text-slate-900">
              {t('electives.admin.periods')}
            </h2>
            {periodsError && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {t('electives.admin.loadError')}
              </div>
            )}
            {periodsLoading ? (
              <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-white py-10">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              </div>
            ) : periods.length === 0 ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
                {t('electives.admin.emptyPeriods')}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {periods.map((period) => (
                  <article
                    key={period.id}
                    className="rounded-lg border border-slate-200 p-4"
                  >
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                              period.status,
                            )}`}
                          >
                            {t(`electives.statuses.${period.status}`)}
                          </span>
                          <span className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {period.academicYear}, {period.semester}{' '}
                            {t('electives.semesterShort')}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {period.title}
                        </h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {formatDate(period.startsAt)} -{' '}
                          {formatDate(period.endsAt)}
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          {period.targetGroups
                            .map((group) => group.code ?? group.id)
                            .join(', ')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        {period.status === ElectivePeriodStatus.DRAFT && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => {
                              setEditingPeriod(period);
                              setPeriodForm(periodToForm(period));
                              setFormError('');
                            }}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <FilePenLine
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            {t('surveys.admin.edit')}
                          </button>
                        )}
                        {period.status === ElectivePeriodStatus.DRAFT && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('electives.admin.confirmOpenPeriod'),
                                )
                              ) {
                                setPeriodStatusMutation.mutate({
                                  id: period.id,
                                  status: ElectivePeriodStatus.ACTIVE,
                                });
                              }
                            }}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                          >
                            <CheckCircle2
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            {t('electives.admin.openPeriod')}
                          </button>
                        )}
                        {period.status === ElectivePeriodStatus.ACTIVE && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('electives.admin.confirmClosePeriod'),
                                )
                              ) {
                                setPeriodStatusMutation.mutate({
                                  id: period.id,
                                  status: ElectivePeriodStatus.CLOSED,
                                });
                              }
                            }}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                          >
                            <XCircle className="h-4 w-4" aria-hidden="true" />
                            {t('surveys.admin.close')}
                          </button>
                        )}
                        {period.status === ElectivePeriodStatus.CLOSED && (
                          <button
                            type="button"
                            disabled={isWorking}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('electives.admin.confirmFinalizePeriod'),
                                )
                              ) {
                                finalizePeriodMutation.mutate(period.id);
                              }
                            }}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                          >
                            <CheckCircle2
                              className="h-4 w-4"
                              aria-hidden="true"
                            />
                            {t('electives.admin.finalizePeriod')}
                          </button>
                        )}
                        {(period.status === ElectivePeriodStatus.CLOSED ||
                          period.status === ElectivePeriodStatus.FINALIZED) && (
                          <>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                exportMutation.mutate({
                                  id: period.id,
                                  format: 'csv',
                                })
                              }
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Download
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {t('electives.admin.exportCsv')}
                            </button>
                            <button
                              type="button"
                              disabled={isWorking}
                              onClick={() =>
                                exportMutation.mutate({
                                  id: period.id,
                                  format: 'xlsx',
                                })
                              }
                              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <FileSpreadsheet
                                className="h-4 w-4"
                                aria-hidden="true"
                              />
                              {t('electives.admin.exportXlsx')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
