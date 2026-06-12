import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter } from 'mongoose';
import { randomUUID } from 'crypto';
import { PaginatedDto } from '../common/dto/paginated.dto';
import { transformToDtoArray } from '../common/utils/transform.util';
import { AuditLogEntryDto, AuditLogQueryDto } from './dto';
import { AuditLog, AuditLogDocument } from './schemas/audit-log.schema';
import {
  AuditOutbox,
  AuditOutboxDocument,
} from './schemas/audit-outbox.schema';

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
const MAX_DETAIL_NODES = 500;
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

type SanitizeState = {
  seen: WeakSet<object>;
  nodes: number;
};

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
  state: SanitizeState,
): unknown {
  state.nodes += 1;
  if (state.nodes > MAX_DETAIL_NODES) {
    return '[Truncated]';
  }

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

  if (state.seen.has(value)) {
    return '[Circular]';
  }

  state.seen.add(value);

  if (Array.isArray(value)) {
    const sanitizedArray = value
      .slice(0, MAX_DETAIL_ARRAY_ITEMS)
      .map((item) => sanitizeAuditValue(item, depth + 1, state));

    state.seen.delete(value);
    return sanitizedArray;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(
    value as Record<string, unknown>,
  ).slice(0, MAX_DETAIL_OBJECT_KEYS)) {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      continue;
    }

    sanitized[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[REDACTED]'
      : sanitizeAuditValue(item, depth + 1, state);
  }

  state.seen.delete(value);
  return sanitized;
}

function sanitizeAuditDetails(
  details?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!details) {
    return undefined;
  }

  const sanitized = sanitizeAuditValue(details, 0, {
    seen: new WeakSet<object>(),
    nodes: 0,
  });
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
    @InjectModel(AuditOutbox.name)
    private readonly outboxModel: Model<AuditOutboxDocument>,
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

  async logAction(entry: AuditLogEntry): Promise<void> {
    const eventId = entry.id ?? randomUUID();
    const persistedEntry = {
      eventId,
      timestamp: entry.timestamp ?? new Date(),
      userId: normalizeOptionalString(entry.userId, 100) ?? null,
      userLogin: normalizeString(entry.userLogin || 'unknown', 100),
      userRole: normalizeOptionalString(entry.userRole, 50),
      action: normalizeString(entry.action, 120),
      targetEntity: normalizeOptionalString(entry.targetEntity, 80),
      targetId: normalizeOptionalString(entry.targetId, 100),
      details: sanitizeAuditDetails(entry.details),
      ipAddress: normalizeString(entry.ipAddress, 64),
      userAgent: normalizeString(entry.userAgent, 500),
      result: entry.result,
      requestId: normalizeOptionalString(entry.requestId, 100),
    };
    const logMessage = `[AUDIT] [ReqID: ${
      persistedEntry.requestId || '-'
    }] Action: ${persistedEntry.action} | User: ${
      persistedEntry.userLogin
    } | IP: ${persistedEntry.ipAddress} | Result: ${persistedEntry.result}`;

    await this.outboxModel.create({
      eventId,
      payload: persistedEntry,
    });

    if (entry.result === 'success') {
      this.logger.log(`${logMessage} | Queued: ${eventId}`);
    } else {
      this.logger.warn(`${logMessage} | Queued: ${eventId}`);
    }
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

function normalizeString(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength) || 'unknown';
}

function normalizeOptionalString(
  value: string | null | undefined,
  maxLength: number,
): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().slice(0, maxLength);
  return normalized || undefined;
}
