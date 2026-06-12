import { applyDecorators, SetMetadata } from '@nestjs/common';
import { AuditAction } from './audit-actions';

export const AUDIT_EVENT_METADATA = 'audit:event';
export const SKIP_AUDIT_METADATA = 'audit:skip';
export const AUDIT_TRANSACTIONAL_METADATA = 'audit:transactional';

export type AuditEventMetadata = {
  action: AuditAction;
  targetEntity: string;
};

export const AuditEvent = (
  action: AuditAction,
  targetEntity: string,
  transactional = true,
) =>
  applyDecorators(
    SetMetadata(AUDIT_EVENT_METADATA, {
      action,
      targetEntity,
    }),
    SetMetadata(AUDIT_TRANSACTIONAL_METADATA, transactional),
  );

export const SkipAudit = () => SetMetadata(SKIP_AUDIT_METADATA, true);
