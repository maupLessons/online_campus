import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Role } from '../common/types/roles.enum';
import { UsersService } from '../users/users.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthService } from './auth.service';
import { PasswordResetEmailService } from './password-reset-email.service';

type MockUser = {
  id: string;
  login: string;
  role: string;
  status: string;
  passwordHash: string;
  refreshTokenHashes: string[];
  toObject: () => Record<string, unknown>;
};

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const createUser = (overrides: Partial<MockUser> = {}): MockUser => {
  const user = {
    id: '6622b2a00f3a22d5b625d171',
    login: 'admin',
    role: 'admin',
    status: 'active',
    passwordHash: bcrypt.hashSync('password123', 4),
    refreshTokenHashes: [],
    ...overrides,
  } satisfies Omit<MockUser, 'toObject'>;

  return {
    ...user,
    toObject: () => ({
      _id: user.id,
      id: user.id,
      login: user.login,
      role: user.role,
      status: user.status,
      passwordHash: user.passwordHash,
      refreshTokenHashes: user.refreshTokenHashes,
    }),
  };
};

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<Pick<JwtService, 'sign' | 'verify'>>;
  let usersService: jest.Mocked<
    Pick<
      UsersService,
      | 'findByLogin'
      | 'findByIdWithPassword'
      | 'addRefreshTokenHash'
      | 'removeRefreshTokenHash'
      | 'removeAllRefreshTokenHashes'
      | 'updatePassword'
      | 'findOne'
      | 'findPasswordResetCandidate'
      | 'setPasswordResetToken'
      | 'consumePasswordResetToken'
    >
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'logAction'>>;
  let passwordResetEmailService: jest.Mocked<
    Pick<PasswordResetEmailService, 'sendPasswordReset' | 'isEnabled'>
  >;

  beforeEach(() => {
    jwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
    };
    usersService = {
      findByLogin: jest.fn(),
      findByIdWithPassword: jest.fn(),
      addRefreshTokenHash: jest.fn(),
      removeRefreshTokenHash: jest.fn(),
      removeAllRefreshTokenHashes: jest.fn(),
      updatePassword: jest.fn(),
      findOne: jest.fn(),
      findPasswordResetCandidate: jest.fn(),
      setPasswordResetToken: jest.fn(),
      consumePasswordResetToken: jest.fn(),
    };
    auditLogService = {
      logAction: jest.fn(),
    };
    passwordResetEmailService = {
      sendPasswordReset: jest.fn(),
      isEnabled: jest.fn().mockReturnValue(false),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        if (key === 'NODE_ENV') return 'test';
        if (key === 'CLIENT_URL') return 'http://localhost:5173';
        if (key === 'PASSWORD_RESET_EXPOSE_TOKEN') return 'true';
        return undefined;
      }),
    } as unknown as ConfigService;

    service = new AuthService(
      jwtService as unknown as JwtService,
      usersService as unknown as UsersService,
      auditLogService as unknown as AuditLogService,
      passwordResetEmailService as unknown as PasswordResetEmailService,
      configService,
    );
  });

  it('rejects blocked users before password comparison', async () => {
    const blockedUser = createUser({ status: 'blocked' });
    usersService.findByLogin.mockResolvedValue(blockedUser as never);
    const compareSpy = jest.spyOn(bcrypt, 'compare');

    await expect(
      service.login('admin', 'wrong-password', '127.0.0.1', 'jest', 'req-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(compareSpy).not.toHaveBeenCalled();
    expect(auditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.login',
        result: 'failure',
        details: { reason: 'Account is blocked' },
      }),
    );

    compareSpy.mockRestore();
  });

  it('stores only refresh token hashes and strips sensitive fields on login', async () => {
    const user = createUser();
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');

    const result = await service.login(
      'admin',
      'password123',
      '127.0.0.1',
      'jest',
      'req-2',
    );

    expect(usersService.addRefreshTokenHash).toHaveBeenCalledWith(
      user.id,
      tokenHash('refresh-token'),
    );
    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(result.user).not.toHaveProperty('refreshTokenHashes');
  });

  it('rotates refresh tokens and rejects revoked tokens', async () => {
    const user = createUser({
      refreshTokenHashes: [tokenHash('old-refresh-token')],
    });
    jwtService.verify.mockReturnValue({
      sub: user.id,
      login: user.login,
      role: user.role,
    });
    usersService.findByIdWithPassword.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('new-access-token')
      .mockReturnValueOnce('new-refresh-token');

    await expect(
      service.refresh('old-refresh-token', '127.0.0.1', 'jest', 'req-3'),
    ).resolves.toEqual({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });

    expect(usersService.removeRefreshTokenHash).toHaveBeenCalledWith(
      user.id,
      tokenHash('old-refresh-token'),
    );
    expect(usersService.addRefreshTokenHash).toHaveBeenCalledWith(
      user.id,
      tokenHash('new-refresh-token'),
    );

    usersService.findByIdWithPassword.mockResolvedValue(
      createUser({ refreshTokenHashes: [] }) as never,
    );

    await expect(
      service.refresh('old-refresh-token', '127.0.0.1', 'jest', 'req-4'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes all refresh sessions after password change', async () => {
    const user = createUser();
    usersService.findByIdWithPassword.mockResolvedValue(user as never);

    const dto: ChangePasswordDto = {
      oldPassword: 'password123',
      newPassword: 'Password123!',
    };

    await expect(
      service.changePassword(user.id, dto, '127.0.0.1', 'jest', 'req-5'),
    ).resolves.toEqual({ message: 'Пароль успішно змінено' });

    expect(usersService.updatePassword).toHaveBeenCalledWith(
      user.id,
      expect.any(String),
    );
    expect(usersService.removeAllRefreshTokenHashes).toHaveBeenCalledWith(
      user.id,
    );
  });

  it('issues password reset tokens without exposing account existence', async () => {
    const user = createUser();
    usersService.findPasswordResetCandidate.mockResolvedValue({
      id: user.id,
      login: user.login,
      email: 'admin@maup.com.ua',
      role: Role.ADMIN,
      status: 'active',
    });

    const result = await service.requestPasswordReset(
      { identifier: 'admin' },
      '127.0.0.1',
      'jest',
      'req-6',
    );

    expect(usersService.setPasswordResetToken).toHaveBeenCalledWith(
      user.id,
      expect.any(String),
      expect.any(Date),
    );
    expect(typeof result.message).toBe('string');
    expect(typeof result.resetToken).toBe('string');
    expect(result.resetUrl).toContain('/reset-password?token=');
    expect(typeof result.expiresAt).toBe('string');
    const resetEmail =
      passwordResetEmailService.sendPasswordReset.mock.calls[0]?.[0];
    expect(resetEmail).toEqual(
      expect.objectContaining({
        to: 'admin@maup.com.ua',
        login: user.login,
      }),
    );
    expect(resetEmail?.resetUrl).toContain('/reset-password?token=');
    expect(auditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset.request',
        result: 'success',
      }),
    );

    usersService.findPasswordResetCandidate.mockResolvedValue(null);

    const missingResult = await service.requestPasswordReset(
      { identifier: 'missing' },
      '127.0.0.1',
      'jest',
      'req-7',
    );

    expect(typeof missingResult.message).toBe('string');
    expect(missingResult.resetToken).toBeUndefined();
  });

  it('resets password with a valid reset token', async () => {
    const user = createUser();
    usersService.consumePasswordResetToken.mockResolvedValue({
      id: user.id,
      login: user.login,
      email: 'admin@maup.com.ua',
      role: Role.ADMIN,
      status: 'active',
    });

    await expect(
      service.confirmPasswordReset(
        {
          token: 'valid-reset-token',
          newPassword: 'Password123!',
        },
        '127.0.0.1',
        'jest',
        'req-8',
      ),
    ).resolves.toEqual({
      message: 'Пароль успішно змінено. Увійдіть з новим паролем.',
    });

    expect(usersService.consumePasswordResetToken).toHaveBeenCalledWith(
      tokenHash('valid-reset-token'),
      expect.any(String),
    );
    expect(auditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset.confirm',
        result: 'success',
        userId: user.id,
      }),
    );
  });

  it('does not reveal an SMTP delivery failure to password-reset callers', async () => {
    const user = createUser();
    usersService.findPasswordResetCandidate.mockResolvedValue({
      id: user.id,
      login: user.login,
      email: 'admin@maup.com.ua',
      role: Role.ADMIN,
      status: 'active',
    });
    passwordResetEmailService.sendPasswordReset.mockRejectedValue(
      new Error('SMTP unavailable'),
    );

    const result = await service.requestPasswordReset({ identifier: 'admin' });

    expect(typeof result.message).toBe('string');
    const deliveryAudit = auditLogService.logAction.mock.calls.find(
      ([entry]) => entry.action === 'auth.password_reset.request',
    )?.[0];
    expect(deliveryAudit?.result).toBe('success');
    expect(deliveryAudit?.details).toEqual(
      expect.objectContaining({ delivery: 'failed' }),
    );
  });

  it('rejects invalid or expired reset tokens', async () => {
    usersService.consumePasswordResetToken.mockResolvedValue(null);

    await expect(
      service.confirmPasswordReset(
        {
          token: 'expired-reset-token',
          newPassword: 'Password123!',
        },
        '127.0.0.1',
        'jest',
        'req-9',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(usersService.consumePasswordResetToken).toHaveBeenCalledWith(
      tokenHash('expired-reset-token'),
      expect.any(String),
    );
    expect(auditLogService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'auth.password_reset.confirm',
        result: 'failure',
      }),
    );
  });
});
