import { Injectable, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AcademicAccessService } from '../common/access/academic-access.service';
import { NotificationType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ScheduleEntryDto } from './dto';
import { ScheduleNotificationAction } from './schedule.types';

@Injectable()
export class ScheduleNotificationsService {
  private readonly logger = new Logger(ScheduleNotificationsService.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly academicAccessService: AcademicAccessService,
  ) {}

  async notifyScheduleChanged(
    action: ScheduleNotificationAction,
    entry: ScheduleEntryDto,
    previousEntry?: ScheduleEntryDto,
  ): Promise<void> {
    try {
      const recipientIds = await this.resolveNotificationRecipients([
        entry.courseAssignmentId,
        previousEntry?.courseAssignmentId,
      ]);

      if (recipientIds.length === 0) {
        this.logger.warn(
          `Schedule notification skipped: no recipients for entry ${entry.id}`,
        );
        return;
      }

      await this.notificationsService.createMany(
        recipientIds.map((userId) => ({
          userId,
          title: this.getNotificationTitle(action),
          message: this.getNotificationMessage(action, entry, previousEntry),
          type: NotificationType.SCHEDULE_CHANGE,
          actionUrl: '/schedule',
          entityType: 'schedule',
          entityId: entry.id,
          important:
            action === 'cancelled' ||
            action === 'rescheduled' ||
            action === 'substituted',
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(
        `Schedule notification was not created for ${entry.id}: ${message}`,
      );
    }
  }

  private async resolveNotificationRecipients(
    courseAssignmentIds: Array<string | undefined>,
  ): Promise<string[]> {
    const objectIds = [
      ...new Set(
        courseAssignmentIds
          .filter((id): id is string => Boolean(id))
          .filter((id) => Types.ObjectId.isValid(id)),
      ),
    ].map((id) => new Types.ObjectId(id));

    if (objectIds.length === 0) {
      return [];
    }

    return this.academicAccessService.findCourseAssignmentRecipientIds(
      objectIds.map((id) => id.toHexString()),
    );
  }

  private getNotificationTitle(action: ScheduleNotificationAction): string {
    if (action === 'created') return 'Нове заняття в розкладі';
    if (action === 'cancelled') return 'Заняття скасовано';
    if (action === 'rescheduled') return 'Заняття перенесено';
    if (action === 'substituted') return 'Заміна в розкладі';
    if (action === 'deleted') return 'Заняття видалено з розкладу';
    return 'Зміна розкладу';
  }

  private getNotificationMessage(
    action: ScheduleNotificationAction,
    entry: ScheduleEntryDto,
    previousEntry?: ScheduleEntryDto,
  ): string {
    const course = entry.courseName ?? entry.courseCode ?? 'Заняття';
    const nextSlot = `${entry.date} ${entry.startTime}-${entry.endTime}`;

    if (action === 'created') {
      return `${course}: додано заняття ${nextSlot}.`;
    }
    if (action === 'deleted') {
      return `${course}: заняття ${nextSlot} видалено з розкладу.`;
    }
    if (action === 'cancelled') {
      const reason = entry.changeReason
        ? ` Причина: ${entry.changeReason}.`
        : '';
      return `${course}: заняття ${nextSlot} скасовано.${reason}`;
    }

    const previousSlot = previousEntry
      ? `${previousEntry.date} ${previousEntry.startTime}-${previousEntry.endTime}`
      : 'попередній час';

    if (action === 'rescheduled') {
      const reason = entry.changeReason
        ? ` Причина: ${entry.changeReason}.`
        : '';
      return `${course}: заняття перенесено з ${previousSlot} на ${nextSlot}.${reason}`;
    }
    if (action === 'substituted') {
      const reason = entry.changeReason
        ? ` Причина: ${entry.changeReason}.`
        : '';
      return `${course}: у розкладі виконано заміну з ${previousSlot} на ${nextSlot}.${reason}`;
    }

    return `${course}: розклад змінено з ${previousSlot} на ${nextSlot}.`;
  }
}
