import {
  BadRequestException,
  ForbiddenException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Role } from '../common/types/roles.enum';
import { UsersService } from '../users/users.service';
import { StudentProfileSyncService } from '../users/student-profile-sync.service';
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
      | 'rotateRefreshTokenHash'
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
  let studentProfileSync: jest.Mocked<
    Pick<StudentProfileSyncService, 'shouldSyncOnLogin' | 'syncUser'>
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
      rotateRefreshTokenHash: jest.fn().mockResolvedValue(true),
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
    studentProfileSync = {
      shouldSyncOnLogin: jest.fn().mockReturnValue(false),
      syncUser: jest.fn().mockResolvedValue({ active: 0, inactive: 0 }),
    };

    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        if (key === 'NODE_ENV') return 'production';
        if (key === 'DEPLOYMENT_ENV') return 'development';
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
      studentProfileSync as unknown as StudentProfileSyncService,
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

  it('hides externalStudentId from a student logging into their own account', async () => {
    const profileId = '6622b2a00f3a22d5b625d999';
    const user = createUser({
      id: '6622b2a00f3a22d5b625d998',
      login: 'student1',
      role: 'student',
    });
    user.toObject = () => ({
      _id: user.id,
      id: user.id,
      login: user.login,
      email: 'student1@maup.com.ua',
      role: user.role,
      firstName: 'Іван',
      lastName: 'Петренко',
      status: user.status,
      passwordHash: user.passwordHash,
      refreshTokenHashes: user.refreshTokenHashes,
      studentProfiles: [
        {
          _id: profileId,
          externalStudentId: 'EXT-STUDENT-1',
          group: '6622b2a00f3a22d5b625d174',
          recordBookNumber: 'RB-1',
          year: 1,
          status: 'active',
          syncedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      activeStudentProfileId: profileId,
    });
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');

    const result = await service.login(
      'student1',
      'password123',
      '127.0.0.1',
      'jest',
      'req-student',
    );

    const dto = result.user as {
      studentProfiles: Array<{ externalStudentId?: string }>;
    };
    expect(dto.studentProfiles[0].externalStudentId).toBeUndefined();
  });

  it('keeps externalStudentId for an admin logging into their own account', async () => {
    const profileId = '6622b2a00f3a22d5b625d997';
    const user = createUser();
    user.toObject = () => ({
      _id: user.id,
      id: user.id,
      login: user.login,
      email: 'admin@maup.com.ua',
      role: user.role,
      firstName: 'Адмін',
      lastName: 'Системний',
      status: user.status,
      passwordHash: user.passwordHash,
      refreshTokenHashes: user.refreshTokenHashes,
      studentProfiles: [
        {
          _id: profileId,
          externalStudentId: 'EXT-ADMIN-1',
          group: '6622b2a00f3a22d5b625d174',
          recordBookNumber: 'RB-2',
          year: 1,
          status: 'active',
          syncedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      activeStudentProfileId: profileId,
    });
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');

    const result = await service.login(
      'admin',
      'password123',
      '127.0.0.1',
      'jest',
      'req-admin',
    );

    const dto = result.user as {
      studentProfiles: Array<{ externalStudentId?: string }>;
    };
    expect(dto.studentProfiles[0].externalStudentId).toBe('EXT-ADMIN-1');
  });

  it('triggers a fire-and-forget profile sync after a student logs in when due', async () => {
    const user = createUser({
      id: '6622b2a00f3a22d5b625d996',
      login: 'student2',
      role: 'student',
    });
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    studentProfileSync.shouldSyncOnLogin.mockReturnValue(true);

    const result = await service.login(
      'student2',
      'password123',
      '127.0.0.1',
      'jest',
      'req-sync-due',
    );

    expect(result).toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );
    expect(studentProfileSync.shouldSyncOnLogin).toHaveBeenCalledWith(user);
    expect(studentProfileSync.syncUser).toHaveBeenCalledWith(user.id, 'login');
    // Tokens/audit are already issued before the trigger fires.
    expect(auditLogService.logAction.mock.invocationCallOrder[0]).toBeLessThan(
      studentProfileSync.syncUser.mock.invocationCallOrder[0],
    );
  });

  it('does not let a rejected login-time sync propagate or block login', async () => {
    const user = createUser({
      id: '6622b2a00f3a22d5b625d994',
      login: 'student4',
      role: 'student',
    });
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    studentProfileSync.shouldSyncOnLogin.mockReturnValue(true);
    studentProfileSync.syncUser.mockRejectedValue(new Error('boom'));
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    await expect(
      service.login(
        'student4',
        'password123',
        '127.0.0.1',
        'jest',
        'req-sync-fail',
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      }),
    );

    // Flush the microtask queue so the fire-and-forget `.catch()` has run.
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('Login-time profile sync failed'),
    );

    warn.mockRestore();
  });

  it('does not trigger a profile sync for non-student roles', async () => {
    const user = createUser();
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');

    await service.login(
      'admin',
      'password123',
      '127.0.0.1',
      'jest',
      'req-no-sync-role',
    );

    expect(studentProfileSync.syncUser).not.toHaveBeenCalled();
  });

  it('does not trigger a profile sync when shouldSyncOnLogin is false', async () => {
    const user = createUser({
      id: '6622b2a00f3a22d5b625d993',
      login: 'student5',
      role: 'student',
    });
    usersService.findByLogin.mockResolvedValue(user as never);
    jwtService.sign
      .mockReturnValueOnce('access-token')
      .mockReturnValueOnce('refresh-token');
    studentProfileSync.shouldSyncOnLogin.mockReturnValue(false);

    await service.login(
      'student5',
      'password123',
      '127.0.0.1',
      'jest',
      'req-no-sync-ttl',
    );

    expect(studentProfileSync.syncUser).not.toHaveBeenCalled();
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

    expect(usersService.rotateRefreshTokenHash).toHaveBeenCalledWith(
      user.id,
      tokenHash('old-refresh-token'),
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
    expect(passwordResetEmailService.sendPasswordReset).not.toHaveBeenCalled();
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
    passwordResetEmailService.isEnabled.mockReturnValue(true);

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
