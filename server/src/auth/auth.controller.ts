import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Req,
  Res,
  HttpCode,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { RequestWithId } from '../common/middleware/request-id.middleware';
import { Response, CookieOptions } from 'express';
import {
  createSignedCsrfBinding,
  createSignedCsrfToken,
  DEFAULT_ACCESS_TOKEN_COOKIE_NAME,
  DEFAULT_CSRF_BINDING_COOKIE_NAME,
  DEFAULT_CSRF_TOKEN_COOKIE_NAME,
  DEFAULT_REFRESH_TOKEN_COOKIE_NAME,
  readCookie,
  readConfiguredSecret,
} from './auth-cookie.util';
import { AuditEvent } from '../audit-log/audit.decorator';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { markDomainAuditRecorded } from '../audit-log/audit-context';

interface RequestWithUser extends RequestWithId {
  user: { sub: string; login: string; role?: string };
}

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  user?: unknown;
};

const DEFAULT_ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const DEFAULT_REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DURATION_UNITS_IN_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

function durationToMs(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }

  const match = /^(\d+)\s*(ms|s|m|h|d)$/i.exec(trimmed);
  if (!match) {
    return fallback;
  }

  return Number(match[1]) * DURATION_UNITS_IN_MS[match[2].toLowerCase()];
}

