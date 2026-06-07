import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AuditLogService } from './audit-log.service';
import { AuditLogResult } from './dto';
import { AuditLog } from './schemas/audit-log.schema';

describe('AuditLogService', () => {
  let service: AuditLogService;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;
  const auditModel = {
    create: jest.fn().mockResolvedValue({}),
    find: jest.fn(),
    countDocuments: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getModelToken(AuditLog.name),
          useValue: auditModel,
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should persist audit entries asynchronously', async () => {
    service.logAction({
      userId: null,
      userLogin: 'Guest',
      action: 'POST /auth/login',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      result: 'failure',
      requestId: 'req-1',
    });

    await Promise.resolve();

    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'POST /auth/login',
        ipAddress: '127.0.0.1',
        result: 'failure',
        requestId: 'req-1',
      }),
    );
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Result: failure'),
    );
    expect(loggerErrorSpy).not.toHaveBeenCalled();
  });

  it('should redact sensitive audit details before persisting', async () => {
    service.logAction({
      userId: 'user-1',
      userLogin: 'admin',
      action: 'auth.change_password',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      result: 'success',
      details: {
        reason: 'Password changed',
        password: 'Password123!',
        nested: {
          refreshToken: 'refresh-token',
        },
      },
    });

    await Promise.resolve();

    expect(auditModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        details: {
          reason: 'Password changed',
          password: '[REDACTED]',
          nested: {
            refreshToken: '[REDACTED]',
          },
        },
      }),
    );
  });

  it('should return paginated audit entries with safe regex filters', async () => {
    const docs = [
      {
        _id: 'audit-1',
        timestamp: new Date('2026-05-20T06:00:00.000Z'),
        userId: 'user-1',
        userLogin: 'admin',
        userRole: 'admin',
        action: 'auth.login',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
        result: 'success',
        createdAt: new Date('2026-05-20T06:00:00.000Z'),
        updatedAt: new Date('2026-05-20T06:00:00.000Z'),
      },
    ];
    const findQuery = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue(docs),
    };
    const countQuery = {
      exec: jest.fn().mockResolvedValue(1),
    };

    auditModel.find.mockReturnValue(findQuery);
    auditModel.countDocuments.mockReturnValue(countQuery);

    const result = await service.findAll({
      page: 1,
      limit: 10,
      userLogin: 'adm.*',
      result: AuditLogResult.SUCCESS,
    });

    expect(auditModel.find).toHaveBeenCalledWith({
      userLogin: { $regex: 'adm\\.\\*', $options: 'i' },
      result: 'success',
    });
    expect(findQuery.sort).toHaveBeenCalledWith({ timestamp: -1, _id: -1 });
    expect(findQuery.skip).toHaveBeenCalledWith(0);
    expect(findQuery.limit).toHaveBeenCalledWith(10);
    expect(result).toEqual(
      expect.objectContaining({
        totalDocs: 1,
        page: 1,
        totalPages: 1,
        docs: [
          expect.objectContaining({
            id: 'audit-1',
            userLogin: 'admin',
            action: 'auth.login',
          }),
        ],
      }),
    );
  });
});
