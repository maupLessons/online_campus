import { MaupFetch } from '../maup-student-api.client';
import {
  MAUP_REFERENCE_ENDPOINTS,
  MaupWireArray,
  MaupWireObject,
} from '../maup-student-api.types';
import { MAUP_SCHEDULE_CONTRACT_FIXTURE } from '../fixtures/maup-schedule.contract-fixture';
import { MAUP_MOCK_SCHEDULE_SESSION } from '../fixtures/maup-schedule-session.mock-fixture';
import { MAUP_MOCK_STUDENTINFO } from '../fixtures/maup-studentinfo.mock-fixture';
import { MAUP_MOCK_MARKS } from '../fixtures/maup-marks.mock-fixture';
import {
  MAUP_MOCK_PAYMENTS,
  MAUP_MOCK_SALDO,
} from '../fixtures/maup-finance.mock-fixture';
import { MAUP_MOCK_REFERENCES } from '../fixtures/maup-references.mock-fixture';
import {
  MAUP_MOCK_STUDENT_BY_IPN,
  MAUP_MOCK_STUDENT_BY_NSB,
} from './maup-mock.students';

type Payload = Record<string, unknown>;

const STUDENT_SCOPED: Readonly<Record<string, MaupWireArray>> = {
  studentinfo: MAUP_MOCK_STUDENTINFO,
  schedule: [...MAUP_SCHEDULE_CONTRACT_FIXTURE, ...MAUP_MOCK_SCHEDULE_SESSION],
  marks: MAUP_MOCK_MARKS,
  saldo: MAUP_MOCK_SALDO,
  payments: MAUP_MOCK_PAYMENTS,
};

// The shared schedule contract fixture is read by the mapper contract test and
// must not be edited, so its synthetic student maps onto a demo student here.
const SCHEDULE_STUDENT_ALIASES: Readonly<Record<string, string>> = {
  'student-001': 'seed-1001',
};

const KNOWN_REFERENCE_ENDPOINTS = new Set<string>(MAUP_REFERENCE_ENDPOINTS);

type MaupFetchInput = Parameters<MaupFetch>[0];
type MaupFetchInit = Parameters<MaupFetch>[1];

function requestUrl(input: MaupFetchInput): URL {
  if (input instanceof URL) {
    return input;
  }
  return new URL(typeof input === 'string' ? input : input.url);
}

function readPayload(url: URL, init: MaupFetchInit): Payload {
  if (typeof init?.body === 'string' && init.body.length > 0) {
    try {
      return JSON.parse(init.body) as Payload;
    } catch {
      return {};
    }
  }
  const payload: Payload = {};
  url.searchParams.forEach((value, key) => {
    payload[key] = value;
  });
  return payload;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

// Contract order: student_id, then nsb, then ipn.
function resolveStudentId(payload: Payload): string | null {
  const byId = asString(payload.student_id);
  if (byId) {
    return byId;
  }
  const nsb = asString(payload.nsb);
  if (nsb) {
    return MAUP_MOCK_STUDENT_BY_NSB[nsb] ?? null;
  }
  const ipn = asString(payload.ipn);
  if (ipn) {
    return MAUP_MOCK_STUDENT_BY_IPN[ipn] ?? null;
  }
  return null;
}

function json(body: MaupWireArray, status = 200): Response {
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': String(Buffer.byteLength(text, 'utf8')),
    },
  });
}

// Narrow before String() so `no-base-to-string` doesn't flag stringifying an
// `unknown`/`MaupWireValue` that could (in principle) be an object or array.
function toFlagString(value: unknown): string {
  return typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
    ? String(value)
    : '';
}

function filterSchedule(rows: MaupWireArray, payload: Payload): MaupWireArray {
  const examSession = payload.zes_schedule;
  if (examSession === undefined || examSession === null) {
    return rows;
  }
  const wantsSession = toFlagString(examSession) === '1';
  return rows.filter((row) => {
    const value = (row as MaupWireObject).zes_schedule;
    return (toFlagString(value) === '1') === wantsSession;
  });
}

export function createMaupMockFetch(): MaupFetch {
  return (input: MaupFetchInput, init?: MaupFetchInit): Promise<Response> => {
    const url = requestUrl(input);
    const endpoint = url.pathname.split('/').filter(Boolean).pop() ?? '';
    const payload = readPayload(url, init);

    const reference = MAUP_MOCK_REFERENCES[endpoint];
    if (reference) {
      return Promise.resolve(json(reference));
    }
    if (KNOWN_REFERENCE_ENDPOINTS.has(endpoint)) {
      return Promise.resolve(json([]));
    }

    const scoped = STUDENT_SCOPED[endpoint];
    if (!scoped) {
      return Promise.resolve(json([], 404));
    }

    const studentId = resolveStudentId(payload);
    if (!studentId) {
      return Promise.resolve(json([]));
    }

    const rows = scoped.filter((row) => {
      const rowStudentId = (row as MaupWireObject).student_id;
      if (endpoint === 'schedule') {
        const resolvedRowId =
          typeof rowStudentId === 'string'
            ? (SCHEDULE_STUDENT_ALIASES[rowStudentId] ?? rowStudentId)
            : rowStudentId;
        return resolvedRowId === studentId;
      }
      return rowStudentId === studentId;
    });
    if (endpoint === 'schedule') {
      return Promise.resolve(json(filterSchedule(rows, payload)));
    }
    return Promise.resolve(json(rows));
  };
}
