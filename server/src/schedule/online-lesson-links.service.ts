import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { Role } from '../common/types/roles.enum';
import { CourseAssignment, CourseAssignmentDocument } from '../courses/schemas';
import { User, UserDocument } from '../users/schemas';
import { UpsertOnlineLinkDto } from './dto/upsert-online-link.dto';
import { normalizeSubjectKey } from './schedule-keys';
import {
  OnlineLessonLink,
  OnlineLessonLinkDocument,
} from './schemas/online-lesson-link.schema';
import {
  ScheduleSnapshot,
  ScheduleSnapshotDocument,
  ScheduleSnapshotEntry,
} from './schemas/schedule-snapshot.schema';

@Injectable()
export class OnlineLessonLinksService {
  constructor(
    @InjectModel(OnlineLessonLink.name)
    private readonly linkModel: Model<OnlineLessonLinkDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly assignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(ScheduleSnapshot.name)
    private readonly snapshotModel: Model<ScheduleSnapshotDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Spec §8. ONLY the `teacher` role (Р12) has the right, and only for the specific combination
   * {term, teacher, group.code, subjectKey} — an object-level check, not "does any assignment exist".
   * `findOne({term, teacher})` would return an arbitrary document among several of the teacher's assignments
   * and produce a false 403 (review M2), so we take all of the teacher's assignments in the term and look for a match.
   */
  async assertCanManage(
    user: AuthenticatedUser,
    termId: string,
    groupCode: string,
    subjectKey: string,
  ): Promise<void> {
    if (user.role !== Role.TEACHER) {
      throw new ForbiddenException('Онлайн-посилання задає лише викладач');
    }
    const term = new Types.ObjectId(termId);

    // The filter is typed as Record<string, unknown> (as in AcademicAccessService.buildCourseAssignmentFilter):
    // `CourseAssignment.term` is a union `ObjectId | AcademicTerm`, and mongoose's FilterQuery doesn't resolve
    // for an object literal with such a field.
    const assignmentFilter: Record<string, unknown> = {
      term,
      teacher: new Types.ObjectId(user.sub),
    };
    const assignments = await this.assignmentModel
      .find(assignmentFilter)
      .populate([
        { path: 'group', select: 'code' },
        { path: 'course', select: 'name externalSubjectId' },
      ])
      .lean()
      .exec();
    if (
      assignments.some((a) =>
        this.assignmentMatches(
          a as unknown as Record<string, unknown>,
          groupCode,
          subjectKey,
        ),
      )
    )
      return;

    const actor = await this.userModel
      .findById(user.sub)
      .select('teacherProfile')
      .lean()
      .exec();
    const ext = actor?.teacherProfile?.externalTeacherId;
    if (ext) {
      const snap = await this.snapshotModel
        .findOne({ term, groupCode, isExamSession: false })
        .select('entries')
        .lean()
        .exec();
      if (
        snap?.entries.some(
          (e) => e.subjectKey === subjectKey && e.teacherExternalId === ext,
        )
      )
        return;
    }
    throw new ForbiddenException('Ви не викладаєте цю дисципліну в цій групі');
  }

  private assignmentMatches(
    assignment: Record<string, unknown>,
    groupCode: string,
    subjectKey: string,
  ): boolean {
    const group = assignment.group as { code?: string } | undefined;
    const course = assignment.course as
      { name?: string; externalSubjectId?: string } | undefined;
    if (!group?.code || !course) return false;
    if (group.code.trim().toLowerCase() !== groupCode.trim().toLowerCase())
      return false;
    // Primary key — Course.externalSubjectId (field owned by plan 05), fallback — normalize(name).
    return (
      (Boolean(course.externalSubjectId) &&
        course.externalSubjectId === subjectKey) ||
      normalizeSubjectKey(undefined, course.name ?? '') === subjectKey
    );
  }

  async upsert(
    dto: UpsertOnlineLinkDto,
    user: AuthenticatedUser,
    termId: string,
    audit?: DomainAuditContext,
  ) {
    await this.assertCanManage(user, termId, dto.groupCode, dto.subjectKey);
    const filter = {
      term: new Types.ObjectId(termId),
      groupCode: dto.groupCode,
      subjectKey: dto.subjectKey,
      date: dto.date ?? null,
      startTime: dto.date ? (dto.startTime ?? null) : null,
    };
    // Fix round 1 (minor): we store the canonical URL form (new URL(...).href), not the raw string.
    const canonicalUrl = new URL(dto.url).href;
    const doc = await this.linkModel
      .findOneAndUpdate(
        filter,
        {
          $set: { url: canonicalUrl, updatedBy: new Types.ObjectId(user.sub) },
          $setOnInsert: { createdBy: new Types.ObjectId(user.sub) },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_ONLINE_LINK_SET,
      targetEntity: 'online-lesson-link',
      targetId: String(doc._id),
      // Spec §5.2: only the host goes into the log, the full URL is not in the audit.
      details: {
        term: termId,
        groupCode: dto.groupCode,
        subjectKey: dto.subjectKey,
        date: dto.date ?? null,
        startTime: dto.date ? (dto.startTime ?? null) : null,
        urlHost: urlHostOf(dto.url),
      },
    });
    return doc;
  }

  async remove(
    id: string,
    user: AuthenticatedUser,
    audit?: DomainAuditContext,
  ): Promise<void> {
    const link = await this.linkModel.findById(id).lean().exec();
    if (!link) throw new NotFoundException('Посилання не знайдено');
    await this.assertCanManage(
      user,
      String(link.term),
      link.groupCode,
      link.subjectKey,
    );
    // Spec §8: DELETE additionally requires createdBy == user.
    if (String(link.createdBy) !== user.sub) {
      throw new ForbiddenException('Видалити посилання може лише його автор');
    }
    await this.linkModel.deleteOne({ _id: link._id }).exec();
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_ONLINE_LINK_DELETED,
      targetEntity: 'online-lesson-link',
      targetId: id,
      details: {
        term: String(link.term),
        groupCode: link.groupCode,
        subjectKey: link.subjectKey,
        date: link.date ?? null,
        startTime: link.startTime ?? null,
        urlHost: urlHostOf(link.url),
      },
    });
  }

  listMine(user: AuthenticatedUser, termId: string) {
    return this.linkModel
      .find({
        term: new Types.ObjectId(termId),
        createdBy: new Types.ObjectId(user.sub),
      })
      .sort({ groupCode: 1, subjectKey: 1 })
      .lean()
      .exec();
  }

  loadForGroup(termId: string, groupCode: string) {
    return this.linkModel
      .find({ term: new Types.ObjectId(termId), groupCode })
      .lean()
      .exec();
  }

  overlay(
    entries: ScheduleSnapshotEntry[],
    links: OnlineLessonLink[],
  ): Map<string, string> {
    const bySubject = new Map<string, string>();
    const byDate = new Map<string, string>();
    const byPair = new Map<string, string>();
    for (const l of links) {
      if (l.date && l.startTime)
        byPair.set(`${l.subjectKey}|${l.date}|${l.startTime}`, l.url);
      else if (l.date) byDate.set(`${l.subjectKey}|${l.date}`, l.url);
      else bySubject.set(l.subjectKey, l.url);
    }
    const result = new Map<string, string>();
    for (const e of entries) {
      const url =
        byPair.get(`${e.subjectKey}|${e.date}|${e.startTime}`) ??
        byDate.get(`${e.subjectKey}|${e.date}`) ??
        bySubject.get(e.subjectKey);
      if (url) result.set(e.key, url);
    }
    return result;
  }
}

function urlHostOf(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
