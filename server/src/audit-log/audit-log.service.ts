import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { PaginatedDto } from '../common/dto/paginated.dto';
import { transformToDtoArray } from '../common/utils/transform.util';
import { AuditLogEntryDto, AuditLogQueryDto } from './dto';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';

export interface AuditLogEntry {
  id?: string;
  timestamp?: Date;
  userId: string | null;
  userLogin: string;
  userRole?: string;
  action: string;
  targetEntity?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  result: 'success' | 'failure';
  requestId?: string;
}

const SENSITIVE_KEY_PATTERN =
  /(password|token|secret|authorization|cookie|session|credential|api[-_]?key)/i;
const MAX_DETAIL_DEPTH = 4;
const MAX_DETAIL_STRING_LENGTH = 500;
const MAX_DETAIL_ARRAY_ITEMS = 25;
const MAX_DETAIL_OBJECT_KEYS = 60;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truncateString(value: string): string {
  if (value.length <= MAX_DETAIL_STRING_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_DETAIL_STRING_LENGTH)}...`;
}

function sanitizeAuditValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'string') {
    return truncateString(value);
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  if (depth >= MAX_DETAIL_DEPTH) {
    return '[Truncated]';
  }

  if (seen.has(value)) {
    return '[Circular]';
  }

  seen.add(value);

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .slice(0, MAX_DETAIL_ARRAY_ITEMS)
      .map((item) => sanitizeAuditValue(item, depth + 1, seen));

    seen.delete(value);
    return sanitizedArray;
  }

  const sanitized: Record<string, unknown> = {};

  Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_DETAIL_OBJECT_KEYS)
    .forEach(([key, item]) => {
      sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizeAuditValue(item, depth + 1, seen);
    });

  seen.delete(value);
  return sanitized;
}

function sanitizeAuditDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized = sanitizeAuditValue(details, 0, new WeakSet<object>());
  return sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)
    ? (sanitized as Record<string, unknown>)
    : undefined;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectModel(AuditLog.name)
    private readonly auditModel: Model<AuditLogDocument>,
  ) {}

  async findAll(
    query: AuditLogQueryDto,
  ): Promise<PaginatedDto<AuditLogEntryDto>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const filter = this.buildFilter(query);
    const skip = (page - 1) * limit;

    const [docs, totalDocs] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ timestamp: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.auditModel.countDocuments(filter).exec(),
    ]);

    const totalPages = totalDocs === 0 ? 0 : Math.ceil(totalDocs / limit);

    return {
      docs: transformToDtoArray(AuditLogEntryDto, docs),
      totalDocs,
      limit,
      page,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1 && totalPages > 0,
      nextPage: page < totalPages ? page + 1 : undefined,
      prevPage: page > 1 && totalPages > 0 ? page - 1 : undefined,
    };
  }

  logAction(entry: AuditLogEntry): void {
    const logMessage = `[AUDIT] [ReqID: ${entry.requestId || '-'}] Action: ${entry.action} | User: ${
      entry.userLogin || 'Guest'
    } | IP: ${entry.ipAddress} | Result: ${entry.result}`;

    if (entry.result === 'success') {
      this.logger.log(logMessage);
    } else {
      this.logger.warn(logMessage);
    }

    void this.auditModel
      .create({
        timestamp: entry.timestamp ?? new Date(),
        userId: entry.userId,
        userLogin: entry.userLogin || 'unknown',
        userRole: entry.userRole,
        action: entry.action,
        targetEntity: entry.targetEntity,
        targetId: entry.targetId,
        details: sanitizeAuditDetails(entry.details),
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        result: entry.result,
        requestId: entry.requestId,
      })
      .catch((err: unknown) => {
        if (this.isMongoClientClosedError(err)) {
          return;
        }

        this.logger.error(
          '[AUDIT] Failed to persist audit log to DB',
          err as object,
        );
      });
  }

  private isMongoClientClosedError(error: unknown): boolean {
    return error instanceof Error && error.name === 'MongoClientClosedError';
  }

  private buildFilter(query: AuditLogQueryDto): QueryFilter<AuditLogDocument> {
    const filter: QueryFilter<AuditLogDocument> = {};

    if (query.userId) {
      filter.userId = query.userId;
    }

    if (query.userLogin) {
      filter.userLogin = {
        $regex: escapeRegex(query.userLogin),
        $options: 'i',
      };
    }

    if (query.userRole) {
      filter.userRole = query.userRole;
    }

    if (query.action) {
      filter.action = { $regex: escapeRegex(query.action), $options: 'i' };
    }

    if (query.targetEntity) {
      filter.targetEntity = query.targetEntity;
    }

    if (query.targetId) {
      filter.targetId = query.targetId;
    }

    if (query.result) {
      filter.result = query.result;
    }

    if (query.requestId) {
      filter.requestId = query.requestId;
    }

    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;

    if (from && to && from > to) {
      throw new BadRequestException(
        'Початкова дата фільтра не може бути пізнішою за кінцеву',
      );
    }

    if (from || to) {
      const timestampFilter: Record<string, Date> = {};
      if (from) timestampFilter.$gte = from;
      if (to) timestampFilter.$lte = to;
      filter.timestamp = timestampFilter;
    }

    return filter;
  }
}
