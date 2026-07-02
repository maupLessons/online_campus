import 'reflect-metadata';
import { Role } from '../../common/types/roles.enum';
import { ROLES_KEY } from '../../auth/roles.guard';
import { MaupStudentApiController } from './maup-student-api.controller';

describe('MaupStudentApiController', () => {
  it('keeps diagnostics restricted to administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, MaupStudentApiController)).toEqual([
      Role.ADMIN,
    ]);
  });

  it('returns safe diagnostics without secrets or endpoint URLs', () => {
    const controller = new MaupStudentApiController({
      getDiagnostics: jest.fn().mockReturnValue({
        enabled: true,
        circuitState: 'open',
        requestCount: 10,
        failureCount: 3,
        consecutiveFailures: 3,
        lastFailureAt: '2026-07-02T08:00:00.000Z',
      }),
    } as never);

    const result = controller.diagnostics();

    expect(result).toEqual({
      status: 'degraded',
      enabled: true,
      circuitState: 'open',
      requestCount: 10,
      failureCount: 3,
      consecutiveFailures: 3,
      lastFailureAt: '2026-07-02T08:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('Authorization');
    expect(JSON.stringify(result)).not.toContain('https://');
  });

  it('marks disabled integration as disabled', () => {
    const controller = new MaupStudentApiController({
      getDiagnostics: jest.fn().mockReturnValue({
        enabled: false,
        circuitState: 'closed',
        requestCount: 0,
        failureCount: 0,
        consecutiveFailures: 0,
      }),
    } as never);

    expect(controller.diagnostics()).toMatchObject({
      status: 'disabled',
      enabled: false,
    });
  });
});
