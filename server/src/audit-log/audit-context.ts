import { Request } from 'express';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { RequestWithId } from '../common/middleware/request-id.middleware';
import { AuditAction } from './audit-actions';
import { AuditLogService } from './audit-log.service';

const DOMAIN_AUDIT_RECORDED = Symbol('domain-audit-recorded');

type AuditRequest = Request &
  RequestWithId & {
    user?: AuthenticatedUser;
    [DOMAIN_AUDIT_RECORDED]?: boolean;
  };

export type DomainAuditEvent = {
  action: AuditAction;
  targetEntity: string;
  targetId?: string;
  details?: Record<string, unknown>;
};

export type DomainAuditContext = {
  record(event: DomainAuditEvent): Promise<void>;
};

export function createAuditContext(
  request: AuditRequest,
  auditLogService: AuditLogService,
): DomainAuditContext {
  const user = request.user;
  const ipAddress = request.ip || request.socket?.remoteAddress || 'unknown';
  const userAgent = request.get('user-agent') || 'unknown';

  return {
    async record(event) {
      request[DOMAIN_AUDIT_RECORDED] = true;
      await auditLogService.logAction({
        userId: user?.sub ?? null,
        userLogin: user?.login ?? 'Guest',
        userRole: user?.role,
        action: event.action,
        targetEntity: event.targetEntity,
        targetId: event.targetId,
        details: event.details,
        ipAddress,
        userAgent,
        result: 'success',
        requestId: request.requestId,
      });
    },
  };
}

export function wasDomainAuditRecorded(request: Request): boolean {
  return Boolean((request as AuditRequest)[DOMAIN_AUDIT_RECORDED]);
}

export function markDomainAuditRecorded(request: Request): void {
  (request as AuditRequest)[DOMAIN_AUDIT_RECORDED] = true;
}
