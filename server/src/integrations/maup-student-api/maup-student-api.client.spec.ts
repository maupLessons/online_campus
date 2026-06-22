import { ConfigService } from '@nestjs/config';
import { MaupFetch, MaupStudentApiClient } from './maup-student-api.client';
import { MaupStudentApiError } from './maup-student-api.error';

function createClient(
  fetchMock: jest.Mock,
  overrides: Record<string, string> = {},
): MaupStudentApiClient {
  const config = new ConfigService({
    MAUP_API_ENABLED: 'true',
    MAUP_API_BASE_URL: 'https://students-api.example.test/api',
    MAUP_API_REQUEST_METHOD: 'POST',
    MAUP_API_USERNAME: 'api-user',
    MAUP_API_PASSWORD: 'api-password',
    MAUP_API_TIMEOUT_MS: '1000',
    MAUP_API_RETRY_ATTEMPTS: '0',
    MAUP_API_CIRCUIT_FAILURE_THRESHOLD: '5',
    MAUP_API_CIRCUIT_RESET_TIMEOUT_MS: '30000',
    MAUP_API_MAX_RESPONSE_BYTES: '10000',
    ...overrides,
  });
  return new MaupStudentApiClient(config, fetchMock as MaupFetch);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('MaupStudentApiClient', () => {
  it('remains inert while the integration feature flag is disabled', async () => {
    const fetchMock = jest.fn();
    const client = createClient(fetchMock, { MAUP_API_ENABLED: 'false' });

    await expect(client.getStudentInfo('student-1')).rejects.toMatchObject({
      kind: 'disabled',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses backend-only Basic authentication and a student id payload', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse([]));
    const client = createClient(fetchMock);

    await expect(client.getStudentInfo(' student-1 ')).resolves.toEqual([]);

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(
      'https://students-api.example.test/api/studentinfo',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ student_id: 'student-1' }));
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from('api-user:api-password').toString('base64')}`,
    );
    expect(client.getDiagnostics()).toMatchObject({
      enabled: true,
      requestCount: 1,
      failureCount: 0,
      circuitState: 'closed',
    });
  });

  it('supports GET until the authenticated API method is confirmed', async () => {
    const fetchMock = jest.fn().mockResolvedValue(jsonResponse([]));
    const client = createClient(fetchMock, {
      MAUP_API_REQUEST_METHOD: 'GET',
    });

    await client.getMarks('student-2');

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(url.searchParams.get('student_id')).toBe('student-2');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('does not expose an upstream body or credentials in errors', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        new Response('E-02 student personal data', { status: 401 }),
      );
    const client = createClient(fetchMock);

    let error: unknown;
    try {
      await client.getBalance('student-3');
    } catch (caught: unknown) {
      error = caught;
    }

    expect(error).toBeInstanceOf(MaupStudentApiError);
    expect(error).toMatchObject({
      kind: 'authentication',
      externalCode: 'E-02',
      retryable: false,
    });
    expect((error as Error).message).not.toContain('personal data');
    expect((error as Error).message).not.toContain('api-password');
  });

  it('opens the circuit after repeated retryable upstream failures', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(new Response('E-03 database', { status: 500 }));
    const client = createClient(fetchMock, {
      MAUP_API_CIRCUIT_FAILURE_THRESHOLD: '1',
    });

    await expect(client.getPayments('student-4')).rejects.toMatchObject({
      externalCode: 'E-03',
      retryable: true,
    });
    await expect(client.getPayments('student-4')).rejects.toMatchObject({
      kind: 'circuit-open',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getDiagnostics()).toMatchObject({
      circuitState: 'open',
      requestCount: 1,
      failureCount: 1,
    });
  });

  it('rejects a non-array success response from the documented endpoints', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(jsonResponse({ student_id: 'student-5' }));
    const client = createClient(fetchMock);

    await expect(client.getStudentOrders('student-5')).rejects.toMatchObject({
      kind: 'invalid-response',
    });
  });

  it('does not provide wildcard, IPN, phone, or name search methods', () => {
    const client = createClient(jest.fn());
    const publicMethods = Object.getOwnPropertyNames(
      Object.getPrototypeOf(client) as object,
    );

    expect(publicMethods).not.toEqual(
      expect.arrayContaining([
        'searchByIpn',
        'searchByPhone',
        'searchByName',
        'searchStudents',
      ]),
    );
  });
});
