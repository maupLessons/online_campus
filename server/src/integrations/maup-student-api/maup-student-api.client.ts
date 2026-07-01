import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { setTimeout as delay } from 'node:timers/promises';
import { MaupStudentApiError } from './maup-student-api.error';
import {
  MaupCalendarOptions,
  MaupCircuitState,
  MaupReferenceEndpoint,
  MaupScheduleOptions,
  MaupStudentApiDiagnostics,
  MaupStudentScheduleLookup,
  MaupWireArray,
  MaupWireValue,
} from './maup-student-api.types';

export const MAUP_API_FETCH = Symbol('MAUP_API_FETCH');
export type MaupFetch = typeof fetch;

type RequestPayload = Record<string, string | number | null>;

@Injectable()
export class MaupStudentApiClient {
  private readonly enabled: boolean;
  private readonly baseUrl: URL;
  private readonly method: 'GET' | 'POST';
  private readonly username: string;
  private readonly password: string;
  private readonly timeoutMs: number;
  private readonly retryAttempts: number;
  private readonly circuitFailureThreshold: number;
  private readonly circuitResetTimeoutMs: number;
  private readonly maxResponseBytes: number;

  private requestCount = 0;
  private failureCount = 0;
  private consecutiveFailures = 0;
  private circuitOpenedAt?: number;
  private halfOpenRequestActive = false;
  private lastSuccessAt?: Date;
  private lastFailureAt?: Date;

  constructor(
    private readonly config: ConfigService,
    @Inject(MAUP_API_FETCH) private readonly fetchImpl: MaupFetch,
  ) {
    this.enabled = this.readBoolean('MAUP_API_ENABLED', false);
    this.baseUrl = new URL(
      this.config.get<string>('MAUP_API_BASE_URL') ||
        'https://disabled.invalid/api',
    );
    this.method =
      this.config.get<string>('MAUP_API_REQUEST_METHOD') === 'GET'
        ? 'GET'
        : 'POST';
    this.username = this.config.get<string>('MAUP_API_USERNAME') ?? '';
    this.password = this.config.get<string>('MAUP_API_PASSWORD') ?? '';
    this.timeoutMs = this.readNumber('MAUP_API_TIMEOUT_MS', 10_000);
    this.retryAttempts = this.readNumber('MAUP_API_RETRY_ATTEMPTS', 2);
    this.circuitFailureThreshold = this.readNumber(
      'MAUP_API_CIRCUIT_FAILURE_THRESHOLD',
      5,
    );
    this.circuitResetTimeoutMs = this.readNumber(
      'MAUP_API_CIRCUIT_RESET_TIMEOUT_MS',
      30_000,
    );
    this.maxResponseBytes = this.readNumber(
      'MAUP_API_MAX_RESPONSE_BYTES',
      5_000_000,
    );
  }

