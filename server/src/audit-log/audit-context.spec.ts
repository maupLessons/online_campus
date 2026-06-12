import { createAuditContext, wasDomainAuditRecorded } from './audit-context';
import { AUDIT_ACTIONS } from './audit-actions';
import { AuditLogService } from './audit-log.service';

describe('AuditContext', () => {
  it('records request identity and marks the request as domain-audited', async () => {
    const request = {
      user: {
        sub: 'user-1',
        login: 'admin',
        role: 'admin',
      },
      ip: '127.0.0.1',
      socket: {},
      requestId: 'req-1',
      get: jest.fn().mockReturnValue('jest-agent'),
    };
    const logAction = jest.fn().mockResolvedValue(undefined);
    const auditLogService = { logAction } as unknown as AuditLogService;

    expect(wasDomainAuditRecorded(request as never)).toBe(false);

    await createAuditContext(request as never, auditLogService).record({
      action: AUDIT_ACTIONS.SURVEY_PUBLISH,
      targetEntity: 'survey',
      targetId: '507f1f77bcf86cd799439011',
      details: { title: 'Campus feedback' },
    });

    expect(wasDomainAuditRecorded(request as never)).toBe(true);
    expect(logAction).toHaveBeenCalledWith({
      userId: 'user-1',
      userLogin: 'admin',
      userRole: 'admin',
      action: 'survey.publish',
      targetEntity: 'survey',
      targetId: '507f1f77bcf86cd799439011',
      details: { title: 'Campus feedback' },
      ipAddress: '127.0.0.1',
      userAgent: 'jest-agent',
      result: 'success',
      requestId: 'req-1',
    });
  });
});
