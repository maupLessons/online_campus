import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { AcademicTermsService } from '../academic-terms/academic-terms.service';
import { AcademicTermDocument } from '../academic-terms/schemas/academic-term.schema';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { toId } from '../common/utils/to-id.util';
import { CourseAssignment, CourseAssignmentDocument } from '../courses/schemas';
import { Group } from '../references/schemas';
import { UsersService } from '../users/users.service';
import {
  ScheduleEntryDto,
  ScheduleGroupResponseDto,
  ScheduleRangeQueryDto,
  ScheduleResponseDto,
  TodayScheduleResponseDto,
} from './dto';
import { OnlineLessonLinksService } from './online-lesson-links.service';
import { addDaysIso, normalizeSubjectKey, todayKyiv } from './schedule-keys';
import { ScheduleSnapshotService } from './schedule-snapshot.service';
import { ScheduleSnapshotEntry } from './schemas/schedule-snapshot.schema';

const MAX_RANGE_DAYS = 62;
const GROUP_VIEW_ROLES = [
  Role.ADMIN,
  Role.RECTOR,
  Role.PRESIDENT,
  Role.DEAN,
  Role.DEPARTMENT_HEAD,
];

@Injectable()
export class ScheduleReaderService {
  constructor(
    private readonly snapshots: ScheduleSnapshotService,
    private readonly links: OnlineLessonLinksService,
    private readonly users: UsersService,
    private readonly terms: AcademicTermsService,
    @InjectModel(CourseAssignment.name)
    private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
    private readonly access: AcademicAccessService,
  ) {}

  async findMy(
    user: AuthenticatedUser,
    query: ScheduleRangeQueryDto,
    isExamSession: boolean,
  ): Promise<ScheduleResponseDto> {
    const range = this.resolveRange(query);
    const term = await this.terms.getCurrent();
    if (!term)
      return { entries: [], meta: { stale: false, reason: 'no_current_term' } };
    const termMeta = this.termMeta(term);

    if (user.role === Role.TEACHER) {
      const { externalTeacherId } = await this.users.getTeacherProfileRefs(
        user.sub,
      );
      // Spec §5.3: a separate reason so the UI shows "your account isn't linked to the MAUP schedule",
      // not "no profile".
      if (!externalTeacherId)
        return {
          entries: [],
          meta: {
            term: termMeta,
            stale: false,
            reason: 'no_external_teacher_id',
          },
        };
      const docs = await this.snapshots.findByTeacher(
        String(term._id),
        externalTeacherId,
        isExamSession,
      );
      const entries: ScheduleEntryDto[] = [];
      for (const doc of docs) {
        const own = doc.entries.filter(
          (e) => e.teacherExternalId === externalTeacherId,
        );
        const linkMap = this.links.overlay(
          own,
          await this.links.loadForGroup(String(term._id), doc.groupCode),
        );
        entries.push(...this.toDto(own, doc.groupCode, linkMap, range));
      }
      entries.sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      );
      const fetchedAt = docs.length
        ? new Date(
            Math.min(...docs.map((d) => d.fetchedAt.getTime())),
          ).toISOString()
        : undefined;
      return {
        entries,
        meta: {
          term: termMeta,
          fetchedAt,
          stale: docs.some((d) => this.snapshots.isStale(d)),
          ...(docs.length ? {} : { reason: 'no_snapshot' as const }),
        },
      };
    }

