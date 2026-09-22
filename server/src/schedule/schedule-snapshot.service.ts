import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { MaupStudentApiClient } from '../integrations/maup-student-api/maup-student-api.client';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { AcademicTermDocument } from '../academic-terms/schemas/academic-term.schema';
import {
  hashWireResponse,
  mapMaupScheduleToSnapshot,
} from './maup-schedule.mapper';
import {
  ScheduleSnapshot,
  ScheduleSnapshotDocument,
  ScheduleSnapshotEntry,
} from './schemas/schedule-snapshot.schema';

export type SnapshotKey = {
  groupCode: string;
  termId: string;
  isExamSession: boolean;
};
export type SnapshotLookup = {
  studentId?: string;
  recordBookNumber?: string;
  actorUserId: string;
};
export type SnapshotResult = {
  snapshot: ScheduleSnapshotDocument | null;
  stale: boolean;
  refreshed: boolean;
};
export type SnapshotRefreshEvent = {
  key: SnapshotKey;
  previousEntries: ScheduleSnapshotEntry[] | null;
  previousFetchedAt: Date | null;
  nextEntries: ScheduleSnapshotEntry[];
};
type RefreshListener = (event: SnapshotRefreshEvent) => Promise<void>;

@Injectable()
export class ScheduleSnapshotService {
  private readonly logger = new Logger(ScheduleSnapshotService.name);
  private readonly ttlMs: number;
  private readonly inFlight = new Map<string, Promise<SnapshotResult>>();
  private refreshListener: RefreshListener | null = null;

  constructor(
    @InjectModel(ScheduleSnapshot.name)
    private readonly model: Model<ScheduleSnapshotDocument>,
    private readonly maupClient: MaupStudentApiClient,
    config: ConfigService,
  ) {
    const ttl = Number(config.get<string>('SCHEDULE_CACHE_TTL_MS') ?? 900_000);
    this.ttlMs = Number.isFinite(ttl) && ttl >= 0 ? ttl : 900_000;
  }

  setRefreshListener(listener: RefreshListener): void {
    this.refreshListener = listener;
  }

  /** `MAUP_API_ENABLED`; needed by the admin refresh to distinguish "disabled" from "error" (§7.4). */
  isEnabled(): boolean {
    return this.maupClient.getDiagnostics().enabled;
  }

  getCached(key: SnapshotKey): Promise<ScheduleSnapshotDocument | null> {
    return this.model.findOne(this.filter(key)).exec();
  }

  findByTeacher(
    termId: string,
    teacherExternalId: string,
    isExamSession: boolean,
  ): Promise<ScheduleSnapshotDocument[]> {
    return this.model
      .find({
        term: new Types.ObjectId(termId),
        isExamSession,
        'entries.teacherExternalId': teacherExternalId,
      })
      .exec();
  }

  async getOrRefresh(
    key: SnapshotKey,
    term: AcademicTermDocument,
    lookup: SnapshotLookup,
    options: { force?: boolean } = {},
  ): Promise<SnapshotResult> {
    const existing = await this.getCached(key);
    const enabled = this.maupClient.getDiagnostics().enabled;

    if (!enabled) {
      return { snapshot: existing, stale: false, refreshed: false };
    }
    // force — for the admin refresh (Task 6 refreshGroup/refreshAll): TTL is ignored,
    // but the document in the DB isn't mutated (otherwise, if the API fails, the snapshot would stay stale forever).
    if (
      !options.force &&
      existing &&
      Date.now() - existing.fetchedAt.getTime() < this.ttlMs
    ) {
      return { snapshot: existing, stale: false, refreshed: false };
    }

    const lockKey = this.lockKey(key);
    const pending = this.inFlight.get(lockKey);
    if (pending) return pending;

    const task = this.refresh(key, term, lookup, existing).finally(() =>
      this.inFlight.delete(lockKey),
    );
    this.inFlight.set(lockKey, task);
    return task;
  }

