import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AuditOutbox,
  AuditOutboxDocument,
  AuditOutboxStatus,
} from './schemas/audit-outbox.schema';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

const DEFAULT_POLL_INTERVAL_MS = 500;
const DEFAULT_LOCK_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 10;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

@Injectable()
export class AuditOutboxProcessor
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(AuditOutboxProcessor.name);
  private timer?: NodeJS.Timeout;
  private processing = false;
  private activeFlush?: Promise<number>;
  private readonly pollIntervalMs: number;
  private readonly lockTimeoutMs: number;
  private readonly maxAttempts: number;

  constructor(
    @InjectModel(AuditOutbox.name)
    private readonly outboxModel: Model<AuditOutboxDocument>,
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
    configService: ConfigService,
  ) {
    this.pollIntervalMs = readPositiveNumber(
      configService,
      'AUDIT_OUTBOX_POLL_INTERVAL_MS',
      DEFAULT_POLL_INTERVAL_MS,
    );
    this.lockTimeoutMs = readPositiveNumber(
      configService,
      'AUDIT_OUTBOX_LOCK_TIMEOUT_MS',
      DEFAULT_LOCK_TIMEOUT_MS,
    );
    this.maxAttempts = readPositiveNumber(
      configService,
      'AUDIT_OUTBOX_MAX_ATTEMPTS',
      DEFAULT_MAX_ATTEMPTS,
    );
  }

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => {
      void this.flushAvailable();
    }, this.pollIntervalMs);
    this.timer.unref();
    void this.flushAvailable();
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
    }
    await this.activeFlush;
    await this.flushAvailable(1000);
  }

  async flushAvailable(maxEvents = 100): Promise<number> {
    if (this.processing) {
      return 0;
    }

    this.processing = true;
    this.activeFlush = this.processBatch(maxEvents);
    try {
      return await this.activeFlush;
    } finally {
      this.processing = false;
      this.activeFlush = undefined;
    }
  }

  private async processBatch(maxEvents: number): Promise<number> {
    let processed = 0;
    await this.releaseStaleLocks();
    while (processed < maxEvents) {
      const event = await this.claimNext();
      if (!event) {
        break;
      }

      await this.processEvent(event);
      processed += 1;
    }
    return processed;
  }

  private async claimNext(): Promise<AuditOutboxDocument | null> {
    const now = new Date();
    return this.outboxModel
      .findOneAndUpdate(
        {
          status: AuditOutboxStatus.PENDING,
          nextAttemptAt: { $lte: now },
        },
        {
          $set: {
            status: AuditOutboxStatus.PROCESSING,
            lockedAt: now,
          },
          $inc: { attempts: 1 },
        },
        {
          returnDocument: 'after',
          sort: { createdAt: 1, _id: 1 },
        },
      )
      .exec();
  }

  private async processEvent(event: AuditOutboxDocument): Promise<void> {
    try {
      await this.auditModel.create({
        ...event.payload,
        eventId: event.eventId,
      });
      await this.markProcessed(event);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        await this.markProcessed(event);
        return;
      }

      await this.scheduleRetry(event, error);
    }
  }

  private async markProcessed(event: AuditOutboxDocument): Promise<void> {
    await this.outboxModel
      .updateOne(
        {
          _id: event._id,
          status: AuditOutboxStatus.PROCESSING,
        },
        {
          $set: {
            status: AuditOutboxStatus.PROCESSED,
            processedAt: new Date(),
          },
          $unset: {
            lockedAt: '',
            lastErrorCode: '',
          },
        },
      )
      .exec();
  }

  private async scheduleRetry(
    event: AuditOutboxDocument,
    error: unknown,
  ): Promise<void> {
    const dead = event.attempts >= this.maxAttempts;
    const errorCode = getErrorCode(error);
    const delay = Math.min(
      MAX_BACKOFF_MS,
      1000 * 2 ** Math.max(0, event.attempts - 1),
    );

    await this.outboxModel
      .updateOne(
        {
          _id: event._id,
          status: AuditOutboxStatus.PROCESSING,
        },
        {
          $set: {
            status: dead ? AuditOutboxStatus.DEAD : AuditOutboxStatus.PENDING,
            nextAttemptAt: new Date(Date.now() + delay),
            lastErrorCode: errorCode,
          },
          $unset: { lockedAt: '' },
        },
      )
      .exec();

    const message = `Audit outbox event ${event.eventId} failed (${errorCode}), attempt ${event.attempts}`;
    if (dead) {
      this.logger.error(`${message}; moved to dead-letter state`);
    } else {
      this.logger.warn(message);
    }
  }

  private async releaseStaleLocks(): Promise<void> {
    const staleBefore = new Date(Date.now() - this.lockTimeoutMs);
    await this.outboxModel
      .updateMany(
        {
          status: AuditOutboxStatus.PROCESSING,
          lockedAt: { $lt: staleBefore },
        },
        {
          $set: {
            status: AuditOutboxStatus.PENDING,
            nextAttemptAt: new Date(),
            lastErrorCode: 'stale_lock_recovered',
          },
          $unset: { lockedAt: '' },
        },
      )
      .exec();
  }
}

function readPositiveNumber(
  configService: ConfigService,
  key: string,
  fallback: number,
): number {
  const value = Number(configService.get<string>(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function getErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code).slice(0, 100);
  }

  return error instanceof Error
    ? error.name.slice(0, 100)
    : 'UnknownAuditOutboxError';
}
