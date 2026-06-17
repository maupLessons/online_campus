import { Injectable } from '@nestjs/common';
import {
  SpreadsheetExportArtifact,
  SpreadsheetExportFormat,
  SpreadsheetExportLocale,
} from '../common/export';
import { AuthenticatedUser } from '../common/types/authenticated-request';
import { DomainAuditContext } from '../audit-log/audit-context';
import {
  ApplyScheduleTemplateDto,
  BulkCancelScheduleEntriesDto,
  BulkCreateScheduleEntriesDto,
  CreateScheduleEntryDto,
  CreateScheduleTemplateDto,
  RescheduleScheduleEntryDto,
  ScheduleEntryDto,
  ScheduleExportQueryDto,
  ScheduleQueryDto,
  ScheduleReasonDto,
  ScheduleTemplateDto,
  SubstituteScheduleEntryDto,
  UpdateScheduleEntryDto,
  UpdateScheduleTemplateDto,
} from './dto';
import { ScheduleExportService } from './schedule-export.service';
import { ScheduleMutationService } from './schedule-mutation.service';
import { ScheduleReaderService } from './schedule-reader.service';
import { ScheduleTemplatesService } from './schedule-templates.service';
import { ScheduleBulkOperationResult } from './schedule.types';

@Injectable()
export class ScheduleService {
  constructor(
    private readonly scheduleReader: ScheduleReaderService,
    private readonly scheduleMutation: ScheduleMutationService,
    private readonly scheduleExport: ScheduleExportService,
    private readonly scheduleTemplates: ScheduleTemplatesService,
  ) {}

  findAll(query: ScheduleQueryDto = {}): Promise<ScheduleEntryDto[]> {
    return this.scheduleReader.findAll(query);
  }

  findForUser(
    user: AuthenticatedUser,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    return this.scheduleReader.findForUser(user, query);
  }

  findOne(id: string): Promise<ScheduleEntryDto> {
    return this.scheduleReader.findOne(id);
  }

  findOneForUser(
    id: string,
    user: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    return this.scheduleReader.findOneForUser(id, user);
  }

  findByGroup(
    groupId: string,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    return this.scheduleReader.findByGroup(groupId, query);
  }

  findByTeacher(
    teacherId: string,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    return this.scheduleReader.findByTeacher(teacherId, query);
  }

  findByStudent(
    studentId: string,
    query: ScheduleQueryDto = {},
  ): Promise<ScheduleEntryDto[]> {
    return this.scheduleReader.findByStudent(studentId, query);
  }

  findByDate(date: string): Promise<ScheduleEntryDto[]> {
    return this.scheduleReader.findByDate(date);
  }

  create(
    dto: CreateScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    return this.scheduleMutation.create(dto, audit, user);
  }

  update(
    id: string,
    dto: UpdateScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    return this.scheduleMutation.update(id, dto, audit, user);
  }

  delete(id: string, audit?: DomainAuditContext): Promise<{ deleted: true }> {
    return this.scheduleMutation.delete(id, audit);
  }

  cancel(
    id: string,
    dto: ScheduleReasonDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    return this.scheduleMutation.cancel(id, dto, audit, user);
  }

  reschedule(
    id: string,
    dto: RescheduleScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    return this.scheduleMutation.reschedule(id, dto, audit, user);
  }

  substitute(
    id: string,
    dto: SubstituteScheduleEntryDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleEntryDto> {
    return this.scheduleMutation.substitute(id, dto, audit, user);
  }

  bulkCreate(
    dto: BulkCreateScheduleEntriesDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleBulkOperationResult> {
    return this.scheduleMutation.bulkCreate(dto, audit, user);
  }

  bulkCancel(
    dto: BulkCancelScheduleEntriesDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleBulkOperationResult> {
    return this.scheduleMutation.bulkCancel(dto, audit, user);
  }

  findTemplates(): Promise<ScheduleTemplateDto[]> {
    return this.scheduleTemplates.findTemplates();
  }

  createTemplate(
    dto: CreateScheduleTemplateDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleTemplateDto> {
    return this.scheduleTemplates.createTemplate(dto, audit, user);
  }

  updateTemplate(
    id: string,
    dto: UpdateScheduleTemplateDto,
    audit?: DomainAuditContext,
  ): Promise<ScheduleTemplateDto> {
    return this.scheduleTemplates.updateTemplate(id, dto, audit);
  }

  deleteTemplate(
    id: string,
    audit?: DomainAuditContext,
  ): Promise<{ archived: true }> {
    return this.scheduleTemplates.deleteTemplate(id, audit);
  }

  applyTemplate(
    id: string,
    dto: ApplyScheduleTemplateDto,
    audit?: DomainAuditContext,
    user?: AuthenticatedUser,
  ): Promise<ScheduleBulkOperationResult> {
    return this.scheduleMutation.applyTemplate(id, dto, audit, user);
  }

  isClassroomUsed(classroomId: string): Promise<boolean> {
    return this.scheduleReader.isClassroomUsed(classroomId);
  }

  async export(
    user: AuthenticatedUser,
    query: ScheduleExportQueryDto = {},
  ): Promise<SpreadsheetExportArtifact> {
    const { format, locale, ...scheduleQuery } = query;
    const entries = await this.scheduleReader.findForUser(user, scheduleQuery);

    return this.scheduleExport.export(entries, format, locale);
  }

  exportCsv(
    user: AuthenticatedUser,
    query: ScheduleQueryDto = {},
  ): Promise<SpreadsheetExportArtifact> {
    return this.export(user, {
      ...query,
      format: SpreadsheetExportFormat.CSV,
      locale: SpreadsheetExportLocale.UK,
    });
  }
}
