import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { AcademicTermDocument } from '../academic-terms/schemas/academic-term.schema';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { DomainAuditContext } from '../audit-log/audit-context';
import { SpreadsheetExportArtifact } from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { Group } from '../references/schemas';
import { StudentProfile, User, UserDocument } from '../users/schemas';
import { activeStudentsInGroup } from '../users/student-profile.filters';
import {
  ScheduleEntryDto,
  ScheduleExportQueryDto,
  ScheduleGroupResponseDto,
  ScheduleRangeQueryDto,
  ScheduleResponseDto,
  TodayScheduleResponseDto,
} from './dto';
import { ScheduleExportService } from './schedule-export.service';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleSnapshotService } from './schedule-snapshot.service';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly reader: ScheduleReaderService,
    private readonly exporter: ScheduleExportService,
    private readonly snapshots: ScheduleSnapshotService,
    private readonly terms: AcademicTermsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
  ) {}

  findMy(user: AuthenticatedUser, query: ScheduleRangeQueryDto) {
    return this.reader.findMy(user, query, false);
  }

  findSession(user: AuthenticatedUser, query: ScheduleRangeQueryDto) {
    return this.reader.findMy(user, query, true);
  }

  findToday(user: AuthenticatedUser): Promise<TodayScheduleResponseDto> {
    return this.reader.findToday(user);
  }

  findForGroup(
    user: AuthenticatedUser,
    groupCode: string,
    query: ScheduleRangeQueryDto,
    session: boolean,
  ): Promise<ScheduleGroupResponseDto> {
    return this.reader.findForGroup(user, groupCode, query, session);
  }

  // §5.2a: `null` = no snapshot (scheduleUnavailable), `[]` = snapshot exists, no lessons.
  // The type matches the optional port from plan 05 (`courses/courses/upcoming-lessons.port.ts`).
  findUpcomingForAssignment(
    assignmentId: string,
    limit = 5,
  ): Promise<ScheduleEntryDto[] | null> {
    return this.reader.findUpcomingForAssignment(assignmentId, limit);
  }

  async export(
    user: AuthenticatedUser,
    query: ScheduleExportQueryDto,
  ): Promise<SpreadsheetExportArtifact> {
    const { format, locale, session, ...range } = query;
    const response: ScheduleResponseDto = await this.reader.findMy(
      user,
      range,
      session === 'true',
    );
    return this.exporter.export(
      response.entries,
      format,
      locale,
      session === 'true',
    );
  }

  /**
   * Admin, §5.1 + §7.1: force-refreshes the group's snapshot on behalf of the first active student.
   * `session` not set → both snapshots are pulled (lessons + session).
   * The TTL is ignored via the `force` flag, and NOT by mutating `fetchedAt` in the DB: otherwise, if the API failed,
   * the snapshot would stay marked stale forever and every subsequent student request would hit the API
   * (review m7).
   */
  async refreshGroup(
    user: AuthenticatedUser,
    groupCode: string,
    session: boolean | undefined,
    audit?: DomainAuditContext,
  ): Promise<ScheduleGroupResponseDto> {
    if (user.role !== Role.ADMIN) throw new ForbiddenException();
    const term = await this.terms.requireCurrent();
    const group = await this.groupModel
      .findOne({ code: groupCode })
      .select('_id')
      .lean()
      .exec();
    if (!group) throw new NotFoundException('Групу не знайдено');

    const outcome = await this.refreshOne(
      groupCode,
      group._id,
      term,
      user.sub,
      session === undefined ? [false, true] : [session],
    );
    if (
      outcome.status === 'skipped' &&
      outcome.reason === 'no_source_student'
    ) {
      throw new NotFoundException(
        'У групі немає активних студентів для запиту до API',
      );
    }
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_SNAPSHOT_REFRESH,
      targetEntity: 'schedule-snapshot',
      targetId: groupCode,
      details: {
        term: String(term._id),
        status: outcome.status,
        reason: outcome.reason ?? null,
      },
    });
    return this.reader.findForGroup(user, groupCode, {}, session ?? false);
  }

  /**
   * Admin, §5.1 + §7.1: sequential pass over all groups of the current term, both snapshots.
   * This compensates for the on-demand model: without it, the teacher's view is empty until some
   * student of the group has opened the schedule (§7.1, criterion §10.14). A failure in one group doesn't interrupt the pass.
   */
  async refreshAll(
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<{
    groups: Array<{
      groupCode: string;
      status: 'updated' | 'skipped' | 'failed';
      reason?: string;
    }>;
  }> {
    if (user.role !== Role.ADMIN) throw new ForbiddenException();
    const term = await this.terms.requireCurrent();
    const groups = await this.groupModel
      .find()
      .select('_id code')
      .lean()
      .exec();
    const result: Array<{
      groupCode: string;
      status: 'updated' | 'skipped' | 'failed';
      reason?: string;
    }> = [];
    for (const group of groups) {
      const outcome = await this.refreshOne(
        group.code,
        group._id,
        term,
        user.sub,
        [false, true],
      );
      result.push({ groupCode: group.code, ...outcome });
    }
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_SNAPSHOT_REFRESH,
      targetEntity: 'schedule-snapshot',
      targetId: String(term._id),
      details: {
        updated: result.filter((r) => r.status === 'updated').length,
        skipped: result.filter((r) => r.status === 'skipped').length,
        failed: result.filter((r) => r.status === 'failed').length,
      },
    });
    return { groups: result };
  }

  private async refreshOne(
    groupCode: string,
    groupId: Types.ObjectId,
    term: AcademicTermDocument,
    actorUserId: string,
    sessions: boolean[],
  ): Promise<{ status: 'updated' | 'skipped' | 'failed'; reason?: string }> {
    // §7.4: with the integration disabled we pull nothing, but we also don't fail —
    // the admin page must stay functional in a test env too.
    if (!this.snapshots.isEnabled())
      return { status: 'skipped', reason: 'api_disabled' };

    // Contract of plan 01, rule 3: selecting group students only via activeStudentsInGroup.
    // §7.1: we take the FIRST active student of the group with a non-empty externalStudentId — not just
    // the first one found (review I2): findOne could return a candidate without a MAUP id and wrongly
    // skip the group, even though other students in the group had externalStudentId.
    const students = await this.userModel
      .find({ status: 'active', ...activeStudentsInGroup(groupId) })
      .select('studentProfiles')
      .lean()
      .exec();
    let profile: StudentProfile | undefined;
    for (const candidate of students) {
      profile = candidate.studentProfiles?.find(
        (p) =>
          toId(p.group) === String(groupId) &&
          p.status === 'active' &&
          Boolean(p.externalStudentId),
      );
      if (profile) break;
    }
    if (!profile) return { status: 'skipped', reason: 'no_source_student' };

    for (const isExamSession of sessions) {
      const res = await this.snapshots.getOrRefresh(
        { groupCode, termId: String(term._id), isExamSession },
        term,
        {
          studentId: profile.externalStudentId,
          recordBookNumber: profile.recordBookNumber,
          actorUserId,
        },
        { force: true },
      );
      if (res.stale && !res.refreshed)
        return { status: 'failed', reason: 'upstream_error' };
    }
    return { status: 'updated' };
  }
}
