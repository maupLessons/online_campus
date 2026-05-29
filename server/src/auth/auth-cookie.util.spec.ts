import { Request } from 'express';
import {
  createSignedCsrfBinding,
  createSignedCsrfToken,
  readCookie,
  readConfiguredSecret,
  verifySignedCsrfToken,
} from './auth-cookie.util';

describe('auth-cookie utilities', () => {
  it('reads encoded cookies by name', () => {
    const req = {
      headers: {
        cookie: 'first=value; session=hello%20world; empty=',
      },
    } as Request;

    expect(readCookie(req, 'session')).toBe('hello world');
    expect(readCookie(req, 'missing')).toBeNull();
  });

  it('creates and verifies signed CSRF tokens', () => {
    const binding = createSignedCsrfBinding();
    const token = createSignedCsrfToken('secret', binding);

    expect(verifySignedCsrfToken(token, binding, 'secret')).toBe(true);
    expect(verifySignedCsrfToken(token, 'other-binding', 'secret')).toBe(false);
    expect(verifySignedCsrfToken(token, binding, 'other-secret')).toBe(false);
    expect(verifySignedCsrfToken('malformed-token', binding, 'secret')).toBe(
      false,
    );
  });

  it('requires an explicit secondary secret in production when requested', () => {
    const env: Record<string, string> = {
      NODE_ENV: 'production',
      JWT_SECRET: 'jwt-secret',
    };
    const config = {
      get: <T = string>(key: string) => env[key] as T | undefined,
      getOrThrow: <T = string>(key: string) => {
        const value = config.get(key);
        if (!value) {
          throw new Error(`${key} is not set`);
        }

        return value as T;
      },
    };

    expect(() =>
      readConfiguredSecret(config, 'AUTH_CSRF_SECRET', 'JWT_SECRET', {
        requireExplicitInProduction: true,
      }),
    ).toThrow('AUTH_CSRF_SECRET is not set');
  });
});
