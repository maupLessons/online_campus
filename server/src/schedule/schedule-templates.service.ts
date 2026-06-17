import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { toId } from '../common/utils/to-id.util';
import { CourseAssignment, CourseAssignmentDocument } from '../courses/schemas';
import { Classroom } from '../references/schemas';
import {
  CreateScheduleTemplateDto,
  ScheduleTemplateDto,
  UpdateScheduleTemplateDto,
} from './dto';
import { ScheduleEntryType } from './schedule.enums';
import {
  ScheduleTemplate,
  ScheduleTemplateDocument,
  ScheduleTemplateStatus,
} from './schemas';
import { ScheduleMapper } from './schedule.mapper';
import { CourseAssignmentLean, ScheduleTemplateLean } from './schedule.types';

@Injectable()
export class ScheduleTemplatesService {
  constructor(
    @InjectModel(ScheduleTemplate.name)
    private readonly scheduleTemplateModel: Model<ScheduleTemplateDocument>,
    @InjectModel(CourseAssignment.name)
    private readonly courseAssignmentModel: Model<CourseAssignmentDocument>,
    @InjectModel(Classroom.name)
    private readonly classroomModel: Model<Classroom>,
    private readonly mapper: ScheduleMapper,
  ) {}

  async findTemplates(): Promise<ScheduleTemplateDto[]> {
    const templates = await this.scheduleTemplateModel
      .find({ status: { $ne: ScheduleTemplateStatus.ARCHIVED } } as never)
      .sort({ dayOfWeek: 1, startTime: 1, title: 1 })
      .populate(this.mapper.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleTemplateLean[]>()
      .exec();

    return templates.map((template) => this.mapper.formatTemplate(template));
  }

  async createTemplate(
    dto: CreateScheduleTemplateDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleTemplateDto> {
    const payload = await this.normalizeTemplatePayload(dto);
    const template = await this.scheduleTemplateModel.create({
      title: dto.title.trim(),
      courseAssignment: new Types.ObjectId(payload.courseAssignmentId),
      classroom: payload.classroomId
        ? new Types.ObjectId(payload.classroomId)
        : null,
      dayOfWeek: dto.dayOfWeek,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: ScheduleTemplateStatus.ACTIVE,
      createdBy: this.mapper.toOptionalObjectId(user?.sub),
    } as never);

    const created = await this.getTemplateOrThrow(toId(template._id));
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_TEMPLATE_CREATE,
      targetEntity: 'schedule-template',
      targetId: created.id,
      details: { after: created },
    });
    return created;
  }

  async updateTemplate(
    id: string,
    dto: UpdateScheduleTemplateDto,
    audit?: DomainAuditContext,
  ): Promise<ScheduleTemplateDto> {
    const current = await this.getTemplateOrThrow(id);
    const existing = await this.scheduleTemplateModel
      .findById(this.mapper.toObjectId(id))
      .exec();

    if (!existing) {
      throw new NotFoundException('Шаблон розкладу не знайдено');
    }

    const payload = await this.normalizeTemplatePayload({
      courseAssignmentId:
        dto.courseAssignmentId ?? toId(existing.courseAssignment),
      classroomId:
        dto.classroomId !== undefined
          ? dto.classroomId
          : existing.classroom
            ? toId(existing.classroom)
            : undefined,
      startTime: dto.startTime ?? existing.startTime,
      endTime: dto.endTime ?? existing.endTime,
      type: dto.type ?? existing.type,
    });

    existing.set({
      title: (dto.title ?? existing.title).trim(),
      courseAssignment: new Types.ObjectId(payload.courseAssignmentId),
      classroom: payload.classroomId
        ? new Types.ObjectId(payload.classroomId)
        : null,
      dayOfWeek: dto.dayOfWeek ?? existing.dayOfWeek,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: dto.status ?? existing.status,
    });
    await existing.save();

    const updated = await this.getTemplateOrThrow(id);
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_TEMPLATE_UPDATE,
      targetEntity: 'schedule-template',
      targetId: id,
      details: { before: current, after: updated },
    });
    return updated;
  }

  async deleteTemplate(
    id: string,
    audit?: DomainAuditContext,
  ): Promise<{ archived: true }> {
    const current = await this.getTemplateOrThrow(id);
    const result = await this.scheduleTemplateModel
      .updateOne(
        { _id: this.mapper.toObjectId(id) } as never,
        { $set: { status: ScheduleTemplateStatus.ARCHIVED } } as never,
      )
      .exec();

    if (result.matchedCount === 0) {
      throw new NotFoundException('Шаблон розкладу не знайдено');
    }

    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_TEMPLATE_DELETE,
      targetEntity: 'schedule-template',
      targetId: id,
      details: { before: current },
    });
    return { archived: true };
  }

  async getTemplateOrThrow(id: string): Promise<ScheduleTemplateDto> {
    const template = await this.scheduleTemplateModel
      .findById(this.mapper.toObjectId(id))
      .populate(this.mapper.courseAssignmentPopulate())
      .populate({ path: 'classroom', select: 'building roomNumber type' })
      .lean<ScheduleTemplateLean>()
      .exec();

    if (!template || template.status === ScheduleTemplateStatus.ARCHIVED) {
      throw new NotFoundException('Шаблон розкладу не знайдено');
    }

    return this.mapper.formatTemplate(template);
  }

  getTemplateDates(
    startDate: string,
    endDate: string,
    dayOfWeek: number,
  ): string[] {
    const start = this.mapper.normalizeDate(startDate);
    const end = this.mapper.normalizeDate(endDate);

    if (start > end) {
      throw new BadRequestException(
        'Дата завершення повинна бути не раніше дати початку',
      );
    }

    const maxRangeMs = 366 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > maxRangeMs) {
      throw new BadRequestException(
        'Період застосування шаблону не може перевищувати 366 днів',
      );
    }

    const dates: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const isoDay = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
      if (isoDay === dayOfWeek) {
        dates.push(this.mapper.formatDate(cursor));
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return dates;
  }

  private async normalizeTemplatePayload(payload: {
    courseAssignmentId: string;
    classroomId?: string;
    startTime: string;
    endTime: string;
    type: ScheduleEntryType;
  }): Promise<{
    courseAssignmentId: string;
    classroomId?: string;
    startTime: string;
    endTime: string;
    type: ScheduleEntryType;
  }> {
    if (payload.startTime >= payload.endTime) {
      throw new BadRequestException(
        'Час завершення повинен бути пізніше часу початку',
      );
    }

    await this.getCourseAssignmentOrThrow(payload.courseAssignmentId);
    await this.assertClassroomExists(payload.classroomId);

    return {
      ...payload,
      classroomId: payload.classroomId || undefined,
    };
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
}
