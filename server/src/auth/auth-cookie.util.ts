import { Request } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_ACCESS_TOKEN_COOKIE_NAME = 'campus_access_token';
export const DEFAULT_REFRESH_TOKEN_COOKIE_NAME = 'campus_refresh_token';
export const DEFAULT_CSRF_TOKEN_COOKIE_NAME = 'campus_csrf_token';
export const DEFAULT_CSRF_BINDING_COOKIE_NAME = 'campus_csrf_binding';
export const DEFAULT_CSRF_TOKEN_HEADER_NAME = 'x-csrf-token';

type ConfigReader = {
  get<T = string>(propertyPath: string): T | undefined;
  getOrThrow<T = string>(propertyPath: string): T;
};

type SecretReadOptions = {
  requireExplicitInProduction?: boolean;
};

export function readCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName !== name) {
      continue;
    }

    const value = cookie.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

export function readConfiguredSecret(
  config: ConfigReader,
  key: string,
  fallbackKey: string,
  options: SecretReadOptions = {},
): string {
  const value = config.get<string>(key)?.trim();
  if (value) {
    return value;
  }

  if (
    options.requireExplicitInProduction &&
    config.get<string>('NODE_ENV') === 'production'
  ) {
    throw new Error(`${key} is not set`);
  }

  return config.getOrThrow<string>(fallbackKey);
}

export function createSignedCsrfBinding(): string {
  return randomBytes(32).toString('base64url');
}

export function createSignedCsrfToken(secret: string, binding: string): string {
  const nonce = randomBytes(32).toString('base64url');
  const signature = signCsrfNonce(nonce, binding, secret);

  return `${nonce}.${signature}`;
}

export function verifySignedCsrfToken(
  token: string,
  binding: string,
  secret: string,
): boolean {
  const [nonce, signature] = token.split('.');
  if (!nonce || !signature || !binding) {
    return false;
  }

  const expectedSignature = signCsrfNonce(nonce, binding, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

function signCsrfNonce(nonce: string, binding: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(`${nonce}.${binding}`)
    .digest('base64url');
}
