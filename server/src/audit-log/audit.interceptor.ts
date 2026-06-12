import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, map, mergeMap } from 'rxjs/operators';
import { AuditLogService } from './audit-log.service';
import { RequestWithId } from '../common/middleware/request-id.middleware';
import {
  AUDIT_EVENT_METADATA,
  AUDIT_TRANSACTIONAL_METADATA,
  AuditEventMetadata,
  SKIP_AUDIT_METADATA,
} from './audit.decorator';
import { wasDomainAuditRecorded } from './audit-context';

interface JwtUser {
  sub: string;
  login: string;
  role?: string;
}

interface AuthenticatedRequest extends RequestWithId {
  user?: JwtUser;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const skipAudit = this.reflector.getAllAndOverride<boolean>(
      SKIP_AUDIT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    if (skipAudit) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const userAgent = request.get('user-agent') || 'unknown';
    const method = request.method;
    const url = request.url;
    const event = this.reflector.getAllAndOverride<AuditEventMetadata>(
      AUDIT_EVENT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const transactional = this.reflector.getAllAndOverride<boolean>(
      AUDIT_TRANSACTIONAL_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const action = event?.action ?? `${method} ${url}`;
    const requestId = request.requestId;
    const auditTarget = event
      ? {
          targetEntity: event.targetEntity,
          targetId: resolveTargetId(request),
        }
      : resolveAuditTarget(request.path || url);
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    return next.handle().pipe(
      mergeMap((value: unknown) => {
        if (isMutation && !wasDomainAuditRecorded(request)) {
          return from(
            this.auditLogService.logAction({
              userId: user?.sub || null,
              userLogin: user?.login || 'Guest',
              userRole: user?.role,
              action,
              ...auditTarget,
              details: {
                method,
                path: request.path || url.split('?')[0],
                source: event ? 'domain-fallback' : 'http-fallback',
              },
              ipAddress: ip,
              userAgent,
              result: 'success',
              requestId,
            }),
          ).pipe(map((): unknown => value));
        }
        return of(value);
      }),
      catchError((error: unknown) => {
        if (transactional) {
          return throwError(() => error);
        }

        if (
          (isMutation || url.includes('/login')) &&
          !wasDomainAuditRecorded(request)
        ) {
          return from(
            this.auditLogService.logAction({
              userId: user?.sub || null,
              userLogin: user?.login || 'Guest',
              userRole: user?.role,
              action,
              ...auditTarget,
              details: buildFailureDetails(error, method, request.path || url),
              ipAddress: ip,
              userAgent,
              result: 'failure',
              requestId,
            }),
          ).pipe(mergeMap(() => throwError(() => error)));
        }
        return throwError(() => error);
      }),
    );
  }
}

function resolveTargetId(request: AuthenticatedRequest): string | undefined {
  const params = request.params as Record<string, string | undefined>;
  const candidate =
    params.id ??
    params.periodId ??
    params.selectionId ??
    params.submissionId ??
    params.fileId;

  return candidate && /^[a-f\d]{24}$/i.test(candidate) ? candidate : undefined;
}

function buildFailureDetails(
  error: unknown,
  method: string,
  path: string,
): Record<string, unknown> {
  const statusCode = error instanceof HttpException ? error.getStatus() : 500;

  return {
    method,
    path: path.split('?')[0],
    statusCode,
    errorType: error instanceof Error ? error.name : 'UnknownError',
  };
}

function resolveAuditTarget(path: string): {
  targetEntity?: string;
  targetId?: string;
} {
  const [pathname] = path.split('?');
  const [targetEntity, maybeTargetId] = pathname
    .replace(/^\/api\//, '')
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean);

  return {
    targetEntity,
    targetId: /^[a-f\d]{24}$/i.test(maybeTargetId) ? maybeTargetId : undefined,
  };
}
