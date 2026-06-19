import {
  AlertTriangle,
  CalendarDays,
  BookOpenCheck,
  CheckCircle2,
  Download,
  Edit3,
  FileSpreadsheet,
  Filter,
  Repeat2,
  RotateCcw,
  Save,
  Trash2,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type SyntheticEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  ReferenceType,
  referencesApi,
  type ClassroomReference,
} from "../../services/referencesApi";
import {
  scheduleApi,
  type ScheduleQuery,
  type ScheduleSubstitutionInput,
} from "../../services/scheduleApi";
import { useAutoDismissState } from "../../hooks/useAutoDismissState";
import { useAuthStore } from "../../store/authStore";
import {
  Role,
  type CourseAssignment,
  type ScheduleEntry,
  type ScheduleEntryInput,
  type ScheduleEntryStatus,
  type ScheduleEntryType,
  type ScheduleTemplate,
  type ScheduleTemplateInput,
} from "../../types";
import { SpreadsheetExportFormat } from "../../utils/spreadsheetExport";

const TYPE_LABEL_KEYS: Record<ScheduleEntryType, string> = {
  lecture: "schedule.types.lecture",
  seminar: "schedule.types.seminar",
  lab: "schedule.types.lab",
  exam: "schedule.types.exam",
  consultation: "schedule.types.consultation",
};

const STATUS_LABEL_KEYS: Record<ScheduleEntryStatus, string> = {
  scheduled: "schedule.statuses.scheduled",
  cancelled: "schedule.statuses.cancelled",
  rescheduled: "schedule.statuses.rescheduled",
  substituted: "schedule.statuses.substituted",
};

const DEFAULT_ENTRY_FORM: ScheduleEntryInput = {
  courseAssignmentId: "",
  classroomId: "",
  date: todayIso(),
  startTime: "08:30",
  endTime: "10:05",
  type: "lecture",
  status: "scheduled",
  changeReason: "",
};

const DEFAULT_TEMPLATE_FORM: ScheduleTemplateInput = {
  title: "",
  courseAssignmentId: "",
  classroomId: "",
  dayOfWeek: 1,
  startTime: "08:30",
  endTime: "10:05",
  type: "lecture",
};

type WorkflowState =
  | {
      type: "cancel";
      entry: ScheduleEntry;
      reason: string;
    }
  | {
      type: "reschedule";
      entry: ScheduleEntry;
      reason: string;
      date: string;
      startTime: string;
      endTime: string;
      classroomId: string;
    }
  | {
      type: "substitution";
      entry: ScheduleEntry;
      reason: string;
      courseAssignmentId: string;
      classroomId: string;
      date: string;
      startTime: string;
      endTime: string;
      entryType: ScheduleEntryType;
    };

type ApplyTemplateState = {
  templateId: string;
  startDate: string;
  endDate: string;
  dryRun: boolean;
};

