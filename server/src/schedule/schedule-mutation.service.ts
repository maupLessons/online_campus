import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AUDIT_ACTIONS } from '../audit-log/audit-actions';
import { DomainAuditContext } from '../audit-log/audit-context';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { toId } from '../common/utils/to-id.util';
import {
  ApplyScheduleTemplateDto,
  BulkCancelScheduleEntriesDto,
  BulkCreateScheduleEntriesDto,
  CreateScheduleEntryDto,
  RescheduleScheduleEntryDto,
  ScheduleEntryDto,
  ScheduleReasonDto,
  SubstituteScheduleEntryDto,
  UpdateScheduleEntryDto,
} from './dto';
import {
  ScheduleChangeAction,
  ScheduleEntry,
  ScheduleEntryDocument,
  ScheduleEntryStatus,
} from './schemas';
import { ScheduleMapper } from './schedule.mapper';
import { ScheduleNotificationsService } from './schedule-notifications.service';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleTemplatesService } from './schedule-templates.service';
import { ScheduleValidationService } from './schedule-validation.service';
import {
  NormalizedSchedulePayload,
  ScheduleBulkOperationResult,
  ScheduleConflict,
} from './schedule.types';

@Injectable()
export class ScheduleMutationService {
  constructor(
    @InjectModel(ScheduleEntry.name)
    private readonly scheduleEntryModel: Model<ScheduleEntryDocument>,
    private readonly mapper: ScheduleMapper,
    private readonly scheduleReader: ScheduleReaderService,
    private readonly scheduleNotifications: ScheduleNotificationsService,
    private readonly scheduleTemplates: ScheduleTemplatesService,
    private readonly scheduleValidation: ScheduleValidationService,
  ) {}

