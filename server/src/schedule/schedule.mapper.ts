import { BadRequestException, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { toId } from '../common/utils/to-id.util';
import { ScheduleEntryDto, ScheduleTemplateDto } from './dto';
import { ScheduleChangeAction } from './schedule.enums';
import { ScheduleChangeHistory, ScheduleEntryDocument } from './schemas';
import {
  ClassroomLean,
  CourseAssignmentLean,
  CourseLean,
  EntityRef,
  GroupLean,
  NormalizedSchedulePayload,
  ScheduleEntryLean,
  ScheduleTemplateLean,
  UserLean,
} from './schedule.types';

@Injectable()
export class ScheduleMapper {
  formatEntry(entry: ScheduleEntryLean): ScheduleEntryDto {
    const assignment = this.asCourseAssignment(entry.courseAssignment);
    const course = this.asCourse(assignment?.course);
    const group = this.asGroup(assignment?.group);
    const teacher = this.asUser(assignment?.teacher);
    const classroom = this.asClassroom(entry.classroom);
    const teacherName = this.formatPersonName(teacher);

    return {
      id: this.idToString(entry),
      courseAssignmentId: this.idToString(assignment),
      classroomId: this.idToString(classroom) || undefined,
      date: this.formatDate(entry.date),
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      status: entry.status,
      changeReason: entry.changeReason,
      cancelledAt: this.toIsoString(entry.cancelledAt),
      rescheduledAt: this.toIsoString(entry.rescheduledAt),
      substitutedAt: this.toIsoString(entry.substitutedAt),
      changeHistory: (entry.changeHistory ?? []).map((history) => ({
        action: history.action,
        reason: history.reason,
        actorId: this.idToString(history.actorId) || undefined,
        actorLogin: history.actorLogin,
        changedAt: this.toIsoString(history.changedAt) ?? '',
      })),
      courseName: course?.name,
      courseCode: course?.code,
      groupCode: group?.code,
      teacherId: this.idToString(teacher) || undefined,
      teacherName,
      classroom: classroom
        ? `${classroom.building ?? ''}, ауд. ${
            classroom.roomNumber ?? ''
          }`.trim()
        : 'Онлайн',
      createdAt: entry.createdAt?.toISOString(),
      updatedAt: entry.updatedAt?.toISOString(),
    };
  }

  formatTemplate(template: ScheduleTemplateLean): ScheduleTemplateDto {
    const assignment = this.asCourseAssignment(template.courseAssignment);
    const course = this.asCourse(assignment?.course);
    const group = this.asGroup(assignment?.group);
    const teacher = this.asUser(assignment?.teacher);
    const classroom = this.asClassroom(template.classroom);

    return {
      id: this.idToString(template),
      title: template.title,
      courseAssignmentId: this.idToString(assignment),
      classroomId: this.idToString(classroom) || undefined,
      dayOfWeek: template.dayOfWeek,
      startTime: template.startTime,
      endTime: template.endTime,
      type: template.type,
      status: template.status,
      courseName: course?.name,
      courseCode: course?.code,
      groupCode: group?.code,
      teacherName: this.formatPersonName(teacher),
      classroom: classroom
        ? `${classroom.building ?? ''}, ауд. ${
            classroom.roomNumber ?? ''
          }`.trim()
        : 'Онлайн',
      createdAt: template.createdAt?.toISOString(),
      updatedAt: template.updatedAt?.toISOString(),
    };
  }

  courseAssignmentPopulate() {
    return {
      path: 'courseAssignment',
      populate: [
        { path: 'course', select: 'name code' },
        { path: 'group', select: 'code' },
        { path: 'teacher', select: 'firstName lastName middleName' },
      ],
    };
  }

  normalizeDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException('Дата повинна мати формат YYYY-MM-DD');
    }

    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || this.formatDate(date) !== value) {
      throw new BadRequestException('Некоректна дата');
    }

    return date;
  }

  buildDateRange(
    startDate?: string,
    endDate?: string,
  ): { $gte?: Date; $lt?: Date } {
    const range: { $gte?: Date; $lt?: Date } = {};

    if (startDate) {
      range.$gte = this.normalizeDate(startDate);
    }
    if (endDate) {
      range.$lt = this.getDayRange(this.normalizeDate(endDate)).end;
    }
    if (range.$gte && range.$lt && range.$gte >= range.$lt) {
      throw new BadRequestException(
        'Дата завершення повинна бути не раніше дати початку',
      );
    }
    if (
      range.$gte &&
      range.$lt &&
      range.$lt.getTime() - range.$gte.getTime() > 366 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'Період запиту розкладу не може перевищувати 366 днів',
      );
    }

    return range;
  }

  getDayRange(date: Date): { start: Date; end: Date } {
    const start = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  }

  formatDate(value: Date | string): string {
    if (typeof value === 'string') {
      return value.slice(0, 10);
    }
    return value.toISOString().slice(0, 10);
  }

  toIsoString(value?: Date | string): string | undefined {
    if (!value) {
      return undefined;
    }
    if (typeof value === 'string') {
      return value;
    }
    return value.toISOString();
  }

  toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }
    return new Types.ObjectId(id);
  }

  idToString(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return toId(value);
  }

  toOptionalObjectId(id?: string): Types.ObjectId | null {
    if (!id || !Types.ObjectId.isValid(id)) {
      return null;
    }
    return new Types.ObjectId(id);
  }

  appendHistory(
    entry: ScheduleEntryDocument,
    action: ScheduleChangeAction,
    reason: string | undefined,
    actor: AuthenticatedUser | undefined,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
  ): void {
    entry.changeHistory = [
      ...(entry.changeHistory ?? []),
      this.buildHistoryEntry(action, reason, actor, before, after),
    ].slice(-50);
  }

  buildHistoryEntry(
    action: ScheduleChangeAction,
    reason: string | undefined,
    actor: AuthenticatedUser | undefined,
    before: Record<string, unknown> | undefined,
    after: Record<string, unknown> | undefined,
  ): ScheduleChangeHistory {
    return {
      action,
      reason,
      actorId: this.toOptionalObjectId(actor?.sub) as never,
      actorLogin: actor?.login,
      changedAt: new Date(),
      before,
      after,
    };
  }

  toPayloadAuditSnapshot(
    payload: NormalizedSchedulePayload,
  ): Record<string, unknown> {
    return {
      courseAssignmentId: payload.courseAssignmentId,
      classroomId: payload.classroomId,
      date: payload.dateString,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: payload.status,
    };
  }

  toAuditSnapshot(entry: ScheduleEntryDto): Record<string, unknown> {
    return {
      courseAssignmentId: entry.courseAssignmentId,
      courseCode: entry.courseCode,
      courseName: entry.courseName,
      groupCode: entry.groupCode,
      teacherId: entry.teacherId,
      classroomId: entry.classroomId,
      date: entry.date,
      startTime: entry.startTime,
      endTime: entry.endTime,
      type: entry.type,
      status: entry.status,
      changeReason: entry.changeReason,
    };
  }

  asCourseAssignment(
    value: CourseAssignmentLean | EntityRef | undefined,
  ): CourseAssignmentLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  asClassroom(
    value: ClassroomLean | EntityRef | null | undefined,
  ): ClassroomLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asCourse(
    value: CourseLean | EntityRef | undefined,
  ): CourseLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asGroup(
    value: GroupLean | EntityRef | undefined,
  ): GroupLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private asUser(
    value: UserLean | EntityRef | undefined,
  ): UserLean | undefined {
    return this.isObjectRecord(value) ? value : undefined;
  }

  private isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private formatPersonName(person?: UserLean): string | undefined {
    if (!person) {
      return undefined;
    }

    const name = [person.lastName, person.firstName, person.middleName]
      .filter(Boolean)
      .join(' ');

    return name || undefined;
  }
}
