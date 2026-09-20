import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Role } from '../common/types/roles.enum';
import {
  CreateNotificationDto,
  NotificationType,
} from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { Group } from '../references/schemas';
import { User, UserDocument } from '../users/schemas';
import { activeStudentsInGroup } from '../users/student-profile.filters';
import { ScheduleDiffItem, ScheduleDiffService } from './schedule-diff.service';
import { todayKyiv } from './schedule-keys';
import { SnapshotRefreshEvent } from './schedule-snapshot.service';
import { ScheduleSnapshotEntry } from './schemas/schedule-snapshot.schema';

const FIELD_LABELS: Record<string, string> = {
  endTime: 'час завершення',
  classroom: 'аудиторію',
  teacherName: 'викладача',
  type: 'тип заняття',
  controlType: 'тип контролю',
};

const CONTROL_TYPE_LABELS: Record<string, string> = {
  exam: 'екзамен',
  credit: 'залік',
  coursework: 'курсову роботу',
  other: 'контрольний захід',
};

@Injectable()
export class ScheduleChangeNotifierService {
  private readonly logger = new Logger(ScheduleChangeNotifierService.name);
  private readonly maxAgeMs: number;
  private readonly bulkThreshold: number;

  constructor(
    private readonly diffService: ScheduleDiffService,
    private readonly notifications: NotificationsService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Group.name) private readonly groupModel: Model<Group>,
    config: ConfigService,
  ) {
    this.maxAgeMs = Number(
      config.get('SCHEDULE_DIFF_MAX_AGE_MS') ?? 604_800_000,
    );
    this.bulkThreshold = Number(
      config.get('SCHEDULE_DIFF_BULK_THRESHOLD') ?? 20,
    );
  }

  async handleRefresh(event: SnapshotRefreshEvent): Promise<void> {
    const session = event.key.isExamSession;
    const outdated =
      !event.previousEntries ||
      !event.previousFetchedAt ||
      Date.now() - event.previousFetchedAt.getTime() > this.maxAgeMs;

    // Spec §7.2, storm protection, rules 1–2 + exception for the session.
    let items: ScheduleDiffItem[] = [];
    let messages: Array<{ title: string; message: string; actionUrl: string }>;
    let sourceEntries: ScheduleSnapshotEntry[];

    if (outdated) {
      if (!session || event.nextEntries.length === 0) return; // first lessons snapshot — silent
      messages = [this.sessionPublishedMessage(event.key.groupCode)];
      sourceEntries = event.nextEntries;
    } else {
      const today = todayKyiv();
      items = this.diffService.diff(
        event.previousEntries as ScheduleSnapshotEntry[],
        event.nextEntries,
        today,
      );
      if (items.length === 0) return;
      // Review (round 1): we compute the denominator only over future entries (date >= today),
      // the same set that diff() actually compares — otherwise, mid-semester,
      // total gets inflated by past lessons and the storm % is understated.
      const total = Math.max(
        (event.previousEntries as ScheduleSnapshotEntry[]).filter(
          (e) => e.date >= today,
        ).length,
        event.nextEntries.filter((e) => e.date >= today).length,
        1,
      );
      // items.length > 1 in the second condition: one changed lesson with total=1 is not a "storm",
      // just an ordinary single-item change (otherwise 100% of a one-lesson schedule would always be aggregated).
      const aggregate =
        items.length > this.bulkThreshold ||
        (items.length > 1 && items.length / total > 0.3);
      messages = aggregate
        ? [this.aggregateMessage(event.key.groupCode, session)]
        : items.map((i) => this.itemMessage(i, session));
      sourceEntries = items.map((i) => i.entry);
    }

    const group = await this.groupModel
      .findOne({ code: event.key.groupCode })
      .select('_id')
      .lean()
      .exec();
    if (!group) {
      this.logger.warn(
        `Group ${event.key.groupCode} not found; schedule change not delivered`,
      );
      return;
    }
    // Contract of plan 01, rule 3: only activeStudentsInGroup ($elemMatch),
    // otherwise two separate predicates give false matches across different profiles of the same user.
    const students = await this.userModel
      .find({
        status: 'active',
        ...activeStudentsInGroup(group._id),
      })
      .select('_id')
      .lean()
      .exec();
    const teacherIds = [
      ...new Set(sourceEntries.map((e) => e.teacherExternalId).filter(Boolean)),
    ];
    const teachers = teacherIds.length
      ? await this.userModel
          .find({
            role: Role.TEACHER,
            status: 'active',
            'teacherProfile.externalTeacherId': { $in: teacherIds },
          })
          .select('_id')
          .lean()
          .exec()
      : [];
    // Deduplication: the same user must not receive a notification twice.
    const recipientIds = [
      ...new Set([...students, ...teachers].map((u) => String(u._id))),
    ];
    if (recipientIds.length === 0) return;

    const payload: CreateNotificationDto[] = [];
    for (const userId of recipientIds) {
      for (const m of messages) {
        // targetType is not set: these are personal notifications (userId), not broadcast.
        payload.push({
          ...m,
          userId,
          type: NotificationType.SCHEDULE_CHANGE,
          entityType: 'schedule',
        });
      }
    }
    await this.notifications.createMany(payload);
  }

  private itemMessage(item: ScheduleDiffItem, session: boolean) {
    const e = item.entry;
    const when = `${e.date} ${e.startTime}`;
    const actionUrl = `${session ? '/schedule/session' : '/schedule'}?date=${e.date}`;
    const what = session
      ? CONTROL_TYPE_LABELS[e.controlType ?? 'other']
      : 'заняття';
    if (item.kind === 'added')
      return {
        title: `Додано ${what}: ${e.courseTitle}`,
        message: when,
        actionUrl,
      };
    if (item.kind === 'removed')
      return {
        title: `Скасовано ${what}: ${e.courseTitle}`,
        message: when,
        actionUrl,
      };
    const fields = (item.changedFields ?? [])
      .map((f) => FIELD_LABELS[f])
      .join(', ');
    return {
      title: `Змінено ${what}: ${e.courseTitle}`,
      message: `${when} (${fields})`,
      actionUrl,
    };
  }

  private aggregateMessage(groupCode: string, session: boolean) {
    return {
      title: session ? 'Розклад сесії оновлено' : 'Розклад оновлено',
      message: `Розклад групи ${groupCode} оновлено, перевірте зміни`,
      actionUrl: session ? '/schedule/session' : '/schedule',
    };
  }

  private sessionPublishedMessage(groupCode: string) {
    return {
      title: 'Опубліковано розклад сесії',
      message: `Опубліковано розклад сесії для групи ${groupCode}`,
      actionUrl: '/schedule/session',
    };
  }
}
