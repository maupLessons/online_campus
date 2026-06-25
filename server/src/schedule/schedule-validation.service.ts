import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CourseAssignment, CourseAssignmentDocument } from '../courses/schemas';
import { Classroom } from '../references/schemas';
import { ScheduleEntryStatus, ScheduleEntryType } from './schedule.enums';
import { ScheduleEntry, ScheduleEntryDocument } from './schemas';
import { ScheduleMapper } from './schedule.mapper';
import {
  CourseAssignmentLean,
  NormalizedSchedulePayload,
  ScheduleConflict,
  ScheduleEntryLean,
  ScheduleFilter,
} from './schedule.types';

@Injectable()
export class ScheduleValidationService {
  constructor(
    @InjectModel(ScheduleEntry.name)
    private readonly scheduleEntryModel: Model<ScheduleEntryDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
    private readonly mapper: ScheduleMapper,
  ) {}

  async normalizePayload(payload: {
    courseAssignmentId: string;
    classroomId?: string;
    date: string;
    startTime: string;
    endTime: string;
    type: ScheduleEntryType;
    status: ScheduleEntryStatus;
    onlineUrl?: string;
  }): Promise<NormalizedSchedulePayload> {
    if (payload.startTime >= payload.endTime) {
      throw new BadRequestException(
        'Час завершення повинен бути пізніше часу початку',
      );
    }

    const date = this.mapper.normalizeDate(payload.date);
    const assignment = await this.getCourseAssignmentOrThrow(
      payload.courseAssignmentId,
    );
    await this.assertClassroomExists(payload.classroomId);

    return {
      ...payload,
      date,
      dateString: this.mapper.formatDate(date),
      classroomId: payload.classroomId || undefined,
      onlineUrl: this.normalizeOnlineUrl(payload.onlineUrl),
      assignment,
    };
  }

  async assertNoConflicts(
    payload: NormalizedSchedulePayload,
    excludeEntryId?: string,
  ): Promise<void> {
    if (payload.status === ScheduleEntryStatus.CANCELLED) {
      return;
    }

    const range = this.mapper.getDayRange(payload.date);
    const filter: ScheduleFilter = {
      date: { $gte: range.start, $lt: range.end },
      status: { $ne: ScheduleEntryStatus.CANCELLED },
      startTime: { $lt: payload.endTime },
      endTime: { $gt: payload.startTime },
    };

    if (excludeEntryId) {
      filter._id = { $ne: this.mapper.toObjectId(excludeEntryId) };
    }

    const overlappingEntries = await this.scheduleEntryModel
      .find(filter as never)
      .populate(this.mapper.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleEntryLean[]>()
      .exec();

    const conflicts = this.collectConflicts(payload, overlappingEntries);

    if (conflicts.length > 0) {
      throw new ConflictException({
        message: 'Конфлікт розкладу',
        conflicts,
      });
    }
  }

  private collectConflicts(
    payload: NormalizedSchedulePayload,
    overlappingEntries: ScheduleEntryLean[],
  ): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const teacherId = this.mapper.idToString(payload.assignment.teacher);
    const groupId = this.mapper.idToString(payload.assignment.group);

    for (const entry of overlappingEntries) {
      const assignment = this.mapper.asCourseAssignment(entry.courseAssignment);
      const conflictBase = {
        entryId: this.mapper.idToString(entry),
        date: this.mapper.formatDate(entry.date),
        startTime: entry.startTime,
        endTime: entry.endTime,
      };

      if (
        teacherId &&
        this.mapper.idToString(assignment?.teacher) === teacherId
      ) {
        conflicts.push({
          ...conflictBase,
          type: 'teacher',
          message: `Викладач зайнятий: ${entry.startTime}-${entry.endTime}`,
        });
      }

      if (
        payload.classroomId &&
        this.mapper.idToString(entry.classroom) === payload.classroomId
      ) {
        conflicts.push({
          ...conflictBase,
          type: 'classroom',
          message: `Аудиторія зайнята: ${entry.startTime}-${entry.endTime}`,
        });
      }

      if (groupId && this.mapper.idToString(assignment?.group) === groupId) {
        conflicts.push({
          ...conflictBase,
          type: 'group',
          message: `Група зайнята: ${entry.startTime}-${entry.endTime}`,
        });
      }
    }

    return conflicts;
  }

  private async getCourseAssignmentOrThrow(
    id: string,
  ): Promise<CourseAssignmentLean> {
    const assignment = await this.courseAssignmentModel
      .findById(this.mapper.toObjectId(id))
      .populate(this.mapper.courseAssignmentPopulate().populate)
      .lean<CourseAssignmentLean>()
      .exec();

    if (!assignment) {
      throw new NotFoundException('Призначення курсу не знайдено');
    }

    return assignment;
  }

  private async assertClassroomExists(classroomId?: string): Promise<void> {
    if (!classroomId) {
      return;
    }

    const classroomExists = await this.classroomModel
      .exists({ _id: this.mapper.toObjectId(classroomId) })
      .exec();

    if (!classroomExists) {
      throw new NotFoundException('Аудиторію не знайдено');
    }
  }

  private normalizeOnlineUrl(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }
}
