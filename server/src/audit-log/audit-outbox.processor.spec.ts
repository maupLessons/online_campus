import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { AuditOutboxProcessor } from './audit-outbox.processor';
import {
  AuditOutboxDocument,
  AuditOutboxStatus,
} from './schemas/audit-outbox.schema';
import { AuditLogDocument } from './schemas/audit-log.schema';

type QueryResult<T> = {
  exec: jest.Mock<Promise<T>, []>;
};

type UpdateDocument = {
  $set?: Record<string, unknown>;
  $unset?: Record<string, unknown>;
};

function queryResult<T>(value: T): QueryResult<T> {
  return {
    exec: jest.fn<Promise<T>, []>().mockResolvedValue(value),
  };
}

function createEvent(attempts = 1): AuditOutboxDocument {
  return {
    _id: new Types.ObjectId(),
    eventId: 'event-1',
    payload: {
      userId: null,
      userLogin: 'admin',
      action: 'user.status.change',
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      result: 'success',
    },
    status: AuditOutboxStatus.PROCESSING,
    attempts,
    nextAttemptAt: new Date(),
  } as unknown as AuditOutboxDocument;
}

describe('AuditOutboxProcessor', () => {
  const outboxModel = {
    findOneAndUpdate: jest.fn<
      QueryResult<AuditOutboxDocument | null>,
      [Record<string, unknown>, UpdateDocument, Record<string, unknown>]
    >(),
    updateOne: jest.fn<
      QueryResult<{ modifiedCount: number }>,
      [Record<string, unknown>, UpdateDocument]
    >(),
    updateMany: jest.fn<
      QueryResult<{ modifiedCount: number }>,
      [Record<string, unknown>, UpdateDocument]
    >(),
  };
  const auditModel = {
    create: jest.fn<
      Promise<Record<string, never>>,
      [Record<string, unknown>]
    >(),
  };
  const configService = {
    get: jest.fn<string | undefined, [string]>(),
  };
  let processor: AuditOutboxProcessor;
  let loggerErrorSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    configService.get.mockReturnValue(undefined);
    outboxModel.updateMany.mockReturnValue(queryResult({ modifiedCount: 0 }));
    outboxModel.updateOne.mockReturnValue(queryResult({ modifiedCount: 1 }));

    processor = new AuditOutboxProcessor(
      outboxModel as unknown as Model<AuditOutboxDocument>,
      auditModel as unknown as Model<AuditLogDocument>,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('delivers a claimed event to the append-only audit collection', async () => {
    const event = createEvent();
    outboxModel.findOneAndUpdate
      .mockReturnValueOnce(queryResult(event))
      .mockReturnValueOnce(queryResult(null));
    auditModel.create.mockResolvedValue({});

    await expect(processor.flushAvailable()).resolves.toBe(1);

    expect(auditModel.create).toHaveBeenCalledWith({
      ...event.payload,
      eventId: event.eventId,
    });
    const [filter, update] = outboxModel.updateOne.mock.calls[0];
    expect(filter).toEqual({
      _id: event._id,
      status: AuditOutboxStatus.PROCESSING,
    });
    expect(update.$set?.status).toBe(AuditOutboxStatus.PROCESSED);
  });

  it('treats an existing event id as an idempotent delivery', async () => {
    const event = createEvent();
    outboxModel.findOneAndUpdate
      .mockReturnValueOnce(queryResult(event))
      .mockReturnValueOnce(queryResult(null));
    auditModel.create.mockRejectedValue({ code: 11000 });

    await expect(processor.flushAvailable()).resolves.toBe(1);

    const [filter, update] = outboxModel.updateOne.mock.calls[0];
    expect(filter._id).toEqual(event._id);
    expect(update.$set?.status).toBe(AuditOutboxStatus.PROCESSED);
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('schedules a failed event for exponential retry', async () => {
    const event = createEvent(2);
    outboxModel.findOneAndUpdate
      .mockReturnValueOnce(queryResult(event))
      .mockReturnValueOnce(queryResult(null));
    auditModel.create.mockRejectedValue(
      Object.assign(new Error('temporary failure'), { code: 'ETIMEDOUT' }),
    );

    await expect(processor.flushAvailable()).resolves.toBe(1);

    const [filter, update] = outboxModel.updateOne.mock.calls[0];
    expect(filter._id).toEqual(event._id);
    expect(update.$set?.status).toBe(AuditOutboxStatus.PENDING);
    expect(update.$set?.lastErrorCode).toBe('ETIMEDOUT');
    expect(loggerWarnSpy).toHaveBeenCalled();
  });

  it('moves exhausted events into the dead-letter state', async () => {
    const event = createEvent(10);
    outboxModel.findOneAndUpdate
      .mockReturnValueOnce(queryResult(event))
      .mockReturnValueOnce(queryResult(null));
    auditModel.create.mockRejectedValue(new Error('persistent failure'));

    await expect(processor.flushAvailable()).resolves.toBe(1);

    const [filter, update] = outboxModel.updateOne.mock.calls[0];
    expect(filter._id).toEqual(event._id);
    expect(update.$set?.status).toBe(AuditOutboxStatus.DEAD);
    expect(update.$set?.lastErrorCode).toBe('Error');
    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});
