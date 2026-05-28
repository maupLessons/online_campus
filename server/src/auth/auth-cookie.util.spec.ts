import { Request } from 'express';
import {
  createSignedCsrfToken,
  readCookie,
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
    const token = createSignedCsrfToken('secret');

    expect(verifySignedCsrfToken(token, 'secret')).toBe(true);
    expect(verifySignedCsrfToken(token, 'other-secret')).toBe(false);
    expect(verifySignedCsrfToken('malformed-token', 'secret')).toBe(false);
  });
});