export default function SchedulePage() {
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const canManage = user?.role === Role.ADMIN;
  const canOpenJournal =
    user?.role === Role.TEACHER ||
    user?.role === Role.DEPARTMENT_HEAD ||
    user?.role === Role.DEAN ||
    user?.role === Role.ADMIN;
  const locale = i18n.language === "en" ? "en-US" : "uk-UA";
  const exportLocale = i18n.language === "en" ? "en" : "uk";

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [templates, setTemplates] = useState<ScheduleTemplate[]>([]);
  const [courseAssignments, setCourseAssignments] = useState<
    CourseAssignment[]
  >([]);
  const [classrooms, setClassrooms] = useState<ClassroomReference[]>([]);
  const [filters, setFilters] = useState<ScheduleQuery>({
    startDate: todayIso(),
    endDate: addDaysIso(14),
    status: "",
  });
  const [view, setView] = useState<"day" | "week">("week");
  const [entryForm, setEntryForm] =
    useState<ScheduleEntryInput>(DEFAULT_ENTRY_FORM);
  const [templateForm, setTemplateForm] = useState<ScheduleTemplateInput>(
    DEFAULT_TEMPLATE_FORM,
  );
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [workflow, setWorkflow] = useState<WorkflowState | null>(null);
  const [applyTemplate, setApplyTemplate] = useState<ApplyTemplateState | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkReason, setBulkReason] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useAutoDismissState("");
  const [error, setError] = useAutoDismissState("");

  const loadSchedule = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const data = canManage
        ? await scheduleApi.list(filters)
        : await scheduleApi.listMy(filters);
      setEntries(data);
    } catch {
      setError(t("schedule.errors.load"));
    } finally {
      setIsLoading(false);
    }
  }, [canManage, filters, setError, t]);

  const loadManagementData = useCallback(async () => {
    if (!canManage) {
      return;
    }

    try {
      const [assignments, rooms, scheduleTemplates] = await Promise.all([
        scheduleApi.listCourseAssignments(),
        referencesApi.listOptions<ClassroomReference>(ReferenceType.CLASSROOMS),
        scheduleApi.listTemplates(),
      ]);
      setCourseAssignments(assignments);
      setClassrooms(rooms);
      setTemplates(scheduleTemplates);
    } catch {
      setError(t("schedule.errors.managementLoad"));
    }
  }, [canManage, setError, t]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSchedule();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSchedule]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadManagementData();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadManagementData]);

  const visibleEntries = useMemo(() => {
    const today = todayIso();
    const filtered =
      view === "day"
        ? entries.filter((entry) => entry.date === today)
        : entries;

    return [...filtered].sort((a, b) =>
      `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
    );
  }, [entries, view]);

  const groupedByDate = useMemo(() => {
    return visibleEntries.reduce<Record<string, ScheduleEntry[]>>(
      (acc, entry) => {
        acc[entry.date] = [...(acc[entry.date] ?? []), entry];
        return acc;
      },
      {},
    );
  }, [visibleEntries]);

  const sortedDates = Object.keys(groupedByDate).sort();

  const handleFilterChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setFilters((current) => ({ ...current, [name]: value }));
  };

  const handleEntryChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setEntryForm((current) => ({ ...current, [name]: value }));
  };

  const handleTemplateChange = (
    event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = event.target;
    setTemplateForm((current) => ({
      ...current,
      [name]: name === "dayOfWeek" ? Number(value) : value,
    }));
  };

  const handleEntrySubmit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      if (editingEntryId) {
        await scheduleApi.update(
          editingEntryId,
          cleanSchedulePayload(entryForm),
        );
        setMessage(t("schedule.messages.updated"));
      } else {
        await scheduleApi.create(cleanSchedulePayload(entryForm));
        setMessage(t("schedule.messages.created"));
      }
      setEditingEntryId(null);
      setEntryForm(DEFAULT_ENTRY_FORM);
      await loadSchedule();
    } catch {
      setError(t("schedule.errors.save"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleTemplateSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = cleanTemplatePayload(templateForm);
      if (editingTemplateId) {
        await scheduleApi.updateTemplate(editingTemplateId, payload);
        setMessage(t("schedule.messages.templateUpdated"));
      } else {
        await scheduleApi.createTemplate(payload);
        setMessage(t("schedule.messages.templateCreated"));
      }
      setEditingTemplateId(null);
      setTemplateForm(DEFAULT_TEMPLATE_FORM);
      await loadManagementData();
    } catch {
      setError(t("schedule.errors.templateSave"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleWorkflowSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!workflow) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      if (workflow.type === "cancel") {
        await scheduleApi.cancel(workflow.entry.id, {
          reason: workflow.reason,
        });
      }
      if (workflow.type === "reschedule") {
        await scheduleApi.reschedule(workflow.entry.id, {
          reason: workflow.reason,
          date: workflow.date,
          startTime: workflow.startTime,
          endTime: workflow.endTime,
          classroomId: workflow.classroomId || undefined,
        });
      }
      if (workflow.type === "substitution") {
        const payload: ScheduleSubstitutionInput = {
          reason: workflow.reason,
          courseAssignmentId: workflow.courseAssignmentId || undefined,
          classroomId: workflow.classroomId || undefined,
          date: workflow.date || undefined,
          startTime: workflow.startTime || undefined,
          endTime: workflow.endTime || undefined,
          type: workflow.entryType,
        };
        await scheduleApi.substitute(workflow.entry.id, payload);
      }
      setWorkflow(null);
      setMessage(t("schedule.messages.workflowApplied"));
      await loadSchedule();
    } catch {
      setError(t("schedule.errors.workflow"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyTemplateSubmit = async (
    event: SyntheticEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!applyTemplate) {
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await scheduleApi.applyTemplate(applyTemplate.templateId, {
        startDate: applyTemplate.startDate,
        endDate: applyTemplate.endDate,
        dryRun: applyTemplate.dryRun,
        skipConflicts: true,
      });
      setApplyTemplate(null);
      setMessage(
        t("schedule.messages.templateApplied", {
          created: result.created ?? 0,
          skipped: result.skipped,
        }),
      );
      await Promise.all([loadSchedule(), loadManagementData()]);
    } catch {
      setError(t("schedule.errors.templateApply"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleBulkCancel = async () => {
    if (selectedIds.size === 0 || bulkReason.trim().length < 3) {
      setError(t("schedule.errors.bulkReason"));
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await scheduleApi.bulkCancel([...selectedIds], bulkReason);
      setSelectedIds(new Set());
      setBulkReason("");
      setMessage(
        t("schedule.messages.bulkCancelled", {
          count: result.cancelled ?? 0,
          skipped: result.skipped,
        }),
      );
      await loadSchedule();
    } catch {
      setError(t("schedule.errors.bulkCancel"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleExport = async (format: "csv" | "xlsx") => {
    setError("");
    try {
      await scheduleApi.export(filters, format, exportLocale);
    } catch {
      setError(t("schedule.errors.export"));
    }
  };

  const handleEditEntry = (entry: ScheduleEntry) => {
    setEditingEntryId(entry.id);
    setEntryForm({
      courseAssignmentId: entry.courseAssignmentId,
      classroomId: entry.classroomId ?? "",
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      status: entry.status,
      changeReason: entry.changeReason ?? "",
    });
  };

  const handleDeleteEntry = async (entry: ScheduleEntry) => {
    if (!window.confirm(t("schedule.confirmDelete"))) {
      return;
    }
    setIsSaving(true);
    try {
      await scheduleApi.remove(entry.id);
      setMessage(t("schedule.messages.deleted"));
      await loadSchedule();
    } catch {
      setError(t("schedule.errors.delete"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditTemplate = (template: ScheduleTemplate) => {
    setEditingTemplateId(template.id);
    setTemplateForm({
      title: template.title,
      courseAssignmentId: template.courseAssignmentId,
      classroomId: template.classroomId ?? "",
      dayOfWeek: template.dayOfWeek,
      startTime: template.startTime,
      endTime: template.endTime,
      type: template.type,
    });
  };

  const handleArchiveTemplate = async (template: ScheduleTemplate) => {
    if (!window.confirm(t("schedule.confirmTemplateArchive"))) {
      return;
    }

    setIsSaving(true);
    try {
      await scheduleApi.archiveTemplate(template.id);
      setMessage(t("schedule.messages.templateArchived"));
      await loadManagementData();
    } catch {
      setError(t("schedule.errors.templateArchive"));
    } finally {
      setIsSaving(false);
    }
  };

  const toggleEntrySelection = (entryId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(entryId)) {
        next.delete(entryId);
      } else {
        next.add(entryId);
      }
      return next;
    });
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    return date.toLocaleDateString(locale, {
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
            <CalendarDays size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {t("schedule.title")}
            </h1>
            <p className="text-sm text-gray-500">{t("schedule.subtitle")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedButton
            active={view === "day"}
            onClick={() => setView("day")}
          >
            {t("schedule.day")}
          </SegmentedButton>
          <SegmentedButton
            active={view === "week"}
            onClick={() => setView("week")}
          >
            {t("schedule.week")}
          </SegmentedButton>
          <IconButton onClick={() => handleExport(SpreadsheetExportFormat.CSV)}>
            <Download size={16} />
            CSV
          </IconButton>
          <IconButton
            onClick={() => handleExport(SpreadsheetExportFormat.XLSX)}
          >
            <FileSpreadsheet size={16} />
            XLSX
          </IconButton>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Filter size={16} />
          {t("schedule.filters")}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Input
            label={t("schedule.startDate")}
            name="startDate"
            type="date"
            value={filters.startDate ?? ""}
            onChange={handleFilterChange}
          />
          <Input
            label={t("schedule.endDate")}
            name="endDate"
            type="date"
            value={filters.endDate ?? ""}
            onChange={handleFilterChange}
          />
          <Select
            label={t("schedule.status")}
            name="status"
            value={filters.status ?? ""}
            onChange={handleFilterChange}
          >
            <option value="">{t("schedule.allStatuses")}</option>
            {Object.keys(STATUS_LABEL_KEYS).map((status) => (
              <option key={status} value={status}>
                {t(STATUS_LABEL_KEYS[status as ScheduleEntryStatus])}
              </option>
            ))}
          </Select>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void loadSchedule()}
              className="h-10 w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              {t("schedule.applyFilters")}
            </button>
          </div>
        </div>
      </section>

      {(message || error) && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {error || message}
        </div>
      )}

      {canManage && (
        <section className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-6">
            <ScheduleEntryForm
              assignments={courseAssignments}
              classrooms={classrooms}
              editing={Boolean(editingEntryId)}
              form={entryForm}
              isSaving={isSaving}
              onCancel={() => {
                setEditingEntryId(null);
                setEntryForm(DEFAULT_ENTRY_FORM);
              }}
              onChange={handleEntryChange}
              onSubmit={handleEntrySubmit}
              t={t}
            />
            <TemplateForm
              assignments={courseAssignments}
              classrooms={classrooms}
              editing={Boolean(editingTemplateId)}
              form={templateForm}
              isSaving={isSaving}
              onCancel={() => {
                setEditingTemplateId(null);
                setTemplateForm(DEFAULT_TEMPLATE_FORM);
              }}
              onChange={handleTemplateChange}
              onSubmit={handleTemplateSubmit}
              t={t}
            />
          </div>
          <TemplateList
            applyTemplate={applyTemplate}
            isSaving={isSaving}
            templates={templates}
            t={t}
            onApplyChange={setApplyTemplate}
            onApplySubmit={handleApplyTemplateSubmit}
            onArchive={handleArchiveTemplate}
            onEdit={handleEditTemplate}
          />
        </section>
      )}

      {canManage && selectedIds.size > 0 && (
        <section className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 md:flex-row md:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-sm font-medium text-amber-900">
              {t("schedule.bulkReason")}
            </label>
            <input
              value={bulkReason}
              onChange={(event) => setBulkReason(event.target.value)}
              className="h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm outline-none focus:border-amber-500"
              placeholder={t("schedule.reasonPlaceholder")}
            />
          </div>
          <button
            type="button"
            onClick={() => void handleBulkCancel()}
            disabled={isSaving}
            className="h-10 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("schedule.bulkCancel", { count: selectedIds.size })}
          </button>
        </section>
      )}

      {workflow && (
        <WorkflowPanel
          assignments={courseAssignments}
          classrooms={classrooms}
          isSaving={isSaving}
          state={workflow}
          t={t}
          onCancel={() => setWorkflow(null)}
          onChange={setWorkflow}
          onSubmit={handleWorkflowSubmit}
        />
      )}

      <section className="space-y-5">
        {isLoading ? (
          <EmptyState text={t("schedule.loading")} />
        ) : sortedDates.length === 0 ? (
          <EmptyState
            text={
              view === "day"
                ? t("schedule.noClassesToday")
                : t("schedule.notFound")
            }
          />
        ) : (
          sortedDates.map((date) => (
            <div key={date} className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-800">
                {formatDate(date)}
              </h2>
              <div className="space-y-3">
                {groupedByDate[date].map((entry) => (
                  <ScheduleEntryCard
                    key={entry.id}
                    canManage={canManage}
                    canOpenJournal={canOpenJournal}
                    checked={selectedIds.has(entry.id)}
                    entry={entry}
                    t={t}
                    onDelete={handleDeleteEntry}
                    onEdit={handleEditEntry}
                    onSelect={toggleEntrySelection}
                    onWorkflow={setWorkflow}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

function ScheduleEntryForm({
  assignments,
  classrooms,
  editing,
  form,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
  t,
}: {
  assignments: CourseAssignment[];
  classrooms: ClassroomReference[];
  editing: boolean;
  form: ScheduleEntryInput;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <FormTitle
        title={editing ? t("schedule.editEntry") : t("schedule.newEntry")}
      />
      <div className="space-y-3">
        <Select
          label={t("schedule.courseAssignment")}
          name="courseAssignmentId"
          value={form.courseAssignmentId}
          onChange={onChange}
          required
        >
          <option value="">{t("schedule.selectCourseAssignment")}</option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {formatAssignment(assignment)}
            </option>
          ))}
        </Select>
        <Select
          label={t("schedule.classroom")}
          name="classroomId"
          value={form.classroomId ?? ""}
          onChange={onChange}
        >
          <option value="">{t("schedule.onlineClassroom")}</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.building}, {classroom.roomNumber}
            </option>
          ))}
        </Select>
        <div className="grid gap-3 md:grid-cols-3">
          <Input
            label={t("schedule.date")}
            name="date"
            type="date"
            value={form.date}
            onChange={onChange}
            required
          />
          <Input
            label={t("schedule.startTime")}
            name="startTime"
            type="time"
            value={form.startTime}
            onChange={onChange}
            required
          />
          <Input
            label={t("schedule.endTime")}
            name="endTime"
            type="time"
            value={form.endTime}
            onChange={onChange}
            required
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <TypeSelect value={form.type} onChange={onChange} t={t} />
          <Select
            label={t("schedule.status")}
            name="status"
            value={form.status ?? "scheduled"}
            onChange={onChange}
          >
            {Object.keys(STATUS_LABEL_KEYS).map((status) => (
              <option key={status} value={status}>
                {t(STATUS_LABEL_KEYS[status as ScheduleEntryStatus])}
              </option>
            ))}
          </Select>
        </div>
        <Input
          label={t("schedule.changeReason")}
          name="changeReason"
          value={form.changeReason ?? ""}
          onChange={onChange}
          placeholder={t("schedule.reasonPlaceholder")}
        />
        <FormActions
          cancelLabel={t("common.cancel")}
          isSaving={isSaving}
          saveLabel={editing ? t("common.save") : t("schedule.create")}
          showCancel={editing}
          onCancel={onCancel}
        />
      </div>
    </form>
  );
}

function TemplateForm({
  assignments,
  classrooms,
  editing,
  form,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
  t,
}: {
  assignments: CourseAssignment[];
  classrooms: ClassroomReference[];
  editing: boolean;
  form: ScheduleTemplateInput;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
    >
      <FormTitle
        title={editing ? t("schedule.editTemplate") : t("schedule.newTemplate")}
      />
      <div className="space-y-3">
        <Input
          label={t("schedule.templateTitle")}
          name="title"
          value={form.title}
          onChange={onChange}
          required
        />
        <Select
          label={t("schedule.courseAssignment")}
          name="courseAssignmentId"
          value={form.courseAssignmentId}
          onChange={onChange}
          required
        >
          <option value="">{t("schedule.selectCourseAssignment")}</option>
          {assignments.map((assignment) => (
            <option key={assignment.id} value={assignment.id}>
              {formatAssignment(assignment)}
            </option>
          ))}
        </Select>
        <Select
          label={t("schedule.classroom")}
          name="classroomId"
          value={form.classroomId ?? ""}
          onChange={onChange}
        >
          <option value="">{t("schedule.onlineClassroom")}</option>
          {classrooms.map((classroom) => (
            <option key={classroom.id} value={classroom.id}>
              {classroom.building}, {classroom.roomNumber}
            </option>
          ))}
        </Select>
        <div className="grid gap-3 md:grid-cols-3">
          <Select
            label={t("schedule.dayOfWeek")}
            name="dayOfWeek"
            value={String(form.dayOfWeek)}
            onChange={onChange}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((day) => (
              <option key={day} value={day}>
                {t(`schedule.weekdays.${day}`)}
              </option>
            ))}
          </Select>
          <Input
            label={t("schedule.startTime")}
            name="startTime"
            type="time"
            value={form.startTime}
            onChange={onChange}
            required
          />
          <Input
            label={t("schedule.endTime")}
            name="endTime"
            type="time"
            value={form.endTime}
            onChange={onChange}
            required
          />
        </div>
        <TypeSelect value={form.type} onChange={onChange} t={t} />
        <FormActions
          cancelLabel={t("common.cancel")}
          isSaving={isSaving}
          saveLabel={editing ? t("common.save") : t("schedule.saveTemplate")}
          showCancel={editing}
          onCancel={onCancel}
        />
      </div>
    </form>
  );
}

function TemplateList({
  applyTemplate,
  isSaving,
  templates,
  onApplyChange,
  onApplySubmit,
  onArchive,
  onEdit,
  t,
}: {
  applyTemplate: ApplyTemplateState | null;
  isSaving: boolean;
  templates: ScheduleTemplate[];
  onApplyChange: (state: ApplyTemplateState | null) => void;
  onApplySubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onArchive: (template: ScheduleTemplate) => void;
  onEdit: (template: ScheduleTemplate) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <FormTitle title={t("schedule.templates")} />
      {templates.length === 0 ? (
        <EmptyState text={t("schedule.noTemplates")} />
      ) : (
        <div className="space-y-3">
          {templates.map((template) => (
            <div
              key={template.id}
              className="rounded-lg border border-gray-200 p-4"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-semibold text-gray-900">
                    {template.title}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {template.courseCode} {template.courseName} ·{" "}
                    {template.groupCode} · {template.startTime}-
                    {template.endTime}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <IconOnlyButton
                    label={t("schedule.applyTemplate")}
                    onClick={() =>
                      onApplyChange({
                        templateId: template.id,
                        startDate: todayIso(),
                        endDate: addDaysIso(30),
                        dryRun: false,
                      })
                    }
                  >
                    <Repeat2 size={16} />
                  </IconOnlyButton>
                  <IconOnlyButton
                    label={t("common.edit")}
                    onClick={() => onEdit(template)}
                  >
                    <Edit3 size={16} />
                  </IconOnlyButton>
                  <IconOnlyButton
                    danger
                    label={t("common.delete")}
                    onClick={() => onArchive(template)}
                  >
                    <Trash2 size={16} />
                  </IconOnlyButton>
                </div>
              </div>
              {applyTemplate?.templateId === template.id && (
                <form
                  onSubmit={onApplySubmit}
                  className="mt-4 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    label={t("schedule.startDate")}
                    name="startDate"
                    type="date"
                    value={applyTemplate.startDate}
                    onChange={(event) =>
                      onApplyChange({
                        ...applyTemplate,
                        startDate: event.target.value,
                      })
                    }
                    required
                  />
                  <Input
                    label={t("schedule.endDate")}
                    name="endDate"
                    type="date"
                    value={applyTemplate.endDate}
                    onChange={(event) =>
                      onApplyChange({
                        ...applyTemplate,
                        endDate: event.target.value,
                      })
                    }
                    required
                  />
                  <div className="flex items-end gap-2">
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                      {t("schedule.apply")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onApplyChange(null)}
                      className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {t("common.cancel")}
                    </button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkflowPanel({
  assignments,
  classrooms,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
  state,
  t,
}: {
  assignments: CourseAssignment[];
  classrooms: ClassroomReference[];
  isSaving: boolean;
  onCancel: () => void;
  onChange: (state: WorkflowState) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  state: WorkflowState;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const titleKey =
    state.type === "cancel"
      ? "schedule.cancelEntry"
      : state.type === "reschedule"
        ? "schedule.rescheduleEntry"
        : "schedule.substituteEntry";

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-xl border border-blue-200 bg-blue-50 p-5 shadow-sm"
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t(titleKey)}</h3>
          <p className="text-sm text-gray-600">
            {state.entry.courseName} · {state.entry.date}{" "}
            {state.entry.startTime}-{state.entry.endTime}
          </p>
        </div>
        <button type="button" onClick={onCancel} className="text-gray-500">
          <XCircle size={20} />
        </button>
      </div>
      <div className="grid gap-3 lg:grid-cols-4">
        <Input
          label={t("schedule.reason")}
          name="reason"
          value={state.reason}
          onChange={(event) =>
            onChange({ ...state, reason: event.target.value })
          }
          placeholder={t("schedule.reasonPlaceholder")}
          required
        />
        {state.type !== "cancel" && (
          <>
            <Input
              label={t("schedule.date")}
              name="date"
              type="date"
              value={state.date}
              onChange={(event) =>
                onChange({ ...state, date: event.target.value })
              }
              required={state.type === "reschedule"}
            />
            <Input
              label={t("schedule.startTime")}
              name="startTime"
              type="time"
              value={state.startTime}
              onChange={(event) =>
                onChange({ ...state, startTime: event.target.value })
              }
              required={state.type === "reschedule"}
            />
            <Input
              label={t("schedule.endTime")}
              name="endTime"
              type="time"
              value={state.endTime}
              onChange={(event) =>
                onChange({ ...state, endTime: event.target.value })
              }
              required={state.type === "reschedule"}
            />
            <Select
              label={t("schedule.classroom")}
              name="classroomId"
              value={state.classroomId}
              onChange={(event) =>
                onChange({ ...state, classroomId: event.target.value })
              }
            >
              <option value="">{t("schedule.onlineClassroom")}</option>
              {classrooms.map((classroom) => (
                <option key={classroom.id} value={classroom.id}>
                  {classroom.building}, {classroom.roomNumber}
                </option>
              ))}
            </Select>
          </>
        )}
        {state.type === "substitution" && (
          <>
            <Select
              label={t("schedule.courseAssignment")}
              name="courseAssignmentId"
              value={state.courseAssignmentId}
              onChange={(event) =>
                onChange({ ...state, courseAssignmentId: event.target.value })
              }
            >
              <option value="">{t("schedule.keepCourseAssignment")}</option>
              {assignments.map((assignment) => (
                <option key={assignment.id} value={assignment.id}>
                  {formatAssignment(assignment)}
                </option>
              ))}
            </Select>
            <TypeSelect
              value={state.entryType}
              onChange={(event) =>
                onChange({
                  ...state,
                  entryType: event.target.value as ScheduleEntryType,
                })
              }
              t={t}
            />
          </>
        )}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-white"
        >
          {t("common.cancel")}
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {t("schedule.apply")}
        </button>
      </div>
    </form>
  );
}

function ScheduleEntryCard({
  canManage,
  canOpenJournal,
  checked,
  entry,
  onDelete,
  onEdit,
  onSelect,
  onWorkflow,
  t,
}: {
  canManage: boolean;
  canOpenJournal: boolean;
  checked: boolean;
  entry: ScheduleEntry;
  onDelete: (entry: ScheduleEntry) => void;
  onEdit: (entry: ScheduleEntry) => void;
  onSelect: (entryId: string) => void;
  onWorkflow: (state: WorkflowState) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const cancelled = entry.status === "cancelled";

  return (
    <div
      className={`rounded-xl border bg-white p-4 shadow-sm ${
        cancelled ? "border-red-200 bg-red-50/40" : "border-gray-200"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="flex min-w-[110px] items-center gap-3">
          {canManage && (
            <input
              checked={checked}
              onChange={() => onSelect(entry.id)}
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-blue-600"
            />
          )}
          <div className="text-center">
            <div className="text-lg font-bold text-blue-700">
              {entry.startTime}
            </div>
            <div className="text-xs text-gray-500">{entry.endTime}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={entry.status} t={t} />
            <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-600">
              {t(TYPE_LABEL_KEYS[entry.type])}
            </span>
          </div>
          <h3 className="mt-2 text-lg font-semibold text-gray-900">
            {entry.courseName ?? entry.courseCode}
          </h3>
          <div className="mt-2 grid gap-2 text-sm text-gray-600 md:grid-cols-3">
            <span>
              {t("schedule.group")}: {entry.groupCode ?? "—"}
            </span>
            <span>
              {t("schedule.teacher")}: {entry.teacherName ?? "—"}
            </span>
            <span>
              {t("schedule.classroom")}: {entry.classroom ?? "—"}
            </span>
          </div>
          {entry.changeReason && (
            <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              <span>{entry.changeReason}</span>
            </div>
          )}
          {entry.changeHistory && entry.changeHistory.length > 0 && (
            <div className="mt-3 text-xs text-gray-500">
              {t("schedule.lastChange")}:{" "}
              {entry.changeHistory.at(-1)?.actorLogin ?? "system"} ·{" "}
              {entry.changeHistory.at(-1)?.changedAt
                ? new Date(
                    entry.changeHistory.at(-1)?.changedAt ?? "",
                  ).toLocaleString()
                : ""}
            </div>
          )}
        </div>
        {(canManage || canOpenJournal) && (
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {canOpenJournal && (
              <Link
                to={`/courses/${entry.courseAssignmentId}?tab=journal`}
                title={t("schedule.openJournal")}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 bg-blue-50 text-blue-700 transition hover:bg-blue-100"
              >
                <BookOpenCheck size={16} />
              </Link>
            )}
            {canManage && (
              <>
            <IconOnlyButton
              label={t("common.edit")}
              onClick={() => onEdit(entry)}
            >
              <Edit3 size={16} />
            </IconOnlyButton>
            <IconOnlyButton
              label={t("schedule.cancelEntry")}
              onClick={() => onWorkflow({ type: "cancel", entry, reason: "" })}
            >
              <XCircle size={16} />
            </IconOnlyButton>
            <IconOnlyButton
              label={t("schedule.rescheduleEntry")}
              onClick={() =>
                onWorkflow({
                  type: "reschedule",
                  entry,
                  reason: "",
                  date: entry.date,
                  startTime: entry.startTime,
                  endTime: entry.endTime,
                  classroomId: entry.classroomId ?? "",
                })
              }
            >
              <RotateCcw size={16} />
            </IconOnlyButton>
            <IconOnlyButton
              label={t("schedule.substituteEntry")}
              onClick={() =>
                onWorkflow({
                  type: "substitution",
                  entry,
                  reason: "",
                  courseAssignmentId: "",
                  classroomId: entry.classroomId ?? "",
                  date: entry.date,
                  startTime: entry.startTime,
                  endTime: entry.endTime,
                  entryType: entry.type,
                })
              }
            >
              <Repeat2 size={16} />
            </IconOnlyButton>
            <IconOnlyButton
              danger
              label={t("common.delete")}
              onClick={() => onDelete(entry)}
            >
              <Trash2 size={16} />
            </IconOnlyButton>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypeSelect({
  value,
  onChange,
  t,
}: {
  value: ScheduleEntryType;
  onChange: (event: ChangeEvent<HTMLSelectElement>) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  return (
    <Select
      label={t("schedule.type")}
      name="type"
      value={value}
      onChange={onChange}
    >
      {Object.keys(TYPE_LABEL_KEYS).map((type) => (
        <option key={type} value={type}>
          {t(TYPE_LABEL_KEYS[type as ScheduleEntryType])}
        </option>
      ))}
    </Select>
  );
}

function Input({
  label,
  ...props
}: {
  label: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      <input
        {...props}
        className="h-10 w-full rounded-lg border border-gray-300 px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function Select({
  children,
  label,
  ...props
}: {
  children: ReactNode;
  label: string;
} & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">
        {label}
      </span>
      <select
        {...props}
        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {children}
      </select>
    </label>
  );
}

function FormTitle({ title }: { title: string }) {
  return <h2 className="mb-4 text-lg font-semibold text-gray-900">{title}</h2>;
}

function FormActions({
  cancelLabel,
  isSaving,
  onCancel,
  saveLabel,
  showCancel,
}: {
  cancelLabel: string;
  isSaving: boolean;
  onCancel: () => void;
  saveLabel: string;
  showCancel: boolean;
}) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      {showCancel && (
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          {cancelLabel}
        </button>
      )}
      <button
        type="submit"
        disabled={isSaving}
        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Save size={16} />
        {saveLabel}
      </button>
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: ScheduleEntryStatus;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const className =
    status === "cancelled"
      ? "bg-red-50 text-red-700 border-red-100"
      : status === "rescheduled"
        ? "bg-amber-50 text-amber-700 border-amber-100"
        : status === "substituted"
          ? "bg-purple-50 text-purple-700 border-purple-100"
          : "bg-emerald-50 text-emerald-700 border-emerald-100";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${className}`}
    >
      <CheckCircle2 size={13} />
      {t(STATUS_LABEL_KEYS[status])}
    </span>
  );
}

function SegmentedButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-lg px-4 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
      }`}
    >
      {children}
    </button>
  );
}

function IconButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
    >
      {children}
    </button>
  );
}

function IconOnlyButton({
  children,
  danger,
  label,
  onClick,
}: {
  children: ReactNode;
  danger?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
        danger
          ? "border-red-200 text-red-600 hover:bg-red-50"
          : "border-gray-300 text-gray-600 hover:bg-gray-50"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function cleanSchedulePayload(payload: ScheduleEntryInput): ScheduleEntryInput {
  return {
    ...payload,
    classroomId: payload.classroomId || undefined,
    changeReason: payload.changeReason?.trim() || undefined,
  };
}

function cleanTemplatePayload(
  payload: ScheduleTemplateInput,
): ScheduleTemplateInput {
  return {
    ...payload,
    title: payload.title.trim(),
    classroomId: payload.classroomId || undefined,
  };
}

function formatAssignment(assignment: CourseAssignment): string {
  return [
    assignment.courseCode,
    assignment.courseName,
    assignment.groupCode,
    assignment.teacherName,
  ]
    .filter(Boolean)
    .join(" · ");
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