    const profile = await this.users.getActiveStudentProfile(user.sub);
    if (!profile)
      return {
        entries: [],
        meta: { term: termMeta, stale: false, reason: 'no_active_profile' },
      };
    const key = {
      groupCode: profile.group.code,
      termId: String(term._id),
      isExamSession,
    };
    const result = await this.snapshots.getOrRefresh(key, term, {
      studentId: profile.externalStudentId,
      recordBookNumber: profile.recordBookNumber,
      actorUserId: user.sub,
    });
    if (!result.snapshot)
      return {
        entries: [],
        meta: { term: termMeta, stale: true, reason: 'no_snapshot' },
      };
    const linkMap = this.links.overlay(
      result.snapshot.entries,
      await this.links.loadForGroup(String(term._id), key.groupCode),
    );
    return {
      entries: this.toDto(
        result.snapshot.entries,
        key.groupCode,
        linkMap,
        range,
      ),
      meta: {
        term: termMeta,
        fetchedAt: result.snapshot.fetchedAt.toISOString(),
        stale: result.stale,
      },
    };
  }

  /** §5.3a. The date is computed by the server in Europe/Kyiv; the client passes no parameters. */
  async findToday(user: AuthenticatedUser): Promise<TodayScheduleResponseDto> {
    const today = todayKyiv();
    const [session, lessons] = await Promise.all([
      this.findMy(user, { from: today, to: today }, true),
      this.findMy(user, { from: today, to: today }, false),
    ]);
    // An empty day — 200 with two empty arrays and NO reason; reason is set only when
    // the data fundamentally doesn't exist (no term / profile / snapshot) — spec §5.3a.
    const reason = lessons.meta.reason ?? session.meta.reason;
    const fetchedAt = [lessons.meta.fetchedAt, session.meta.fetchedAt]
      .filter((v): v is string => Boolean(v))
      .sort()[0];
    return {
      date: today,
      lessons: lessons.entries,
      session: session.entries,
      meta: {
        ...(lessons.meta.term ? { term: lessons.meta.term } : {}),
        ...(fetchedAt ? { fetchedAt } : {}),
        stale: lessons.meta.stale || session.meta.stale,
        ...(reason ? { reason } : {}),
      },
    };
  }

  /**
   * §5.1 + §8. Scope: groupCode → Group (404), then AcademicAccessService.canAccessGroup.
   * Review M3: a role-only check isn't enough — any dean could read any group.
   * The response is an allowlist §5.3b (ScheduleGroupResponseDto), not a lean() document.
   */
  async findForGroup(
    user: AuthenticatedUser,
    groupCode: string,
    query: ScheduleRangeQueryDto,
    isExamSession: boolean,
  ): Promise<ScheduleGroupResponseDto> {
    if (!GROUP_VIEW_ROLES.includes(user.role)) {
      throw new ForbiddenException('Немає доступу до кешу розкладу групи');
    }
    const range = this.resolveRange(query);
    const term = await this.terms.requireCurrent();
    const group = await this.groupModel
      .findOne({ code: groupCode })
      .select('_id')
      .lean()
      .exec();
    if (!group) throw new NotFoundException('Групу не знайдено');
    if (!(await this.access.canAccessGroup(String(group._id), user))) {
      throw new ForbiddenException('Група поза вашою зоною відповідальності');
    }

    const snap = await this.snapshots.getCached({
      groupCode,
      termId: String(term._id),
      isExamSession,
    });
    if (!snap) {
      return {
        groupCode,
        isExamSession,
        periodFrom: null,
        periodTo: null,
        fetchedAt: null,
        stale: false,
        entries: [],
      };
    }
    const linkMap = await this.groupLinkMap(
      user,
      String(term._id),
      groupCode,
      snap.entries,
    );
    return {
      groupCode,
      isExamSession,
      periodFrom: snap.periodFrom ?? null,
      periodTo: snap.periodTo ?? null,
      fetchedAt: snap.fetchedAt.toISOString(),
      stale: this.snapshots.isStale(snap),
      entries: this.toDto(snap.entries, groupCode, linkMap, range),
    };
  }

  /**
   * §8: admin/rector/president/dean see onlineUrl in full; department_head — only for
   * records whose subjectKey belongs to a discipline of their department (review m6).
   */
  private async groupLinkMap(
    user: AuthenticatedUser,
    termId: string,
    groupCode: string,
    entries: ScheduleSnapshotEntry[],
  ): Promise<Map<string, string>> {
    const full = this.links.overlay(
      entries,
      await this.links.loadForGroup(termId, groupCode),
    );
    if (user.role !== Role.DEPARTMENT_HEAD) return full;

    const { department } = await this.users.getTeacherProfileRefs(user.sub);
    if (!department) return new Map();
    const assignments = await this.assignmentModel
      .find({
        term: new Types.ObjectId(termId),
      } as unknown as QueryFilter<CourseAssignmentDocument>)
      .populate([
        { path: 'group', select: 'code' },
        { path: 'course', select: 'name externalSubjectId department' },
      ])
      .lean()
      .exec();
    const allowed = new Set<string>();
    for (const a of assignments) {
      const g = a.group as { code?: string } | undefined;
      const c = a.course as
        | { name?: string; externalSubjectId?: string; department?: unknown }
        | undefined;
      if (
        !c ||
        g?.code !== groupCode ||
        String(c.department) !== String(department)
      )
        continue;
      if (c.externalSubjectId) allowed.add(c.externalSubjectId);
      allowed.add(normalizeSubjectKey(undefined, c.name ?? ''));
    }
    const scoped = new Map<string, string>();
    for (const e of entries) {
      const url = full.get(e.key);
      if (url && allowed.has(e.subjectKey)) scoped.set(e.key, url);
    }
    return scoped;
  }

  /**
   * §5.2a. `null` — no snapshot (schedule doesn't exist → the caller sets meta.scheduleUnavailable: true);
   * `[]` — a snapshot exists, but there are no upcoming lessons for this discipline (scheduleUnavailable: false).
   * The two cases can't be flattened into `[]`: on the discipline card (plan 05) these are different states.
   * The method doesn't call the MAUP API — a refresh is triggered only by a user request (§7.1).
   */
  async findUpcomingForAssignment(
    assignmentId: string,
    limit = 5,
  ): Promise<ScheduleEntryDto[] | null> {
    const assignment = await this.assignmentModel
      .findById(assignmentId)
      .populate([
        { path: 'course', select: 'name externalSubjectId' },
        { path: 'group', select: 'code' },
      ])
      .lean()
      .exec();
    if (!assignment) return null;
    const course = assignment.course as {
      name?: string;
      externalSubjectId?: string;
    };
    const group = assignment.group as { code?: string };
    if (!group.code) return null; // group wasn't resolved → there can be no snapshot
    const snap = await this.snapshots.getCached({
      groupCode: group.code,
      termId: toId(assignment.term),
      isExamSession: false,
    });
    if (!snap) return null;
    const wanted = new Set(
      [
        course.externalSubjectId,
        normalizeSubjectKey(undefined, course.name ?? ''),
      ].filter(Boolean),
    );
    const today = todayKyiv();
    const own = snap.entries
      .filter((e) => wanted.has(e.subjectKey) && e.date >= today)
      .sort((a, b) =>
        `${a.date} ${a.startTime}`.localeCompare(`${b.date} ${b.startTime}`),
      )
      .slice(0, limit);
    const linkMap = this.links.overlay(
      own,
      await this.links.loadForGroup(toId(assignment.term), group.code),
    );
    return this.toDto(own, group.code, linkMap, null);
  }

  private resolveRange(query: ScheduleRangeQueryDto): {
    from: string;
    to: string;
  } {
    const from = query.from ?? todayKyiv();
    const to = query.to ?? addDaysIso(from, 6);
    if (to < from)
      throw new BadRequestException('Дата завершення раніше за дату початку');
    const days = (Date.parse(to) - Date.parse(from)) / 86_400_000;
    if (days > MAX_RANGE_DAYS)
      throw new BadRequestException(
        `Діапазон не може перевищувати ${MAX_RANGE_DAYS} днів`,
      );
    return { from, to };
  }

  private toDto(
    entries: ScheduleSnapshotEntry[],
    groupCode: string,
    linkMap: Map<string, string>,
    range: { from: string; to: string } | null,
  ): ScheduleEntryDto[] {
    return entries
      .filter((e) => !range || (e.date >= range.from && e.date <= range.to))
      .map((e) => ({
        id: e.key,
        date: e.date,
        startTime: e.startTime,
        endTime: e.endTime,
        courseTitle: e.courseTitle,
        subjectKey: e.subjectKey,
        type: e.type,
        controlType: e.controlType,
        teacherName: e.teacherName,
        classroom: e.classroom || undefined,
        onlineFormat: !e.classroom,
        onlineUrl: linkMap.get(e.key),
        groupCode,
      }));
  }

  private termMeta(term: AcademicTermDocument) {
    return {
      id: String(term._id),
      academicYear: term.academicYear,
      termNumber: term.termNumber,
    };
  }
}
