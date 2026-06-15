import api from "./api";
import { fetchSpreadsheetExport } from "./spreadsheetExportApi";
import type { SpreadsheetExportFormat } from "../utils/spreadsheetExport";
import {
  ElectiveDisciplineStatus,
  ElectivePeriodStatus,
  Role,
  type ActiveElectivePeriod,
  type CreateElectiveDisciplineInput,
  type CreateElectivePeriodInput,
  type ElectiveDiscipline,
  type ElectivePeriod,
  type ElectivePeriodFinalization,
  type ElectivePeriodResults,
  type ElectiveSelection,
  type ReferenceView,
  type User,
} from "../types";

const teacherRoles: Role[] = [
  Role.TEACHER,
  Role.DEPARTMENT_HEAD,
  Role.DEAN,
  Role.RECTOR,
  Role.PRESIDENT,
];

export type ElectiveDisciplineFilters = {
  status?: ElectiveDisciplineStatus | "";
  semester?: number | "";
  departmentId?: string;
};

export type ElectivePeriodFilters = {
  status?: ElectivePeriodStatus | "";
  semester?: number | "";
};

export type ElectiveExportFormat = SpreadsheetExportFormat;

function buildParams(
  filters?: Record<string, string | number | undefined | null>,
) {
  const params = new URLSearchParams();

  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });

  return params;
}

export const electivesApi = {
  listActive: async () => {
    const { data } = await api.get<ActiveElectivePeriod[]>("/electives/active");
    return data;
  },

  listMySelections: async () => {
    const { data } = await api.get<ElectiveSelection[]>("/electives/my");
    return data;
  },

  select: async (periodId: string, disciplineId: string) => {
    const { data } = await api.post<ElectiveSelection>(
      `/electives/periods/${periodId}/select`,
      { disciplineId },
    );
    return data;
  },

  cancelSelection: async (periodId: string, selectionId: string) => {
    const { data } = await api.delete<{ success: true }>(
      `/electives/periods/${periodId}/selections/${selectionId}`,
    );
    return data;
  },

  listDisciplines: async (filters?: ElectiveDisciplineFilters) => {
    const params = buildParams(filters);
    const { data } = await api.get<ElectiveDiscipline[]>(
      "/electives/disciplines",
      { params },
    );
    return data;
  },

  createDiscipline: async (payload: CreateElectiveDisciplineInput) => {
    const { data } = await api.post<ElectiveDiscipline>(
      "/electives/disciplines",
      payload,
    );
    return data;
  },

  updateDiscipline: async (
    id: string,
    payload: Partial<CreateElectiveDisciplineInput>,
  ) => {
    const { data } = await api.put<ElectiveDiscipline>(
      `/electives/disciplines/${id}`,
      payload,
    );
    return data;
  },

  setDisciplineStatus: async (id: string, status: ElectiveDisciplineStatus) => {
    const { data } = await api.patch<ElectiveDiscipline>(
      `/electives/disciplines/${id}/status`,
      { status },
    );
    return data;
  },

  listPeriods: async (filters?: ElectivePeriodFilters) => {
    const params = buildParams(filters);
    const { data } = await api.get<ElectivePeriod[]>("/electives/periods", {
      params,
    });
    return data;
  },

  createPeriod: async (payload: CreateElectivePeriodInput) => {
    const { data } = await api.post<ElectivePeriod>(
      "/electives/periods",
      payload,
    );
    return data;
  },

  updatePeriod: async (
    id: string,
    payload: Partial<CreateElectivePeriodInput>,
  ) => {
    const { data } = await api.put<ElectivePeriod>(
      `/electives/periods/${id}`,
      payload,
    );
    return data;
  },

  setPeriodStatus: async (id: string, status: ElectivePeriodStatus) => {
    const { data } = await api.patch<ElectivePeriod>(
      `/electives/periods/${id}/status`,
      { status },
    );
    return data;
  },

  finalizePeriod: async (id: string) => {
    const { data } = await api.post<ElectivePeriodFinalization>(
      `/electives/periods/${id}/finalize`,
      {},
    );
    return data;
  },

  getPeriodResults: async (id: string) => {
    const { data } = await api.get<ElectivePeriodResults>(
      `/electives/periods/${id}/results`,
    );
    return data;
  },

  exportPeriodResults: async (id: string, format: ElectiveExportFormat) => {
    return fetchSpreadsheetExport(`/electives/periods/${id}/results/export`, {
      params: { format },
    });
  },
};

export const electiveReferencesApi = {
  listDepartments: async () => {
    const { data } = await api.get<ReferenceView[]>("/references/departments");
    return data;
  },

  listGroups: async () => {
    const { data } = await api.get<ReferenceView[]>("/references/groups");
    return data;
  },

  listTeachersByDepartment: async (departmentId: string) => {
    const { data } = await api.get<User[]>(`/users/department/${departmentId}`);
    return data.filter((user) => teacherRoles.includes(user.role));
  },
};