  getStudentInfo(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('studentinfo', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getSchedule(
    externalStudentId: string,
    options: MaupScheduleOptions = {},
  ): Promise<MaupWireArray> {
    return this.getScheduleByStudentLookup(
      { studentId: externalStudentId },
      options,
    );
  }

  getScheduleByStudentLookup(
    lookup: MaupStudentScheduleLookup,
    options: MaupScheduleOptions = {},
  ): Promise<MaupWireArray> {
    const studentId = optionalExternalId(lookup.studentId);
    const recordBookNumber = optionalExternalId(lookup.recordBookNumber);

    if (!studentId && !recordBookNumber) {
      throw new TypeError('studentId or recordBookNumber is required');
    }

    return this.requestArray('schedule', {
      student_id: studentId,
      nsb: studentId ? null : recordBookNumber,
      semestr: optionalInteger(options.semester),
      zes_schedule:
        options.examSession === undefined ? null : options.examSession ? 1 : 0,
      year_navch: optionalInteger(options.academicYear),
      year: optionalInteger(options.calendarYear),
    });
  }

  getBalance(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('saldo', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getPayments(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('payments', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getStudentOrders(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('studentorders', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getMarks(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('marks', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getStudyPlan(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('plan', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getCalendarGraph(options: MaupCalendarOptions): Promise<MaupWireArray> {
    if (!options.groupId && !options.studentId) {
      throw new TypeError('studentId or groupId is required');
    }
    return this.requestArray('calgraph', {
      student_id: optionalExternalId(options.studentId),
      group_id: optionalExternalId(options.groupId),
    });
  }

  getDiscounts(externalStudentId: string): Promise<MaupWireArray> {
    return this.requestArray('discounts', {
      student_id: requiredExternalId(externalStudentId),
    });
  }

  getReference(endpoint: MaupReferenceEndpoint): Promise<MaupWireArray> {
    return this.requestArray(endpoint, {});
  }

  getDiagnostics(): MaupStudentApiDiagnostics {
    return {
      enabled: this.enabled,
      circuitState: this.getCircuitState(),
      requestCount: this.requestCount,
      failureCount: this.failureCount,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccessAt: this.lastSuccessAt?.toISOString(),
      lastFailureAt: this.lastFailureAt?.toISOString(),
    };
  }

  private async requestArray(
    endpoint: string,
    payload: RequestPayload,
  ): Promise<MaupWireArray> {
    this.assertAvailable(endpoint);
    this.requestCount += 1;

    let lastError: MaupStudentApiError | undefined;
    for (let attempt = 0; attempt <= this.retryAttempts; attempt += 1) {
      try {
        const response = await this.executeRequest(endpoint, payload);
        if (!Array.isArray(response)) {
          throw new MaupStudentApiError({
            kind: 'invalid-response',
            endpoint,
          });
        }
        this.recordSuccess();
        return response;
      } catch (error: unknown) {
        lastError = this.normalizeError(error, endpoint);
        if (!lastError.retryable || attempt === this.retryAttempts) {
          break;
        }
        await delay(Math.min(250 * 2 ** attempt, 2_000));
      }
    }

    const finalError =
      lastError ??
      new MaupStudentApiError({ kind: 'upstream', endpoint, retryable: true });
    this.recordFailure(finalError);
    throw finalError;
  }

  private async executeRequest(
    endpoint: string,
    payload: RequestPayload,
  ): Promise<MaupWireValue> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    timer.unref();

    try {
      const url = new URL(
        `${this.baseUrl.pathname.replace(/\/$/, '')}/${endpoint}`,
        this.baseUrl.origin,
      );
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(
          `${this.username}:${this.password}`,
        ).toString('base64')}`,
      };
      const init: RequestInit = {
        method: this.method,
        headers,
        signal: controller.signal,
      };

      if (this.method === 'GET') {
        for (const [key, value] of Object.entries(payload)) {
          if (value !== null) {
            url.searchParams.set(key, String(value));
          }
        }
      } else {
        headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(payload);
      }

      const response = await this.fetchImpl(url, init);
      const declaredSize = Number(response.headers.get('content-length'));
      if (
        Number.isFinite(declaredSize) &&
        declaredSize > this.maxResponseBytes
      ) {
        throw new MaupStudentApiError({
          kind: 'invalid-response',
          endpoint,
          status: response.status,
        });
      }

      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > this.maxResponseBytes) {
        throw new MaupStudentApiError({
          kind: 'invalid-response',
          endpoint,
          status: response.status,
        });
      }

      if (!response.ok) {
        throw this.responseError(endpoint, response.status, text);
      }

      try {
        return JSON.parse(text) as MaupWireValue;
      } catch (error: unknown) {
        throw new MaupStudentApiError({
          kind: 'invalid-response',
          endpoint,
          status: response.status,
          cause: error,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private responseError(endpoint: string, status: number, body: string) {
    const externalCode = body.match(/\bE-\d{2}\b/)?.[0];
    const authentication = status === 401 || externalCode === 'E-02';
    const retryableExternalCode = ['E-03', 'E-99'].includes(externalCode ?? '');
    const retryableStatus = [429, 500, 502, 503, 504].includes(status);

    return new MaupStudentApiError({
      kind: authentication ? 'authentication' : 'upstream',
      endpoint,
      status,
      externalCode,
      retryable:
        !authentication &&
        retryableStatus &&
        (!externalCode || retryableExternalCode),
    });
  }

  private normalizeError(error: unknown, endpoint: string) {
    if (error instanceof MaupStudentApiError) {
      return error;
    }
    if (error instanceof Error && error.name === 'AbortError') {
      return new MaupStudentApiError({
        kind: 'timeout',
        endpoint,
        retryable: true,
        cause: error,
      });
    }
    return new MaupStudentApiError({
      kind: 'network',
      endpoint,
      retryable: true,
      cause: error,
    });
  }

  private assertAvailable(endpoint: string): void {
    if (!this.enabled) {
      throw new MaupStudentApiError({ kind: 'disabled', endpoint });
    }
    if (!this.username || !this.password) {
      throw new MaupStudentApiError({ kind: 'configuration', endpoint });
    }

    const state = this.getCircuitState();
    if (
      state === 'open' ||
      (state === 'half-open' && this.halfOpenRequestActive)
    ) {
      throw new MaupStudentApiError({ kind: 'circuit-open', endpoint });
    }
    if (state === 'half-open') {
      this.halfOpenRequestActive = true;
    }
  }

  private getCircuitState(): MaupCircuitState {
    if (!this.circuitOpenedAt) {
      return 'closed';
    }
    if (Date.now() - this.circuitOpenedAt >= this.circuitResetTimeoutMs) {
      return 'half-open';
    }
    return 'open';
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenedAt = undefined;
    this.halfOpenRequestActive = false;
    this.lastSuccessAt = new Date();
  }

  private recordFailure(error: MaupStudentApiError): void {
    this.failureCount += 1;
    this.lastFailureAt = new Date();
    this.halfOpenRequestActive = false;
    if (!error.retryable) {
      return;
    }
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.circuitFailureThreshold) {
      this.circuitOpenedAt = Date.now();
    }
  }

  private readBoolean(key: string, fallback: boolean): boolean {
    const value = this.config.get<string>(key);
    return value === undefined ? fallback : ['1', 'true'].includes(value);
  }

  private readNumber(key: string, fallback: number): number {
    const value = Number(this.config.get<string>(key));
    return Number.isFinite(value) && value >= 0 ? value : fallback;
  }
}

function requiredExternalId(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) {
    throw new TypeError('A valid external student id is required');
  }
  return normalized;
}

function optionalExternalId(value: string | undefined): string | null {
  return value === undefined ? null : requiredExternalId(value);
}

function optionalInteger(value: number | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('A non-negative integer is required');
  }
  return value;
}
