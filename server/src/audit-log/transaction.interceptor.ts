import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Reflector } from '@nestjs/core';
import { Connection } from 'mongoose';
import { defer, from, lastValueFrom, Observable } from 'rxjs';
import { AuditLogService } from './audit-log.service';
import {
  AUDIT_EVENT_METADATA,
  AUDIT_TRANSACTIONAL_METADATA,
  AuditEventMetadata,
} from './audit.decorator';
import { TransactionLifecycleService } from './transaction-lifecycle.service';
import { RequestWithId } from '../common/middleware/request-id.middleware';

interface TransactionalRequest extends RequestWithId {
  user?: { sub: string; login: string; role?: string };
}

@Injectable()
export class TransactionInterceptor implements NestInterceptor {
  private readonly enabled: boolean;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
    private readonly lifecycle: TransactionLifecycleService,
  ) {
    this.enabled = readBooleanFlag(
      this.configService.get<string>('AUDIT_TRANSACTIONAL_OUTBOX'),
      this.configService.get<string>('NODE_ENV') === 'production',
    );
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const configuredTransaction = this.reflector.getAllAndOverride<boolean>(
      AUDIT_TRANSACTIONAL_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const request = context.switchToHttp().getRequest<TransactionalRequest>();
    const transactional =
      configuredTransaction ??
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);

    if (!this.enabled || !transactional) {
      return next.handle();
    }

    return defer(() =>
      from(
        this.lifecycle.run(async () => {
          try {
            return await this.connection.transaction<unknown>(
              () => lastValueFrom(next.handle() as Observable<unknown>),
              {
                readPreference: 'primary',
                readConcern: { level: 'snapshot' },
                writeConcern: { w: 'majority' },
                maxCommitTimeMS: 10_000,
              },
            );
          } catch (error) {
            await this.recordFailure(context, error);
            throw error;
          }
        }),
      ),
    );
  }

  private async recordFailure(
    context: ExecutionContext,
    error: unknown,
  ): Promise<void> {
    const request = context.switchToHttp().getRequest<TransactionalRequest>();
    const event = this.reflector.getAllAndOverride<AuditEventMetadata>(
      AUDIT_EVENT_METADATA,
      [context.getHandler(), context.getClass()],
    );
    const statusCode = error instanceof HttpException ? error.getStatus() : 500;

    await this.auditLogService.logAction({
      userId: request.user?.sub ?? null,
      userLogin: request.user?.login ?? 'Guest',
      userRole: request.user?.role,
      action: event?.action ?? `${request.method} ${request.path}`,
      targetEntity: event?.targetEntity,
      targetId: resolveTargetId(request.params),
      details: {
        method: request.method,
        path: request.path,
        statusCode,
        errorType: error instanceof Error ? error.name : 'UnknownError',
        transactionRolledBack: true,
      },
      ipAddress: request.ip || request.socket?.remoteAddress || 'unknown',
      userAgent: request.get('user-agent') || 'unknown',
      result: 'failure',
      requestId: request.requestId,
    });
  }
}

function readBooleanFlag(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (value === undefined) {
    return fallback;
  }

  return ['1', 'true', 'yes'].includes(value.toLowerCase());
}

function resolveTargetId(
  params: Record<string, string | string[] | undefined>,
): string | undefined {
  const value =
    params.id ??
    params.periodId ??
    params.selectionId ??
    params.submissionId ??
    params.fileId;
  const candidate = typeof value === 'string' ? value : undefined;
  return candidate && /^[a-f\d]{24}$/i.test(candidate) ? candidate : undefined;
}
