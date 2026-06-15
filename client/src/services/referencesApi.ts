import api from "./api";
import type { PaginatedResponse, Role, User } from "../types";
import {
  downloadBlob,
  type SpreadsheetExportFormat,
  type SpreadsheetExportLocale,
} from "../utils/spreadsheetExport";
import { fetchSpreadsheetExport } from "./spreadsheetExportApi";

export const ReferenceType = {
  FACULTIES: "faculties",
  DEPARTMENTS: "departments",
  SPECIALTIES: "specialties",
  GROUPS: "groups",
  CLASSROOMS: "classrooms",
} as const;

export type ReferenceType = (typeof ReferenceType)[keyof typeof ReferenceType];
export type ReferenceImportMode = "create" | "upsert";

export interface ReferenceUser {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
}

export interface FacultyReference {
  id: string;
  name: string;
  dean?: ReferenceUser;
}

export interface DepartmentReference {
  id: string;
  name: string;
  faculty: FacultyReference;
  head?: ReferenceUser;
}

export interface SpecialtyReference {
  id: string;
  code: string;
  name: string;
}

export interface GroupReference {
  id: string;
  code: string;
  specialty: SpecialtyReference;
  course: number;
  curator?: ReferenceUser;
}

export interface ClassroomReference {
  id: string;
  building: string;
  roomNumber: string;
  capacity: number;
  type: "lecture" | "lab" | "seminar" | "online";
}

export type ReferenceRecord =
  | FacultyReference
  | DepartmentReference
  | SpecialtyReference
  | GroupReference
  | ClassroomReference;

export type ReferencePayload = Record<
  string,
  string | number | null | undefined
>;

export interface ReferenceImportError {
  row: number;
  field?: string;
  message: string;
}

export interface ReferenceImportResult {
  dryRun: boolean;
  mode: ReferenceImportMode;
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  errors: ReferenceImportError[];
}

export const referencesApi = {
  async list(
    type: ReferenceType,
    params: { page: number; limit: number; search?: string },
  ) {
    const { data } = await api.get<PaginatedResponse<ReferenceRecord>>(
      `/references/catalog/${type}`,
      { params },
    );
    return data;
  },

  async create(type: ReferenceType, payload: ReferencePayload) {
    const { data } = await api.post<string>(`/references/${type}`, payload);
    return data;
  },

  async update(type: ReferenceType, id: string, payload: ReferencePayload) {
    const { data } = await api.put<string>(
      `/references/${type}/${id}`,
      payload,
    );
    return data;
  },

  async remove(type: ReferenceType, id: string) {
    await api.delete(`/references/${type}/${id}`);
  },

  async listOptions<T extends ReferenceRecord>(type: ReferenceType) {
    const { data } = await api.get<T[]>(`/references/${type}`);
    return data;
  },

  async listUsers(role: Role) {
    const { data } = await api.get<PaginatedResponse<User>>("/users", {
      params: { role, page: 1, limit: 100 },
    });
    return data.docs;
  },

  async import(
    type: ReferenceType,
    file: File,
    dryRun: boolean,
    mode: ReferenceImportMode,
  ) {
    const formData = new FormData();
    formData.append("file", file);
    const { data } = await api.post<ReferenceImportResult>(
      `/references/admin/${type}/import`,
      formData,
      {
        params: { dryRun, mode },
        headers: { "Content-Type": "multipart/form-data" },
      },
    );
    return data;
  },

  async export(
    type: ReferenceType,
    format: SpreadsheetExportFormat,
    locale: SpreadsheetExportLocale,
  ) {
    const blob = await fetchSpreadsheetExport(
      `/references/admin/${type}/export`,
      { params: { format, locale } },
    );
    downloadBlob(blob, `references-${type}.${format}`);
  },
};
