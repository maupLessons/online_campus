import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UsersService } from '../users/users.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';
import { PasswordResetEmailService } from './password-reset-email.service';

interface AuthUser {
  id: string;
  login: string;
  role: string;
  status: string;
  passwordHash: string;
  refreshTokenHashes?: string[];
  toObject: () => Record<string, unknown>;
}

interface ValidJwtPayload {
  sub: string;
  login: string;
  role: string;
}

type PasswordResetResponse = {
  message: string;
  expiresAt?: string;
  resetToken?: string;
  resetUrl?: string;
};

const PASSWORD_RESET_MESSAGE =
  'Якщо акаунт існує, інструкції для відновлення пароля будуть надіслані.';
const PASSWORD_RESET_TOKEN_BYTES = 32;
const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 30;

function isJwtPayload(obj: unknown): obj is ValidJwtPayload {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sub' in obj &&
    'login' in obj &&
    'role' in obj &&
    typeof (obj as Record<string, unknown>).sub === 'string' &&
    typeof (obj as Record<string, unknown>).login === 'string' &&
    typeof (obj as Record<string, unknown>).role === 'string'
  );
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function getJwtVerifyFailureReason(err: unknown): string {
  if (err && typeof err === 'object') {
    const name = (err as { name?: unknown }).name;
    if (name === 'TokenExpiredError') return 'Refresh token expired';
    if (name === 'JsonWebTokenError') return 'Invalid refresh token';
    if (name === 'NotBeforeError') return 'Refresh token not active';
  }
  return 'Invalid refresh token';
}

