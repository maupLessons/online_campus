import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import {
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_CSRF_BINDING_COOKIE_NAME,
  DEFAULT_CSRF_TOKEN_COOKIE_NAME,
  DEFAULT_CSRF_TOKEN_HEADER_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  readCookie,
  readConfiguredSecret,
  verifySignedCsrfToken,
} from '../../auth/auth-cookie.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/auth/login',
  '/auth/refresh',
  '/auth/password-reset/request',
  '/auth/password-reset/confirm',
]);

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly accessCookieName: string;
  private readonly refreshCookieName: string;
  private readonly csrfCookieName: string;
  private readonly csrfBindingCookieName: string;
  private readonly csrfHeaderName: string;
  private readonly csrfSecret: string;

  constructor(configService: ConfigService) {
    this.accessCookieName =
      configService.get<string>('AUTH_ACCESS_COOKIE_NAME') ??
      DEFAULT_ACCESS_TOKEN_COOKIE_NAME;
    this.refreshCookieName =
      configService.get<string>('AUTH_REFRESH_COOKIE_NAME') ??
      DEFAULT_REFRESH_TOKEN_COOKIE_NAME;
    this.csrfCookieName =
      configService.get<string>('AUTH_CSRF_COOKIE_NAME') ??
      DEFAULT_CSRF_TOKEN_COOKIE_NAME;
    this.csrfBindingCookieName =
      configService.get<string>('AUTH_CSRF_BINDING_COOKIE_NAME') ??
      DEFAULT_CSRF_BINDING_COOKIE_NAME;
    this.csrfHeaderName = (
      configService.get<string>('AUTH_CSRF_HEADER_NAME') ??
      DEFAULT_CSRF_TOKEN_HEADER_NAME
    ).toLowerCase();
    this.csrfSecret = readConfiguredSecret(
      configService,
      'AUTH_CSRF_SECRET',
      'JWT_SECRET',
      { requireExplicitInProduction: true },
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    if (CSRF_EXEMPT_PATHS.has(req.path.replace(/^\/api/, ''))) {
      return true;
    }

    if (!this.hasCookieSession(req)) {
      return true;
    }

    const cookieToken = readCookie(req, this.csrfCookieName);
    const binding = readCookie(req, this.csrfBindingCookieName);
    const headerToken = this.getHeaderToken(req);

    if (
      !cookieToken ||
      !binding ||
      !headerToken ||
      cookieToken !== headerToken ||
      !verifySignedCsrfToken(cookieToken, binding, this.csrfSecret)
    ) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }

  private hasCookieSession(req: Request): boolean {
    return Boolean(
      readCookie(req, this.accessCookieName) ||
      readCookie(req, this.refreshCookieName),
    );
  }

  private getHeaderToken(req: Request): string | null {
    const value = req.headers[this.csrfHeaderName];
    if (Array.isArray(value)) {
      return value[0] ?? null;
    }

    return typeof value === 'string' ? value : null;
  }
}