function readBooleanFlag(value: string | undefined, fallback: boolean) {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

function readSameSite(value: string | undefined): CookieOptions['sameSite'] {
  const normalized = value?.toLowerCase();
  if (normalized === 'lax' || normalized === 'none') {
    return normalized;
  }

  return 'strict';
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly accessCookieName: string;
  private readonly refreshCookieName: string;
  private readonly csrfCookieName: string;
  private readonly csrfBindingCookieName: string;
  private readonly accessCookiePath: string;
  private readonly refreshCookiePath: string;
  private readonly csrfCookiePath: string;
  private readonly csrfBindingCookiePath: string;
  private readonly cookieSecure: boolean;
  private readonly cookieSameSite: CookieOptions['sameSite'];
  private readonly accessTokenMaxAgeMs: number;
  private readonly refreshTokenMaxAgeMs: number;
  private readonly csrfSecret: string;

  constructor(
    private readonly authService: AuthService,
    configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {
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
    this.accessCookiePath =
      configService.get<string>('AUTH_ACCESS_COOKIE_PATH') ?? '/api';
    this.refreshCookiePath =
      configService.get<string>('AUTH_REFRESH_COOKIE_PATH') ?? '/api/auth';
    this.csrfCookiePath =
      configService.get<string>('AUTH_CSRF_COOKIE_PATH') ?? '/';
    this.csrfBindingCookiePath =
      configService.get<string>('AUTH_CSRF_BINDING_COOKIE_PATH') ?? '/api';
    this.cookieSameSite = readSameSite(
      configService.get<string>('AUTH_COOKIE_SAMESITE'),
    );
    this.cookieSecure =
      this.cookieSameSite === 'none' ||
      readBooleanFlag(
        configService.get<string>('AUTH_COOKIE_SECURE'),
        configService.get<string>('NODE_ENV') === 'production',
      );
    this.accessTokenMaxAgeMs = durationToMs(
      configService.get<string>('JWT_EXPIRES_IN'),
      DEFAULT_ACCESS_TOKEN_MAX_AGE_MS,
    );
    this.refreshTokenMaxAgeMs = durationToMs(
      configService.get<string>('JWT_REFRESH_EXPIRES_IN'),
      DEFAULT_REFRESH_TOKEN_MAX_AGE_MS,
    );
    this.csrfSecret = readConfiguredSecret(
      configService,
      'AUTH_CSRF_SECRET',
      'JWT_SECRET',
      { requireExplicitInProduction: true },
    );
  }

  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @Post('login')
  @AuditEvent(AUDIT_ACTIONS.AUTH_LOGIN, 'auth')
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 201, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Невірний логін або пароль' })
  @ApiResponse({ status: 403, description: 'Обліковий запис заблоковано' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  async login(
    @Body() body: LoginDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ) {
    markDomainAuditRecorded(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const auth = await this.authService.login(
      body.login,
      body.password,
      ip,
      userAgent,
      req.requestId,
    );
    this.setAuthCookies(res, auth);
    return { user: auth.user };
  }

  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('password-reset/request')
  @AuditEvent(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_REQUEST, 'auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request password reset token' })
  @ApiBody({ type: RequestPasswordResetDto })
  @ApiResponse({
    status: 200,
    description: 'Generic password reset instructions response',
  })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  requestPasswordReset(
    @Body() body: RequestPasswordResetDto,
    @Req() req: RequestWithId,
  ) {
    markDomainAuditRecorded(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    return this.authService.requestPasswordReset(
      body,
      ip,
      userAgent,
      req.requestId,
    );
  }

  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('password-reset/confirm')
  @AuditEvent(AUDIT_ACTIONS.AUTH_PASSWORD_RESET_CONFIRM, 'auth')
  @HttpCode(200)
  @ApiOperation({ summary: 'Confirm password reset with token' })
  @ApiBody({ type: ConfirmPasswordResetDto })
  @ApiResponse({ status: 200, description: 'Password reset completed' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  confirmPasswordReset(
    @Body() body: ConfirmPasswordResetDto,
    @Req() req: RequestWithId,
  ) {
    markDomainAuditRecorded(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    return this.authService.confirmPasswordReset(
      body,
      ip,
      userAgent,
      req.requestId,
    );
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('refresh')
  @AuditEvent(AUDIT_ACTIONS.AUTH_REFRESH, 'auth')
  @ApiOperation({ summary: 'Refresh JWT token' })
  @ApiBody({ type: RefreshDto })
  @ApiResponse({ status: 200, description: 'Session cookies refreshed' })
  @ApiResponse({ status: 401, description: 'Невірний refresh token' })
  async refresh(
    @Body() body: RefreshDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ) {
    markDomainAuditRecorded(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const refreshToken = this.getRefreshToken(req, body.refreshToken);

    if (!refreshToken) {
      await this.logControllerAuthEvent(req, 'auth.refresh', 'failure', {
        reason: 'missing_refresh_token',
      });
      this.clearAuthCookies(res);
      throw new UnauthorizedException('Невірний refresh token');
    }

    try {
      const auth = await this.authService.refresh(
        refreshToken,
        ip,
        userAgent,
        req.requestId,
      );
      this.setAuthCookies(res, auth);
      return { success: true };
    } catch (error) {
      this.clearAuthCookies(res);
      throw error;
    }
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('logout')
  @AuditEvent(AUDIT_ACTIONS.AUTH_LOGOUT, 'auth')
  @ApiOperation({ summary: 'Logout (revoke refresh token)' })
  @ApiBody({ type: LogoutDto })
  @ApiResponse({ status: 200, description: 'Logged out' })
  @ApiResponse({ status: 401, description: 'Невірний refresh token' })
  async logout(
    @Body() body: LogoutDto,
    @Req() req: RequestWithId,
    @Res({ passthrough: true }) res: Response,
  ) {
    markDomainAuditRecorded(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const refreshToken = this.getRefreshToken(req, body.refreshToken);
    this.clearAuthCookies(res);

    if (!refreshToken) {
      await this.logControllerAuthEvent(req, 'auth.logout', 'success', {
        refreshTokenPresent: false,
      });
      return { message: 'Logged out' };
    }

    return this.authService.logout(refreshToken, ip, userAgent, req.requestId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @AuditEvent(AUDIT_ACTIONS.AUTH_CHANGE_PASSWORD, 'auth')
  @ApiOperation({ summary: 'Change user password' })
  @ApiBody({ type: ChangePasswordDto })
  @ApiResponse({ status: 200, description: 'Пароль успішно змінено' })
  @ApiResponse({ status: 400, description: 'Невірний старий пароль' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @Req() req: RequestWithUser,
  ) {
    markDomainAuditRecorded(req);
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    return this.authService.changePassword(
      req.user.sub,
      body,
      ip,
      userAgent,
      req.requestId,
    );
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Req() req: RequestWithUser) {
    return this.authService.getProfile(req.user.sub);
  }

  private setAuthCookies(res: Response, auth: AuthTokens) {
    const csrfBinding = createSignedCsrfBinding();

    res.cookie(
      this.accessCookieName,
      auth.accessToken,
      this.buildCookieOptions(this.accessCookiePath, this.accessTokenMaxAgeMs),
    );
    res.cookie(
      this.refreshCookieName,
      auth.refreshToken,
      this.buildCookieOptions(
        this.refreshCookiePath,
        this.refreshTokenMaxAgeMs,
      ),
    );
    res.cookie(
      this.csrfBindingCookieName,
      csrfBinding,
      this.buildCookieOptions(
        this.csrfBindingCookiePath,
        this.refreshTokenMaxAgeMs,
      ),
    );
    res.cookie(
      this.csrfCookieName,
      createSignedCsrfToken(this.csrfSecret, csrfBinding),
      this.buildCookieOptions(
        this.csrfCookiePath,
        this.refreshTokenMaxAgeMs,
        false,
      ),
    );
  }

  private clearAuthCookies(res: Response) {
    res.clearCookie(
      this.accessCookieName,
      this.buildCookieOptions(this.accessCookiePath),
    );
    res.clearCookie(
      this.refreshCookieName,
      this.buildCookieOptions(this.refreshCookiePath),
    );
    res.clearCookie(
      this.csrfCookieName,
      this.buildCookieOptions(this.csrfCookiePath, undefined, false),
    );
    res.clearCookie(
      this.csrfBindingCookieName,
      this.buildCookieOptions(this.csrfBindingCookiePath),
    );
  }

  private buildCookieOptions(
    path: string,
    maxAge?: number,
    httpOnly = true,
  ): CookieOptions {
    return {
      httpOnly,
      secure: this.cookieSecure,
      sameSite: this.cookieSameSite,
      path,
      ...(maxAge ? { maxAge } : {}),
    };
  }

  private getRefreshToken(req: RequestWithId, fallback?: string) {
    return (
      readCookie(req, this.refreshCookieName) ??
      (typeof fallback === 'string' && fallback.trim() ? fallback.trim() : null)
    );
  }

  private async logControllerAuthEvent(
    req: RequestWithId,
    action: string,
    result: 'success' | 'failure',
    details: Record<string, unknown>,
  ): Promise<void> {
    await this.auditLogService.logAction({
      userId: null,
      userLogin: 'Guest',
      action,
      details,
      ipAddress: req.ip || req.socket?.remoteAddress || 'unknown',
      userAgent: req.get('user-agent') || 'unknown',
      result,
      requestId: req.requestId,
    });
  }
}
