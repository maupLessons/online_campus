import { Request } from 'express';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const DEFAULT_ACCESS_TOKEN_COOKIE_NAME = 'campus_access_token';
export const DEFAULT_REFRESH_TOKEN_COOKIE_NAME = 'campus_refresh_token';
export const DEFAULT_CSRF_TOKEN_COOKIE_NAME = 'campus_csrf_token';
export const DEFAULT_CSRF_TOKEN_HEADER_NAME = 'x-csrf-token';

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

export function createSignedCsrfToken(secret: string): string {
  const nonce = randomBytes(32).toString('base64url');
  const signature = signCsrfNonce(nonce, secret);

  return `${nonce}.${signature}`;
}

export function verifySignedCsrfToken(token: string, secret: string): boolean {
  const [nonce, signature] = token.split('.');
  if (!nonce || !signature) {
    return false;
  }

  const expectedSignature = signCsrfNonce(nonce, secret);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  return (
    provided.length === expected.length && timingSafeEqual(provided, expected)
  );
}

function signCsrfNonce(nonce: string, secret: string): string {
  return createHmac('sha256', secret).update(nonce).digest('base64url');
}
