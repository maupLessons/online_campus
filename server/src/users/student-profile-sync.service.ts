import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, StudentProfile } from './schemas';
import { Role } from '../common/types/roles.enum';
import { Group } from '../references/schemas';
import { MaupStudentApiClient } from '../integrations/maup-student-api/maup-student-api.client';
import { MaupStudentApiError } from '../integrations/maup-student-api/maup-student-api.error';
import { mapMaupStudentProfile } from '../integrations/maup-student-api/maup-student-api.mapper';
import {
  MaupStudentProfile,
  MaupWireObject,
} from '../integrations/maup-student-api/maup-student-api.types';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';

export type SyncTrigger = 'manual' | 'login';
export type SyncSkipReason = 'api_disabled' | 'api_error' | 'empty_source';
export type SyncResult = {
  active: number;
  inactive: number;
  /** Present only when the sync was skipped; the counters are the current state in the database. */
  meta?: { reason: SyncSkipReason };
};

@Injectable()
export class StudentProfileSyncService {
  private readonly logger = new Logger(StudentProfileSyncService.name);
  private readonly ttlMs: number;

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
    private readonly maupClient: MaupStudentApiClient,
    private readonly auditLogService: AuditLogService,
    config: ConfigService,
  ) {
    const hours = Number(config.get<string>('STUDENT_PROFILE_SYNC_TTL_HOURS'));
    this.ttlMs = (Number.isFinite(hours) && hours > 0 ? hours : 24) * 3600_000;
  }

  shouldSyncOnLogin(user: Pick<User, 'studentProfiles'>): boolean {
    const profiles = user.studentProfiles ?? [];
    if (profiles.length === 0) return false;
    const oldest = Math.min(
      ...profiles.map((p) => new Date(p.syncedAt ?? 0).getTime()),
    );
    return Date.now() - oldest > this.ttlMs;
  }

  async syncUser(userId: string, trigger: SyncTrigger): Promise<SyncResult> {
    const user = await this.userModel.findById(userId).exec();
    if (!user || user.role !== Role.STUDENT) return { active: 0, inactive: 0 };

    const countOf = (u: User, reason?: SyncSkipReason): SyncResult => ({
      active: u.studentProfiles.filter((p) => p.status === 'active').length,
      inactive: u.studentProfiles.filter((p) => p.status === 'inactive').length,
      ...(reason ? { meta: { reason } } : {}),
    });

    if (!this.maupClient.getDiagnostics().enabled)
      return countOf(user, 'api_disabled');

    const knownIds = [
      ...new Set(user.studentProfiles.map((p) => p.externalStudentId)),
    ];
    let fetched: MaupStudentProfile[];
    try {
      const responses = await Promise.all(
        knownIds.map((id) => this.maupClient.getStudentInfo(id)),
      );
      fetched = responses
        .flat()
        .map((raw) => mapMaupStudentProfile(raw as MaupWireObject));
    } catch (error) {
      const kind =
        error instanceof MaupStudentApiError ? error.kind : 'unknown';
      this.logger.warn(
        `Student profile sync skipped (${kind}) for user ${userId}`,
      );
      return countOf(user, 'api_error');
    }

    // Guard: all calls succeeded, but no records. This is a transient failure on MAUP's side,
    // not an expulsion. Without this, the loop below would flip ALL profiles to inactive and reset
    // activeStudentProfileId — the student would silently lose schedule, courses, electives, and record book.
    if (fetched.length === 0 && knownIds.length > 0) {
      this.logger.warn(
        `Student profile sync skipped (empty studentinfo response) for user ${userId}`,
      );
      const skipped = countOf(user, 'empty_source');
      await this.auditLogService.logAction({
        userId,
        userLogin: user.login,
        userRole: user.role,
        action: AUDIT_ACTIONS.STUDENT_PROFILE_SYNC,
        targetEntity: 'user',
        targetId: userId,
        result: 'success',
        ipAddress: 'internal',
        userAgent: 'internal',
        details: {
          trigger,
          active: skipped.active,
          inactive: skipped.inactive,
          reason: 'empty_source',
        },
      });
      return skipped;
    }

    const now = new Date();
    const seen = new Set<string>();
    for (const remote of fetched) {
      seen.add(remote.externalStudentId);
      const groupId = await this.resolveGroup(remote.group);
      const existing = user.studentProfiles.find(
        (p) => p.externalStudentId === remote.externalStudentId,
      );
      const patch: Partial<StudentProfile> = {
        group: groupId ?? existing?.group,
        recordBookNumber: remote.recordBookNumber ?? existing?.recordBookNumber,
        year: remote.course ?? existing?.year,
        studyForm: remote.studyForm?.name ?? existing?.studyForm,
        institute: remote.institute?.name ?? existing?.institute,
        specialty: remote.speciality ?? existing?.specialty,
        status: 'active',
        syncedAt: now,
      };
      if (existing) {
        Object.assign(existing, patch);
      } else if (patch.group && patch.recordBookNumber && patch.year) {
        user.studentProfiles.push({
          _id: new Types.ObjectId(),
          externalStudentId: remote.externalStudentId,
          ...patch,
        } as StudentProfile);
      }
      if (remote.firstName && remote.firstName !== user.firstName) {
        this.logger.warn(`Name mismatch with MAUP for user ${userId}`);
      }
    }
    for (const profile of user.studentProfiles) {
      if (!seen.has(profile.externalStudentId)) {
        profile.status = 'inactive';
        profile.syncedAt = now;
      }
    }

    const activeProfiles = user.studentProfiles.filter(
      (p) => p.status === 'active',
    );
    const stillActive = activeProfiles.some((p) =>
      p._id.equals(user.activeStudentProfileId ?? new Types.ObjectId()),
    );
    if (!stillActive)
      user.activeStudentProfileId = activeProfiles[0]?._id ?? null;

    await user.save();
    const result = countOf(user);

    await this.auditLogService.logAction({
      userId,
      userLogin: user.login,
      userRole: user.role,
      action: AUDIT_ACTIONS.STUDENT_PROFILE_SYNC,
      targetEntity: 'user',
      targetId: userId,
      result: 'success',
      ipAddress: 'internal',
      userAgent: 'internal',
      details: { trigger, active: result.active, inactive: result.inactive },
    });
    return result;
  }

  /**
   * We only look up the group by code. It cannot be created: `Group.specialty` is `required: true`
   * (`references/schemas/group.schema.ts:12-17`), and the API doesn't provide the specialty in reference form.
   * No match → warning, the profile keeps its previous group (П3 of the spec).
   */
  private async resolveGroup(group?: {
    externalId?: string;
    name?: string;
  }): Promise<Types.ObjectId | null> {
    const code = group?.name?.trim();
    if (!code) return null;
    const existing = await this.groupModel.findOne({ code }).exec();
    if (!existing) {
      this.logger.warn(
        `MAUP group code "${code}" is not in the campus reference; keeping the previous group`,
      );
      return null;
    }
    return existing._id;
  }
}