@Injectable()
export class AuthService {
  private readonly accessTokenExpiresIn: NonNullable<
    JwtSignOptions['expiresIn']
  >;
  private readonly refreshTokenExpiresIn: NonNullable<
    JwtSignOptions['expiresIn']
  >;
  private readonly passwordResetTtlMs: number;
  private readonly clientUrl: string;
  private readonly exposePasswordResetToken: boolean;

  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly auditLogService: AuditLogService,
    private readonly passwordResetEmailService: PasswordResetEmailService,
    configService: ConfigService,
  ) {
    this.accessTokenExpiresIn =
      configService.get<NonNullable<JwtSignOptions['expiresIn']>>(
        'JWT_EXPIRES_IN',
      ) ?? '15m';
    this.refreshTokenExpiresIn =
      configService.get<NonNullable<JwtSignOptions['expiresIn']>>(
        'JWT_REFRESH_EXPIRES_IN',
      ) ?? '7d';
    this.passwordResetTtlMs =
      readPositiveInteger(
        configService.get<string>('PASSWORD_RESET_TTL_MINUTES'),
        DEFAULT_PASSWORD_RESET_TTL_MINUTES,
      ) *
      60 *
      1000;
    this.clientUrl =
      configService.get<string>('CLIENT_URL') ?? 'http://localhost:5173';
    const deploymentEnv =
      configService.get<string>('DEPLOYMENT_ENV') ??
      (configService.get<string>('NODE_ENV') === 'production'
        ? 'production'
        : 'development');
    this.exposePasswordResetToken =
      deploymentEnv !== 'production' &&
      configService.get<string>('PASSWORD_RESET_EXPOSE_TOKEN') === 'true';
  }

  async login(
    login: string,
    pass: string,
    ipAddress = 'unknown',
    userAgent = 'unknown',
    requestId?: string,
  ) {
    const user = (await this.usersService.findByLogin(
      login,
    )) as unknown as AuthUser | null;

    if (!user) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: login,
        action: 'auth.login',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Invalid credentials' },
        requestId,
      });
      throw new UnauthorizedException('Невірний логін або пароль');
    }

    if (user.status === 'blocked') {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: login,
        action: 'auth.login',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Account is blocked' },
        requestId,
      });
      throw new ForbiddenException('Обліковий запис заблоковано');
    }

    if (!(await bcrypt.compare(pass, user.passwordHash))) {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: login,
        action: 'auth.login',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Invalid credentials' },
        requestId,
      });
      throw new UnauthorizedException('Невірний логін або пароль');
    }

    const payload: ValidJwtPayload = {
      sub: user.id,
      login: user.login,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.accessTokenExpiresIn,
    });
    const refreshToken = this.jwtService.sign(
      { ...payload, jti: randomUUID() },
      {
        expiresIn: this.refreshTokenExpiresIn,
      },
    );

    await this.usersService.addRefreshTokenHash(
      user.id,
      hashToken(refreshToken),
    );

    await this.auditLogService.logAction({
      userId: user.id,
      userLogin: user.login,
      action: 'auth.login',
      ipAddress,
      userAgent,
      result: 'success',
      requestId,
    });

    const userObj = user.toObject();
    const safeUser: Record<string, unknown> = { ...userObj };

    Reflect.deleteProperty(safeUser, 'passwordHash');
    Reflect.deleteProperty(safeUser, 'refreshTokenHashes');

    return { accessToken, refreshToken, user: safeUser };
  }

  async getProfile(userId: string) {
    const userDto = await this.usersService.findOne(userId);
    if (!userDto) throw new UnauthorizedException('Користувача не знайдено');
    return userDto;
  }

  async requestPasswordReset(
    dto: RequestPasswordResetDto,
    ipAddress = 'unknown',
    userAgent = 'unknown',
    requestId?: string,
  ): Promise<PasswordResetResponse> {
    const identifier = dto.identifier.trim();
    const candidate =
      await this.usersService.findPasswordResetCandidate(identifier);

    if (!candidate || candidate.status !== 'active') {
      await this.auditLogService.logAction({
        userId: candidate?.id ?? null,
        userLogin: candidate?.login ?? identifier,
        userRole: candidate?.role,
        action: 'auth.password_reset.request',
        ipAddress,
        userAgent,
        result: 'failure',
        details: {
          reason: candidate ? 'Account is not active' : 'Account not found',
        },
        requestId,
      });

      return { message: PASSWORD_RESET_MESSAGE };
    }

    const resetToken = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString(
      'base64url',
    );
    const expiresAt = new Date(Date.now() + this.passwordResetTtlMs);

    await this.usersService.setPasswordResetToken(
      candidate.id,
      hashToken(resetToken),
      expiresAt,
    );

    const resetUrl = this.buildPasswordResetUrl(resetToken);
    const emailEnabled = this.passwordResetEmailService.isEnabled();
    let delivery: 'smtp' | 'development-response' | 'disabled' | 'failed' = this
      .exposePasswordResetToken
      ? 'development-response'
      : emailEnabled
        ? 'smtp'
        : 'disabled';

    if (emailEnabled) {
      try {
        await this.passwordResetEmailService.sendPasswordReset({
          to: candidate.email,
          login: candidate.login,
          resetUrl,
          expiresAt,
        });
      } catch {
        delivery = 'failed';
      }
    }

    await this.auditLogService.logAction({
      userId: candidate.id,
      userLogin: candidate.login,
      userRole: candidate.role,
      action: 'auth.password_reset.request',
      ipAddress,
      userAgent,
      result: 'success',
      details: {
        expiresAt: expiresAt.toISOString(),
        delivery,
      },
      requestId,
    });

    const response: PasswordResetResponse = {
      message: PASSWORD_RESET_MESSAGE,
    };

    if (this.exposePasswordResetToken) {
      response.resetToken = resetToken;
      response.resetUrl = resetUrl;
      response.expiresAt = expiresAt.toISOString();
    }

    return response;
  }

  async confirmPasswordReset(
    dto: ConfirmPasswordResetDto,
    ipAddress = 'unknown',
    userAgent = 'unknown',
    requestId?: string,
  ) {
    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    const user = await this.usersService.consumePasswordResetToken(
      hashToken(dto.token),
      passwordHash,
    );

    if (!user) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: 'unknown',
        action: 'auth.password_reset.confirm',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Invalid or expired reset token' },
        requestId,
      });

      throw new BadRequestException(
        'Посилання для відновлення пароля недійсне або протерміноване',
      );
    }

    await this.auditLogService.logAction({
      userId: user.id,
      userLogin: user.login,
      userRole: user.role,
      action: 'auth.password_reset.confirm',
      ipAddress,
      userAgent,
      result: 'success',
      requestId,
    });

    return {
      message: 'Пароль успішно змінено. Увійдіть з новим паролем.',
    };
  }

  async refresh(
    refreshToken: string,
    ipAddress = 'unknown',
    userAgent = 'unknown',
    requestId?: string,
  ) {
    let decoded: unknown;

    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch (err: unknown) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: 'unknown',
        action: 'auth.refresh',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: getJwtVerifyFailureReason(err) },
        requestId,
      });
      throw new UnauthorizedException('Невірний refresh token');
    }

    if (!isJwtPayload(decoded)) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: 'unknown',
        action: 'auth.refresh',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Invalid refresh token payload' },
        requestId,
      });
      throw new UnauthorizedException('Невірний refresh token');
    }

    const user = (await this.usersService.findByIdWithPassword(
      decoded.sub,
    )) as unknown as AuthUser | null;

    if (!user) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: decoded.login,
        action: 'auth.refresh',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'User not found' },
        requestId,
      });
      throw new UnauthorizedException('Користувача не знайдено');
    }

    if (user.status === 'blocked') {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: user.login,
        action: 'auth.refresh',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Account is blocked' },
        requestId,
      });
      throw new ForbiddenException('Обліковий запис заблоковано');
    }

    const tokenHash = hashToken(refreshToken);
    const hashes = Array.isArray(user.refreshTokenHashes)
      ? user.refreshTokenHashes
      : [];

    if (!hashes.includes(tokenHash)) {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: user.login,
        action: 'auth.refresh',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Refresh token revoked or unknown' },
        requestId,
      });
      throw new UnauthorizedException('Невірний refresh token');
    }

    const newPayload: ValidJwtPayload = {
      sub: user.id,
      login: user.login,
      role: user.role,
    };
    const newAccessToken = this.jwtService.sign(newPayload, {
      expiresIn: this.accessTokenExpiresIn,
    });
    const newRefreshToken = this.jwtService.sign(
      { ...newPayload, jti: randomUUID() },
      { expiresIn: this.refreshTokenExpiresIn },
    );

    const rotated = await this.usersService.rotateRefreshTokenHash(
      user.id,
      tokenHash,
      hashToken(newRefreshToken),
    );
    if (!rotated) {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: user.login,
        action: 'auth.refresh',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Concurrent refresh token reuse detected' },
        requestId,
      });
      throw new UnauthorizedException('Невірний refresh token');
    }

    await this.auditLogService.logAction({
      userId: user.id,
      userLogin: user.login,
      action: 'auth.refresh',
      ipAddress,
      userAgent,
      result: 'success',
      requestId,
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(
    refreshToken: string,
    ipAddress = 'unknown',
    userAgent = 'unknown',
    requestId?: string,
  ) {
    let decoded: unknown;

    try {
      decoded = this.jwtService.verify(refreshToken);
    } catch (err: unknown) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: 'unknown',
        action: 'auth.logout',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: getJwtVerifyFailureReason(err) },
        requestId,
      });
      throw new UnauthorizedException('Невірний refresh token');
    }

    if (!isJwtPayload(decoded)) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: 'unknown',
        action: 'auth.logout',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Invalid refresh token payload' },
        requestId,
      });
      throw new UnauthorizedException('Невірний refresh token');
    }

    const user = (await this.usersService.findByIdWithPassword(
      decoded.sub,
    )) as unknown as AuthUser | null;

    if (!user) {
      await this.auditLogService.logAction({
        userId: null,
        userLogin: decoded.login,
        action: 'auth.logout',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'User not found' },
        requestId,
      });
      throw new UnauthorizedException('Користувача не знайдено');
    }

    if (user.status === 'blocked') {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: user.login,
        action: 'auth.logout',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Account is blocked' },
        requestId,
      });
      throw new ForbiddenException('Обліковий запис заблоковано');
    }

    await this.usersService.removeRefreshTokenHash(
      user.id,
      hashToken(refreshToken),
    );

    await this.auditLogService.logAction({
      userId: user.id,
      userLogin: user.login,
      action: 'auth.logout',
      ipAddress,
      userAgent,
      result: 'success',
      requestId,
    });

    return { message: 'Logged out' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ipAddress: string,
    userAgent: string,
    requestId?: string,
  ) {
    const user = (await this.usersService.findByIdWithPassword(
      userId,
    )) as unknown as AuthUser | null;

    if (!user) throw new UnauthorizedException('Користувача не знайдено');

    const isPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      await this.auditLogService.logAction({
        userId: user.id,
        userLogin: user.login,
        action: 'auth.change_password',
        ipAddress,
        userAgent,
        result: 'failure',
        details: { reason: 'Invalid old password' },
        requestId,
      });
      throw new BadRequestException('Невірний старий пароль');
    }

    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.usersService.updatePassword(userId, newPasswordHash);
    await this.usersService.removeAllRefreshTokenHashes(user.id);

    await this.auditLogService.logAction({
      userId: user.id,
      userLogin: user.login,
      action: 'auth.change_password',
      ipAddress,
      userAgent,
      result: 'success',
      requestId,
    });

    return { message: 'Пароль успішно змінено' };
  }

  private buildPasswordResetUrl(token: string): string {
    const url = new URL('/reset-password', this.clientUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
