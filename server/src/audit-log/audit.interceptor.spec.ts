import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of, throwError } from 'rxjs';
import { AUDIT_ACTIONS } from './audit-actions';
import { createAuditContext } from './audit-context';
import { AUDIT_EVENT_METADATA } from './audit.decorator';
import { AuditInterceptor } from './audit.interceptor';
import { AuditLogService } from './audit-log.service';

describe('AuditInterceptor', () => {
  const logAction = jest.fn().mockResolvedValue(undefined);
  const auditLogService = { logAction } as unknown as AuditLogService;
  const interceptor = new AuditInterceptor(auditLogService, new Reflector());

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the domain action for failures without persisting exception text', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(
      AUDIT_EVENT_METADATA,
      {
        action: AUDIT_ACTIONS.SURVEY_PUBLISH,
        targetEntity: 'survey',
      },
      handler,
    );
    const request = createRequest();
    const context = createExecutionContext(request, handler);
    const next: CallHandler = {
      handle: () =>
        throwError(() => new BadRequestException('private validation detail')),
    };

    await expect(
      lastValueFrom(interceptor.intercept(context, next)),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'survey.publish',
        targetEntity: 'survey',
        targetId: '507f1f77bcf86cd799439011',
        result: 'failure',
        details: {
          method: 'PATCH',
          path: '/api/surveys/507f1f77bcf86cd799439011/publish',
          statusCode: 400,
          errorType: 'BadRequestException',
        },
      }),
    );
    expect(JSON.stringify(logAction.mock.calls)).not.toContain(
      'private validation detail',
    );
  });

  it('does not add an HTTP fallback after a domain event was recorded', async () => {
    const request = createRequest();
    await createAuditContext(request as never, auditLogService).record({
      action: AUDIT_ACTIONS.SURVEY_PUBLISH,
      targetEntity: 'survey',
      targetId: '507f1f77bcf86cd799439011',
    });
    const context = createExecutionContext(request, () => undefined);

    await lastValueFrom(
      interceptor.intercept(context, { handle: () => of({ success: true }) }),
    );

    expect(logAction).toHaveBeenCalledTimes(1);
    expect(logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'survey.publish' }),
    );
  });
});

function createRequest() {
  return {
    user: {
      sub: 'user-1',
      login: 'admin',
      role: 'admin',
    },
    ip: '127.0.0.1',
    socket: {},
    requestId: 'req-1',
    method: 'PATCH',
    url: '/api/surveys/507f1f77bcf86cd799439011/publish',
    path: '/api/surveys/507f1f77bcf86cd799439011/publish',
    params: { id: '507f1f77bcf86cd799439011' },
    get: jest.fn().mockReturnValue('jest-agent'),
  };
}

function createExecutionContext(
  request: ReturnType<typeof createRequest>,
  handler: () => unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => undefined,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}