  async create(
    dto: CreateScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    const payload = await this.normalizeCreatePayload(dto);
    await this.scheduleValidation.assertNoConflicts(payload);

    const created = await this.scheduleEntryModel.create({
      courseAssignment: new Types.ObjectId(payload.courseAssignmentId),
      classroom: payload.classroomId
        ? new Types.ObjectId(payload.classroomId)
        : null,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: payload.status,
      changeHistory: [
        this.mapper.buildHistoryEntry(
          ScheduleChangeAction.CREATED,
          undefined,
          user,
          undefined,
          this.mapper.toPayloadAuditSnapshot(payload),
        ),
      ],
    } as never);

    const entry = await this.scheduleReader.getPopulatedEntryOrThrow(
      toId(created._id),
    );
    await this.scheduleNotifications.notifyScheduleChanged('created', entry);
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_CREATE,
      targetEntity: 'schedule',
      targetId: entry.id,
      details: { after: this.mapper.toAuditSnapshot(entry) },
    });
    return entry;
  }

  async update(
    id: string,
    dto: UpdateScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    const entryId = this.mapper.toObjectId(id);
    const currentEntry = await this.scheduleEntryModel.findById(entryId).exec();

    if (!currentEntry) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    const currentView = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    const payload = await this.normalizeUpdatePayload(currentEntry, dto);
    await this.scheduleValidation.assertNoConflicts(payload, id);

    currentEntry.set({
      courseAssignment: new Types.ObjectId(payload.courseAssignmentId),
      classroom: payload.classroomId
        ? new Types.ObjectId(payload.classroomId)
        : null,
      date: payload.date,
      startTime: payload.startTime,
      endTime: payload.endTime,
      type: payload.type,
      status: payload.status,
      changeReason: dto.changeReason,
      changedBy: this.mapper.toOptionalObjectId(user?.sub),
    });
    currentEntry.changeHistory = [
      ...(currentEntry.changeHistory ?? []),
      this.mapper.buildHistoryEntry(
        ScheduleChangeAction.UPDATED,
        dto.changeReason,
        user,
        this.mapper.toAuditSnapshot(currentView),
        this.mapper.toPayloadAuditSnapshot(payload),
      ),
    ].slice(-50);

    await currentEntry.save();

    const updatedEntry = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    await this.scheduleNotifications.notifyScheduleChanged(
      'updated',
      updatedEntry,
      currentView,
    );
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_UPDATE,
      targetEntity: 'schedule',
      targetId: id,
      details: {
        before: this.mapper.toAuditSnapshot(currentView),
        after: this.mapper.toAuditSnapshot(updatedEntry),
      },
    });
    return updatedEntry;
  }

  async delete(
    id: string,
    audit?: DomainAuditContext,
  ): Promise<{ deleted: true }> {
    const entryId = this.mapper.toObjectId(id);
    const currentView = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    const result = await this.scheduleEntryModel
      .deleteOne({ _id: entryId })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    await this.scheduleNotifications.notifyScheduleChanged(
      'deleted',
      currentView,
    );
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_DELETE,
      targetEntity: 'schedule',
      targetId: id,
      details: { before: this.mapper.toAuditSnapshot(currentView) },
    });
    return { deleted: true };
  }

  async cancel(
    id: string,
    dto: ScheduleReasonDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    const [currentEntry, currentView] = await this.getMutableEntryWithView(id);

    if (currentEntry.status === ScheduleEntryStatus.CANCELLED) {
      return currentView;
    }

    const actorId = this.mapper.toOptionalObjectId(user?.sub);
    const now = new Date();

    currentEntry.set({
      status: ScheduleEntryStatus.CANCELLED,
      changeReason: dto.reason,
      changedBy: actorId,
      cancelledAt: now,
      cancelledBy: actorId,
    });
    this.mapper.appendHistory(
      currentEntry,
      ScheduleChangeAction.CANCELLED,
      dto.reason,
      user,
      this.mapper.toAuditSnapshot(currentView),
      {
        ...this.mapper.toAuditSnapshot(currentView),
        status: ScheduleEntryStatus.CANCELLED,
        changeReason: dto.reason,
      },
    );

    await currentEntry.save();

    const updatedEntry = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    await this.scheduleNotifications.notifyScheduleChanged(
      'cancelled',
      updatedEntry,
      currentView,
    );
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_CANCEL,
      targetEntity: 'schedule',
      targetId: id,
      details: {
        before: this.mapper.toAuditSnapshot(currentView),
        after: this.mapper.toAuditSnapshot(updatedEntry),
        reason: dto.reason,
      },
    });
    return updatedEntry;
  }

  async reschedule(
    id: string,
    dto: RescheduleScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    const [currentEntry, currentView] = await this.getMutableEntryWithView(id);
    const payload = await this.normalizeUpdatePayload(currentEntry, {
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      classroomId: dto.classroomId,
      status: ScheduleEntryStatus.RESCHEDULED,
    });
    await this.scheduleValidation.assertNoConflicts(payload, id);

    await this.applyWorkflowPayload({
      currentEntry,
      currentView,
      payload,
      action: ScheduleChangeAction.RESCHEDULED,
      reason: dto.reason,
      actor: user,
      timestampField: 'rescheduledAt',
      actorField: 'rescheduledBy',
    });

    const updatedEntry = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    await this.scheduleNotifications.notifyScheduleChanged(
      'rescheduled',
      updatedEntry,
      currentView,
    );
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_RESCHEDULE,
      targetEntity: 'schedule',
      targetId: id,
      details: {
        before: this.mapper.toAuditSnapshot(currentView),
        after: this.mapper.toAuditSnapshot(updatedEntry),
        reason: dto.reason,
      },
    });
    return updatedEntry;
  }

  async substitute(
    id: string,
    dto: SubstituteScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    if (
      !dto.courseAssignmentId &&
      dto.classroomId === undefined &&
      !dto.date &&
      !dto.startTime &&
      !dto.endTime &&
      !dto.type
    ) {
      throw new BadRequestException(
        'Для заміни потрібно змінити хоча б один параметр заняття',
      );
    }

    const [currentEntry, currentView] = await this.getMutableEntryWithView(id);
    const payload = await this.normalizeUpdatePayload(currentEntry, {
      courseAssignmentId: dto.courseAssignmentId,
      classroomId: dto.classroomId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type,
      status: ScheduleEntryStatus.SUBSTITUTED,
    });
    await this.scheduleValidation.assertNoConflicts(payload, id);

    await this.applyWorkflowPayload({
      currentEntry,
      currentView,
      payload,
      action: ScheduleChangeAction.SUBSTITUTED,
      reason: dto.reason,
      actor: user,
      timestampField: 'substitutedAt',
      actorField: 'substitutedBy',
    });

    const updatedEntry = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    await this.scheduleNotifications.notifyScheduleChanged(
      'substituted',
      updatedEntry,
      currentView,
    );
    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_SUBSTITUTE,
      targetEntity: 'schedule',
      targetId: id,
      details: {
        before: this.mapper.toAuditSnapshot(currentView),
        after: this.mapper.toAuditSnapshot(updatedEntry),
        reason: dto.reason,
      },
    });
    return updatedEntry;
  }

  async bulkCreate(
    dto: BulkCreateScheduleEntriesDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleBulkOperationResult> {
    const result: ScheduleBulkOperationResult = {
      dryRun: Boolean(dto.dryRun),
      created: 0,
      skipped: 0,
      items: [],
    };

    for (const [index, entryDto] of dto.entries.entries()) {
      try {
        const payload = await this.normalizeCreatePayload(entryDto);
        await this.scheduleValidation.assertNoConflicts(payload);

        if (dto.dryRun) {
          result.items.push({ index, success: true });
          continue;
        }

        const entry = await this.create(entryDto, undefined, user);
        result.created = (result.created ?? 0) + 1;
        result.items.push({ index, id: entry.id, success: true, entry });
      } catch (error) {
        const conflicts = this.extractConflictDetails(error);
        if (!dto.skipConflicts) {
          throw error;
        }

        result.skipped += 1;
        result.items.push({
          index,
          success: false,
          error: this.getErrorMessage(error),
          conflicts,
        });
      }
    }

    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_BULK_CREATE,
      targetEntity: 'schedule',
      details: {
        dryRun: result.dryRun,
        created: result.created,
        skipped: result.skipped,
        total: dto.entries.length,
      },
    });

    return result;
  }

  async bulkCancel(
    dto: BulkCancelScheduleEntriesDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleBulkOperationResult> {
    const result: ScheduleBulkOperationResult = {
      dryRun: false,
      cancelled: 0,
      skipped: 0,
      items: [],
    };

    for (const [index, id] of dto.ids.entries()) {
      try {
        const entry = await this.cancel(id, dto, undefined, user);
        result.cancelled = (result.cancelled ?? 0) + 1;
        result.items.push({ index, id: entry.id, success: true, entry });
      } catch (error) {
        result.skipped += 1;
        result.items.push({
          index,
          id,
          success: false,
          error: this.getErrorMessage(error),
        });
      }
    }

    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_BULK_CANCEL,
      targetEntity: 'schedule',
      details: {
        cancelled: result.cancelled,
        skipped: result.skipped,
        total: dto.ids.length,
        reason: dto.reason,
      },
    });

    return result;
  }

  async applyTemplate(
    id: string,
    dto: ApplyScheduleTemplateDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleBulkOperationResult> {
    const template = await this.scheduleTemplates.getTemplateOrThrow(id);
    const dates = this.scheduleTemplates.getTemplateDates(
      dto.startDate,
      dto.endDate,
      template.dayOfWeek,
    );

    const result = await this.bulkCreate(
      {
        dryRun: dto.dryRun,
        skipConflicts: dto.skipConflicts ?? true,
        entries: dates.map((date) => ({
          courseAssignmentId: template.courseAssignmentId,
          classroomId: template.classroomId,
          date,
          startTime: template.startTime,
          endTime: template.endTime,
          type: template.type,
          status: ScheduleEntryStatus.SCHEDULED,
        })),
      },
      undefined,
      user,
    );

    await audit?.record({
      action: AUDIT_ACTIONS.SCHEDULE_TEMPLATE_APPLY,
      targetEntity: 'schedule-template',
      targetId: id,
      details: {
        dryRun: result.dryRun,
        created: result.created,
        skipped: result.skipped,
        total: dates.length,
        startDate: dto.startDate,
        endDate: dto.endDate,
      },
    });

    return result;
  }

  private async getMutableEntryWithView(
    id: string,
  ): Promise<[ScheduleEntryDocument, ScheduleEntryDto]> {
    const entryId = this.mapper.toObjectId(id);
    const entry = await this.scheduleEntryModel.findById(entryId).exec();

    if (!entry) {
      throw new NotFoundException('Запис розкладу не знайдено');
    }

    const view = await this.scheduleReader.getPopulatedEntryOrThrow(id);
    return [entry, view];
  }

  private async normalizeCreatePayload(
    dto: CreateScheduleEntryDto,
  ): Promise<NormalizedSchedulePayload> {
    return this.scheduleValidation.normalizePayload({
      courseAssignmentId: dto.courseAssignmentId,
      classroomId: dto.classroomId,
      date: dto.date,
      startTime: dto.startTime,
      endTime: dto.endTime,
      type: dto.type,
      status: dto.status ?? ScheduleEntryStatus.SCHEDULED,
    });
  }

  private async normalizeUpdatePayload(
    currentEntry: ScheduleEntryDocument,
    dto: UpdateScheduleEntryDto,
  ): Promise<NormalizedSchedulePayload> {
    const currentClassroomId = currentEntry.classroom
      ? toId(currentEntry.classroom)
      : undefined;

    return this.scheduleValidation.normalizePayload({
      courseAssignmentId:
        dto.courseAssignmentId ?? toId(currentEntry.courseAssignment),
      classroomId:
        dto.classroomId !== undefined ? dto.classroomId : currentClassroomId,
      date: dto.date ?? this.mapper.formatDate(currentEntry.date),
      startTime: dto.startTime ?? currentEntry.startTime,
      endTime: dto.endTime ?? currentEntry.endTime,
      type: dto.type ?? currentEntry.type,
      status: dto.status ?? currentEntry.status,
    });
  }

  private async applyWorkflowPayload(params: {
    currentEntry: ScheduleEntryDocument;
    currentView: ScheduleEntryDto;
    payload: NormalizedSchedulePayload;
    action: ScheduleChangeAction;
    reason: string;
    actor?: AuthenticatedUser;
    timestampField: 'rescheduledAt' | 'substitutedAt';
    actorField: 'rescheduledBy' | 'substitutedBy';
  }): Promise<void> {
    const actorId = this.mapper.toOptionalObjectId(params.actor?.sub);
    const now = new Date();

    params.currentEntry.set({
      courseAssignment: new Types.ObjectId(params.payload.courseAssignmentId),
      classroom: params.payload.classroomId
        ? new Types.ObjectId(params.payload.classroomId)
        : null,
      date: params.payload.date,
      startTime: params.payload.startTime,
      endTime: params.payload.endTime,
      type: params.payload.type,
      status: params.payload.status,
      changeReason: params.reason,
      changedBy: actorId,
      [params.timestampField]: now,
      [params.actorField]: actorId,
    });
    this.mapper.appendHistory(
      params.currentEntry,
      params.action,
      params.reason,
      params.actor,
      this.mapper.toAuditSnapshot(params.currentView),
      this.mapper.toPayloadAuditSnapshot(params.payload),
    );

    await params.currentEntry.save();
  }

  private extractConflictDetails(
    error: unknown,
  ): ScheduleConflict[] | undefined {
    if (!(error instanceof ConflictException)) {
      return undefined;
    }

    const response = error.getResponse();
    if (
      typeof response === 'object' &&
      response !== null &&
      Array.isArray((response as { conflicts?: unknown }).conflicts)
    ) {
      return (response as { conflicts: ScheduleConflict[] }).conflicts;
    }

    return undefined;
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return 'Невідома помилка';
  }
}
