export const MAUP_REFERENCE_ENDPOINTS = [
  'groups',
  'institutes',
  'pairkind',
  'paytype',
  'payperiod',
  'orderoperation',
  'formlearn',
  'levellearn',
  'scheduleauditorium',
  'scheduleprepod',
  'marktypes',
  'testtypes',
  'subjkinds',
  'pairkinds',
  'chairs',
  'chairsubjects',
] as const;

export type MaupReferenceEndpoint = (typeof MAUP_REFERENCE_ENDPOINTS)[number];

export type MaupWireScalar = string | number | boolean | null;

export type MaupWireValue = MaupWireScalar | MaupWireObject | MaupWireValue[];

export interface MaupWireObject {
  readonly [key: string]: MaupWireValue;
}

export type MaupWireArray = readonly MaupWireValue[];

export interface MaupScheduleOptions {
  semester?: number;
  examSession?: boolean;
  academicYear?: number;
  calendarYear?: number;
}

export interface MaupStudentScheduleLookup {
  studentId?: string;
  recordBookNumber?: string;
}

export interface MaupCalendarOptions {
  studentId?: string;
  groupId?: string;
}

export type MaupCircuitState = 'closed' | 'open' | 'half-open';

export interface MaupStudentApiDiagnostics {
  enabled: boolean;
  circuitState: MaupCircuitState;
  requestCount: number;
  failureCount: number;
  consecutiveFailures: number;
  lastSuccessAt?: string;
  lastFailureAt?: string;
}

export interface MaupStudentProfile {
  externalStudentId: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  recordBookNumber?: string;
  group?: { externalId?: string; name?: string };
  institute?: { externalId?: string; name?: string };
  course?: number;
  studyForm?: { externalId?: string; name?: string };
  studyLevel?: { externalId?: string; name?: string };
  speciality?: string;
  specialization?: string;
  qualification?: string;
  educationStart?: string;
  educationEnd?: string;
}