  private async refresh(
    key: SnapshotKey,
    term: AcademicTermDocument,
    lookup: SnapshotLookup,
    existing: ScheduleSnapshotDocument | null,
  ): Promise<SnapshotResult> {
    // One try/catch around the whole "API → mapper → DB write" chain: a write error (not E11000)
    // or a mapper error on a malformed payload degrades the same way as the API itself failing — to a stale
    // snapshot with a log, not a 500 for everyone waiting on this lock.
    try {
      const response = await this.maupClient.getScheduleByStudentLookup(
        {
          ...(lookup.studentId ? { studentId: lookup.studentId } : {}),
          ...(lookup.recordBookNumber
            ? { recordBookNumber: lookup.recordBookNumber }
            : {}),
        },
        {
          semester: term.maupSemester,
          academicYear: term.maupAcademicYear,
          examSession: key.isExamSession,
        },
      );

      const rawHash = hashWireResponse(response);
      const now = new Date();
      const previousFetchedAt = existing?.fetchedAt ?? null;

      if (existing && existing.rawHash === rawHash) {
        const touched = await this.write(key, existing, { fetchedAt: now });
        if (!touched) {
          // Another process beat us to this exact touch: re-read its result instead of
          // silently treating the cache as fresh — and compute staleness from its fetchedAt, not 'false'.
          const current = await this.getCached(key);
          return {
            snapshot: current,
            stale: this.isStale(current),
            refreshed: false,
          };
        }
        return { snapshot: touched, stale: false, refreshed: true };
      }

      const mapped = mapMaupScheduleToSnapshot(response, {
        isExamSession: key.isExamSession,
      });
      // The cache key is the CAMPUS group code (`profile.group.code`), which is also used for reads.
      // The code from the API response is only compared: writing under it would mean an eternal cache miss
      // if the notations differ (case, spaces).
      if (
        mapped.groupCode &&
        mapped.groupCode.trim().toLowerCase() !==
          key.groupCode.trim().toLowerCase()
      ) {
        this.logger.warn(
          `MAUP group code mismatch: campus '${key.groupCode}' vs API '${mapped.groupCode}'; stored under the campus code`,
        );
      }
      const next = await this.write(key, existing, {
        groupCode: key.groupCode,
        term: new Types.ObjectId(key.termId),
        isExamSession: key.isExamSession,
        fetchedAt: now,
        fetchedByUserId: new Types.ObjectId(lookup.actorUserId),
        periodFrom: mapped.periodFrom,
        periodTo: mapped.periodTo,
        entries: mapped.entries,
        rawHash,
      });

      if (!next) {
        // Another process beat us to it: the snapshot is already updated, it did the diff. That snapshot
        // may itself have gone stale by now (a race doesn't guarantee freshness), so we compute staleness
        // with the same isStale() as in the touch-CAS branch above, not by hardcoding 'false'.
        const current = await this.getCached(key);
        return {
          snapshot: current,
          stale: this.isStale(current),
          refreshed: false,
        };
      }

      if (this.refreshListener) {
        await this.refreshListener({
          key,
          previousEntries: existing?.entries ?? null,
          previousFetchedAt,
          nextEntries: mapped.entries,
        }).catch((err: unknown) =>
          this.logger.error(`Schedule diff listener failed: ${String(err)}`),
        );
      }
      return { snapshot: next, stale: false, refreshed: true };
    } catch (error: unknown) {
      if (error instanceof MaupStudentApiError) {
        this.logger.warn(
          `Schedule refresh failed for ${key.groupCode}: ${error.kind}`,
        );
      } else {
        this.logger.error(
          `Schedule refresh failed for ${key.groupCode}: ${String(error)}`,
        );
      }
      return { snapshot: existing, stale: true, refreshed: false };
    }
  }

  isStale(doc: ScheduleSnapshotDocument | null): boolean {
    return !doc || Date.now() - doc.fetchedAt.getTime() >= this.ttlMs;
  }

  /**
   * Writes the snapshot under the unique index {groupCode, term, isExamSession}.
   * - no snapshot existed yet → upsert (the only case where insert is legitimate);
   * - a snapshot existed → conditional update on `fetchedAt` WITHOUT upsert: if another process
   *   already updated the document, the filter doesn't match, `null` is returned — and that means
   *   "we were beaten to it", not a reason to insert, which would fail with E11000 and a 500 (see review M4).
   * A race between two concurrent upserts is still possible → E11000 is caught and treated the same way.
   */
  private async write(
    key: SnapshotKey,
    existing: ScheduleSnapshotDocument | null,
    patch: Record<string, unknown>,
  ): Promise<ScheduleSnapshotDocument | null> {
    try {
      if (!existing) {
        return await this.model
          .findOneAndUpdate(
            this.filter(key),
            { $set: patch },
            {
              upsert: true,
              returnDocument: 'after',
              setDefaultsOnInsert: true,
              runValidators: true,
            },
          )
          .exec();
      }
      return await this.model
        .findOneAndUpdate(
          { ...this.filter(key), fetchedAt: existing.fetchedAt },
          { $set: patch },
          { returnDocument: 'after', upsert: false, runValidators: true },
        )
        .exec();
    } catch (error: unknown) {
      if (isDuplicateKeyError(error)) {
        this.logger.debug(
          `Concurrent snapshot write for ${this.lockKey(key)}; re-reading`,
        );
        return null;
      }
      throw error;
    }
  }

  private filter(key: SnapshotKey) {
    return {
      groupCode: key.groupCode,
      term: new Types.ObjectId(key.termId),
      isExamSession: key.isExamSession,
    };
  }

  private lockKey(key: SnapshotKey): string {
    return `${key.termId}:${key.groupCode}:${key.isExamSession ? 1 : 0}`;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 11000
  );
}
