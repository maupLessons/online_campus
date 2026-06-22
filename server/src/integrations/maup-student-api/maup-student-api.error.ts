export type MaupStudentApiErrorKind =
  | 'disabled'
  | 'configuration'
  | 'circuit-open'
  | 'timeout'
  | 'network'
  | 'authentication'
  | 'upstream'
  | 'invalid-response';

interface MaupStudentApiErrorOptions {
  kind: MaupStudentApiErrorKind;
  endpoint: string;
  retryable?: boolean;
  status?: number;
  externalCode?: string;
  cause?: unknown;
}

export class MaupStudentApiError extends Error {
  readonly kind: MaupStudentApiErrorKind;
  readonly endpoint: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly externalCode?: string;

  constructor(options: MaupStudentApiErrorOptions) {
    const suffix = options.externalCode ? ` (${options.externalCode})` : '';
    super(`MAUP API ${options.kind} error for ${options.endpoint}${suffix}`, {
      cause: options.cause,
    });
    this.name = 'MaupStudentApiError';
    this.kind = options.kind;
    this.endpoint = options.endpoint;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.externalCode = options.externalCode;
  }
}
