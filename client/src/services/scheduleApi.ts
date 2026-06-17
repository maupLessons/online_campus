import api from "./api";
import type {
  CourseAssignment,
  PaginatedResponse,
  ScheduleBulkResult,
  ScheduleEntry,
  ScheduleEntryInput,
  ScheduleEntryStatus,
  ScheduleEntryType,
  ScheduleTemplate,
  ScheduleTemplateInput,
} from "../types";
import {
  downloadBlob,
  type SpreadsheetExportFormat,
  type SpreadsheetExportLocale,
} from "../utils/spreadsheetExport";
import { fetchSpreadsheetExport } from "./spreadsheetExportApi";

export type ScheduleQuery = {
  date?: string;
  startDate?: string;
  endDate?: string;
  groupId?: string;
  teacherId?: string;
  status?: ScheduleEntryStatus | "";
};

export type ScheduleWorkflowReason = {
  reason: string;
};

export type ScheduleRescheduleInput = ScheduleWorkflowReason & {
  date: string;
  startTime: string;
  endTime: string;
  classroomId?: string;
};

export type ScheduleSubstitutionInput = ScheduleWorkflowReason & {
  courseAssignmentId?: string;
  classroomId?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  type?: ScheduleEntryType;
};

export type ScheduleTemplateApplyInput = {
  startDate: string;
  endDate: string;
  dryRun?: boolean;
  skipConflicts?: boolean;
};

export const scheduleApi = {
  async list(params: ScheduleQuery = {}) {
    const { data } = await api.get<ScheduleEntry[]>("/schedule", {
      params: cleanParams(params),
    });
    return data;
  },

  async listMy(params: ScheduleQuery = {}) {
    const { data } = await api.get<ScheduleEntry[]>("/schedule/my", {
      params: cleanParams(params),
    });
    return data;
  },

  async create(payload: ScheduleEntryInput) {
    const { data } = await api.post<ScheduleEntry>("/schedule", payload);
    return data;
  },

  async update(id: string, payload: Partial<ScheduleEntryInput>) {
    const { data } = await api.put<ScheduleEntry>(`/schedule/${id}`, payload);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/schedule/${id}`);
  },

  async cancel(id: string, payload: ScheduleWorkflowReason) {
    const { data } = await api.post<ScheduleEntry>(
      `/schedule/${id}/cancel`,
      payload,
    );
    return data;
  },

  async reschedule(id: string, payload: ScheduleRescheduleInput) {
    const { data } = await api.post<ScheduleEntry>(
      `/schedule/${id}/reschedule`,
      payload,
    );
    return data;
  },

  async substitute(id: string, payload: ScheduleSubstitutionInput) {
    const { data } = await api.post<ScheduleEntry>(
      `/schedule/${id}/substitution`,
      payload,
    );
    return data;
  },

  async bulkCreate(payload: {
    entries: ScheduleEntryInput[];
    dryRun?: boolean;
    skipConflicts?: boolean;
  }) {
    const { data } = await api.post<ScheduleBulkResult>(
      "/schedule/bulk",
      payload,
    );
    return data;
  },

  async bulkCancel(ids: string[], reason: string) {
    const { data } = await api.post<ScheduleBulkResult>(
      "/schedule/bulk/cancel",
      { ids, reason },
    );
    return data;
  },

  async listTemplates() {
    const { data } = await api.get<ScheduleTemplate[]>("/schedule/templates");
    return data;
  },

  async createTemplate(payload: ScheduleTemplateInput) {
    const { data } = await api.post<ScheduleTemplate>(
      "/schedule/templates",
      payload,
    );
    return data;
  },

  async updateTemplate(id: string, payload: Partial<ScheduleTemplateInput>) {
    const { data } = await api.put<ScheduleTemplate>(
      `/schedule/templates/${id}`,
      payload,
    );
    return data;
  },

  async archiveTemplate(id: string) {
    await api.delete(`/schedule/templates/${id}`);
  },

  async applyTemplate(id: string, payload: ScheduleTemplateApplyInput) {
    const { data } = await api.post<ScheduleBulkResult>(
      `/schedule/templates/${id}/apply`,
      payload,
    );
    return data;
  },

  async listCourseAssignments() {
    const assignments: CourseAssignment[] = [];
    let page = 1;
    let hasNextPage = true;

    while (hasNextPage) {
      const { data } = await api.get<PaginatedResponse<CourseAssignment>>(
        "/courses/course-assignments",
        {
          params: { page, limit: 100 },
        },
      );

      assignments.push(...(data.docs ?? []));
      hasNextPage = Boolean(data.hasNextPage);
      page += 1;
    }

    return assignments;
  },

  async export(
    params: ScheduleQuery,
    format: SpreadsheetExportFormat,
    locale: SpreadsheetExportLocale,
  ) {
    const blob = await fetchSpreadsheetExport("/schedule/export", {
      params: cleanParams({ ...params, format, locale }),
    });
    downloadBlob(blob, `schedule.${format}`);
  },
};

function cleanParams<T extends Record<string, unknown>>(params: T): T {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== "" && value != null),
  ) as T;
}
