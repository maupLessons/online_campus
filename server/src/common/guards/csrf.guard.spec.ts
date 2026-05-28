import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { createSignedCsrfToken } from '../../auth/auth-cookie.util';
import { CsrfGuard } from './csrf.guard';

const JWT_SECRET = 'test-secret';

function createGuard() {
  return new CsrfGuard(new ConfigService({ JWT_SECRET }));
}

function createContext(req: Partial<Request>) {
  return {
    switchToHttp: () => ({
      getRequest: () => req,
    }),
  } as ExecutionContext;
}

describe('CsrfGuard', () => {
  it('allows safe requests', () => {
    const guard = createGuard();
    const context = createContext({ method: 'GET', path: '/api/users' });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows public unsafe requests without auth cookies', () => {
    const guard = createGuard();
    const context = createContext({
      method: 'POST',
      path: '/api/auth/login',
      headers: {},
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows unsafe cookie-session requests with a valid CSRF token', () => {
    const guard = createGuard();
    const csrfToken = createSignedCsrfToken(JWT_SECRET);
    const context = createContext({
      method: 'PATCH',
      path: '/api/users/1',
      headers: {
        cookie: `campus_access_token=access; campus_csrf_token=${csrfToken}`,
        'x-csrf-token': csrfToken,
      },
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects unsafe cookie-session requests without a matching CSRF header', () => {
    const guard = createGuard();
    const csrfToken = createSignedCsrfToken(JWT_SECRET);
    const context = createContext({
      method: 'POST',
      path: '/api/users',
      headers: {
        cookie: `campus_access_token=access; campus_csrf_token=${csrfToken}`,
      },
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('keeps refresh and logout available for session recovery', () => {
    const guard = createGuard();

    for (const path of ['/api/auth/refresh', '/api/auth/logout']) {
      const context = createContext({
        method: 'POST',
        path,
        headers: { cookie: 'campus_refresh_token=refresh' },
      });

      expect(guard.canActivate(context)).toBe(true);
    }
  });
});
