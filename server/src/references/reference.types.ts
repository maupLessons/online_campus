export enum ReferenceType {
  FACULTIES = 'faculties',
  DEPARTMENTS = 'departments',
  SPECIALTIES = 'specialties',
  GROUPS = 'groups',
  CLASSROOMS = 'classrooms',
}

export {
  SpreadsheetExportFormat as ReferenceExportFormat,
  SpreadsheetExportLocale as ReferenceExportLocale,
} from '../common/export';

export enum ReferenceImportMode {
  CREATE = 'create',
  UPSERT = 'upsert',
}

export type ReferenceImportError = {
  row: number;
  field?: string;
  message: string;
};

export type ReferenceImportResult = {
  dryRun: boolean;
  mode: ReferenceImportMode;
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  errors: ReferenceImportError[];
};
