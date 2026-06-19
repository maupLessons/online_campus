import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UsersService } from '../users/users.service';
import { Role } from '../common/types/roles.enum';
import {
  CreateNotificationDto,
  type NotificationTargetType,
} from './dto/create-notification.dto';
import { UpdateNotificationDto } from './dto/update-notification.dto';
import {
  Notification,
  NotificationDocument,
} from './schemas/notification.schema';
import { NotificationsRealtimeService } from './notifications-realtime.service';
import { NotificationQueryDto } from './dto/notification-query.dto';

type NotificationPayload = {
  title: string;
  message: string;
  type: string;
  userId: Types.ObjectId | null;
  targetType: NotificationTargetType;
  groupId: Types.ObjectId | null;
  actionUrl?: string;
  entityType: string | null;
  entityId: string | null;
  important: boolean;
};

type NotificationView = {
  id: string;
  userId: string | null;
  title: string;
  message: string;
  type: string;
  targetType: string;
  groupId: string | null;
  readFlag: boolean;
  important: boolean;
  actionUrl?: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  updatedAt: string;
};

type NotificationObject = {
  id?: string;
  _id?: unknown;
  userId?: unknown;
  title?: unknown;
  message?: unknown;
  type?: unknown;
  targetType?: unknown;
  groupId?: unknown;
  readBy?: unknown;
  important?: unknown;
  actionUrl?: unknown;
  entityType?: unknown;
  entityId?: unknown;
  createdAt?: Date | string;
  updatedAt?: Date | string;
};

type NotificationVisibilityContext = {
  role?: Role;
  groupId: string | null;
};

const broadcastNotificationTargets = (targetType: NotificationTargetType) => [
  { userId: null, targetType },
  { userId: { $exists: false }, targetType },
];

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    private readonly usersService: UsersService,
    private readonly realtime: NotificationsRealtimeService,
  ) {}

  async create(data: CreateNotificationDto): Promise<NotificationDocument> {
    const notification = await this.notificationModel.create(
      this.buildNotificationPayload(data),
    );
    this.realtime.publish({ reason: 'created' });
    return notification;
  }

  async createMany(items: CreateNotificationDto[]): Promise<void> {
    if (items.length === 0) {
      return;
    }

    await this.notificationModel.insertMany(
      items.map((data) => this.buildNotificationPayload(data)),
      { ordered: false },
    );
    this.realtime.publish({ reason: 'created' });
  }

  async update(
    id: string,
    data: UpdateNotificationDto,
    actorId: string,
  ): Promise<NotificationView> {
    const updatePayload = this.buildNotificationUpdatePayload(data);
    const unsetPayload = this.buildNotificationUnsetPayload(data);
    if (
      Object.keys(updatePayload).length === 0 &&
      Object.keys(unsetPayload).length === 0
    ) {
      throw new BadRequestException('Немає даних для оновлення');
    }

    const actorObjId = this.toObjectId(actorId);
    const updateOperation: Record<string, unknown> = {};
    if (Object.keys(updatePayload).length > 0) {
      updateOperation.$set = updatePayload;
    }
    if (Object.keys(unsetPayload).length > 0) {
      updateOperation.$unset = unsetPayload;
    }

    const notification = await this.notificationModel
      .findOneAndUpdate({ _id: this.toObjectId(id) }, updateOperation, {
        returnDocument: 'after',
        runValidators: true,
      })
      .lean<NotificationObject>()
      .exec();

    if (!notification) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    this.realtime.publish({ reason: 'updated' });
    return this.formatNotification(notification, actorObjId);
  }

  async findByUser(
    userId: string,
    query: NotificationQueryDto = {},
  ): Promise<NotificationView[]> {
    const userObjId = this.toObjectId(userId);
    const visibility = await this.getNotificationVisibilityContext(userId);

    const notifications = await this.notificationModel
      .find(
        this.combineFilters(
          this.buildVisibleFilter(userObjId, userId, visibility),
          this.buildListFilter(query, userObjId, userId),
        ),
      )
      .sort({ createdAt: -1 })
      .lean<NotificationObject[]>()
      .exec();

    return notifications.map((n) => this.formatNotification(n, userObjId));
  }

  async findAllForAdmin(
    actorId: string,
    query: NotificationQueryDto = {},
  ): Promise<NotificationView[]> {
    const actorObjId = this.toObjectId(actorId);
    const notifications = await this.notificationModel
      .find(this.buildListFilter(query, actorObjId, actorId))
      .sort({ createdAt: -1 })
      .lean<NotificationObject[]>()
      .exec();

    return notifications.map((n) => this.formatNotification(n, actorObjId));
  }

  async getUnreadCount(userId: string): Promise<number> {
    const userObjId = this.toObjectId(userId);
    const visibility = await this.getNotificationVisibilityContext(userId);

    return this.notificationModel
      .countDocuments({
        ...this.buildVisibleFilter(userObjId, userId, visibility),
        readBy: { $nin: [userObjId, userId] },
      })
      .exec();
  }

  async markAsRead(id: string, userId: string): Promise<NotificationView> {
    const userObjId = this.toObjectId(userId);
    const visibility = await this.getNotificationVisibilityContext(userId);

    const notification = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: this.toObjectId(id),
          ...this.buildVisibleFilter(userObjId, userId, visibility),
        },
        { $addToSet: { readBy: userObjId } },
        { returnDocument: 'after' },
      )
      .lean<NotificationObject>()
      .exec();

    if (!notification) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    this.realtime.publish({ userId, reason: 'read' });
    return this.formatNotification(notification, userObjId);
  }

  async markAllAsRead(userId: string) {
    const userObjId = this.toObjectId(userId);
    const visibility = await this.getNotificationVisibilityContext(userId);

    await this.notificationModel
      .updateMany(
        {
          ...this.buildVisibleFilter(userObjId, userId, visibility),
          readBy: { $nin: [userObjId, userId] },
        },
        { $addToSet: { readBy: userObjId } },
      )
      .exec();

    this.realtime.publish({ userId, reason: 'read' });

    return { success: true };
  }

  async delete(id: string, userId: string) {
    const userObjId = this.toObjectId(userId);
    const visibility = await this.getNotificationVisibilityContext(userId);

    const notification = await this.notificationModel
      .findOneAndUpdate(
        {
          _id: this.toObjectId(id),
          ...this.buildVisibleFilter(userObjId, userId, visibility),
        },
        { $addToSet: { dismissedBy: userObjId } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!notification) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    this.realtime.publish({ userId, reason: 'dismissed' });

    return { success: true };
  }

  async deleteAsAdmin(id: string) {
    const result = await this.notificationModel
      .deleteOne({ _id: this.toObjectId(id) })
      .exec();

    if (result.deletedCount === 0) {
      throw new NotFoundException('Сповіщення не знайдено');
    }

    this.realtime.publish({ reason: 'deleted' });

    return { success: true };
  }

  async dismissAll(userId: string) {
    const userObjId = this.toObjectId(userId);
    const visibility = await this.getNotificationVisibilityContext(userId);

    await this.notificationModel
      .updateMany(
        {
          ...this.buildVisibleFilter(userObjId, userId, visibility),
          dismissedBy: { $nin: [userObjId, userId] },
        },
        { $addToSet: { dismissedBy: userObjId } },
      )
      .exec();

    this.realtime.publish({ userId, reason: 'dismissed' });

    return { success: true };
  }

  private buildNotificationPayload(
    data: CreateNotificationDto,
  ): NotificationPayload {
    const targetType = data.targetType ?? 'all';
    const userId = data.userId ? this.toObjectId(data.userId) : null;
    const groupId = data.groupId ? this.toObjectId(data.groupId) : null;

    if (targetType === 'group' && !groupId && !userId) {
      throw new BadRequestException(
        'Для групового сповіщення потрібно передати groupId',
      );
    }

    return {
      title: this.trimRequired(data.title, 'Заголовок сповіщення обовʼязковий'),
      message: this.trimRequired(data.message, 'Текст сповіщення обовʼязковий'),
      type: data.type,
      userId,
      targetType,
      groupId,
      actionUrl: this.normalizeActionUrl(data.actionUrl),
      entityType: this.trimOptional(data.entityType) ?? null,
      entityId: this.trimOptional(data.entityId) ?? null,
      important: data.important ?? false,
    };
  }

  private buildNotificationUpdatePayload(
    data: UpdateNotificationDto,
  ): Partial<NotificationPayload> {
    const payload: Partial<NotificationPayload> = {};

    if (data.title !== undefined) {
      payload.title = this.trimRequired(
        data.title,
        'Заголовок сповіщення обовʼязковий',
      );
    }

    if (data.message !== undefined) {
      payload.message = this.trimRequired(
        data.message,
        'Текст сповіщення обовʼязковий',
      );
    }

    if (data.type !== undefined) {
      payload.type = data.type;
    }

    if (data.userId !== undefined) {
      payload.userId = data.userId ? this.toObjectId(data.userId) : null;
    }

    if (data.targetType !== undefined) {
      payload.targetType = data.targetType;
      if (data.targetType !== 'group') {
        payload.groupId = null;
      }
    }

    if (data.groupId !== undefined) {
      payload.groupId = data.groupId ? this.toObjectId(data.groupId) : null;
    }

    if (data.actionUrl !== undefined) {
      const normalizedActionUrl = this.normalizeActionUrl(data.actionUrl);
      if (normalizedActionUrl) {
        payload.actionUrl = normalizedActionUrl;
      }
    }

    if (data.entityType !== undefined) {
      payload.entityType = this.trimOptional(data.entityType) ?? null;
    }

    if (data.entityId !== undefined) {
      payload.entityId = this.trimOptional(data.entityId) ?? null;
    }

    if (data.important !== undefined) {
      payload.important = data.important;
    }

    const nextTargetType = payload.targetType ?? data.targetType;
    const nextGroupId = payload.groupId ?? null;
    const nextUserId = payload.userId ?? null;
    if (nextTargetType === 'group' && !nextGroupId && !nextUserId) {
      throw new BadRequestException(
        'Для групового сповіщення потрібно передати groupId',
      );
    }

    return payload;
  }

  private buildNotificationUnsetPayload(
    data: UpdateNotificationDto,
  ): Record<string, 1> {
    const unsetPayload: Record<string, 1> = {};

    if (data.actionUrl === '') {
      unsetPayload.actionUrl = 1;
    }

    return unsetPayload;
  }

  private buildVisibleFilter(
    userObjId: Types.ObjectId,
    userId: string,
    visibility: NotificationVisibilityContext,
  ): Record<string, unknown> {
    const visibleTargets: Record<string, unknown>[] = [
      { userId: userObjId },
      { userId },
    ];

    if (!this.isPersonalNotificationOnlyRole(visibility.role)) {
      visibleTargets.push(
        { userId: null, targetType: 'all' },
        { userId: { $exists: false }, targetType: 'all' },
        { userId: null, targetType: { $exists: false } },
        { userId: null, targetType: null },
        { userId: { $exists: false }, targetType: { $exists: false } },
        { userId: { $exists: false }, targetType: null },
      );

      if (visibility.role === Role.STUDENT) {
        visibleTargets.push(
          ...broadcastNotificationTargets('students'),
          ...broadcastNotificationTargets('students_teachers'),
        );
      }

      if (visibility.role === Role.TEACHER) {
        visibleTargets.push(
          ...broadcastNotificationTargets('teachers'),
          ...broadcastNotificationTargets('students_teachers'),
        );
      }

      if (visibility.groupId && Types.ObjectId.isValid(visibility.groupId)) {
        const groupObjId = new Types.ObjectId(visibility.groupId);
        visibleTargets.push({
          userId: null,
          targetType: 'group',
          groupId: groupObjId,
        });
        visibleTargets.push({
          userId: null,
          targetType: 'group',
          groupId: visibility.groupId,
        });
        visibleTargets.push({
          userId: { $exists: false },
          targetType: 'group',
          groupId: groupObjId,
        });
        visibleTargets.push({
          userId: { $exists: false },
          targetType: 'group',
          groupId: visibility.groupId,
        });
      }
    }

    return {
      $or: visibleTargets,
      dismissedBy: { $nin: [userObjId, userId] },
    };
  }

  private buildListFilter(
    query: NotificationQueryDto,
    actorObjId: Types.ObjectId,
    actorId: string,
  ): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (query.search) {
      const pattern = new RegExp(this.escapeRegex(query.search), 'i');
      filter.$or = [{ title: pattern }, { message: pattern }];
    }
    if (query.type) {
      filter.type = query.type;
    }
    if (query.important !== undefined) {
      filter.important = query.important;
    }
    if (query.targetType) {
      filter.targetType = query.targetType;
    }
    if (query.readState === 'read') {
      filter.readBy = { $in: [actorObjId, actorId] };
    }
    if (query.readState === 'unread') {
      filter.readBy = { $nin: [actorObjId, actorId] };
    }

    return filter;
  }

  private combineFilters(
    ...filters: Array<Record<string, unknown>>
  ): Record<string, unknown> {
    const active = filters.filter((filter) => Object.keys(filter).length > 0);
    if (active.length === 0) return {};
    if (active.length === 1) return active[0];
    return { $and: active };
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async getNotificationVisibilityContext(
    userId: string,
  ): Promise<NotificationVisibilityContext> {
    try {
      const user = await this.usersService.findOne(userId);
      return {
        role: user.role,
        groupId: user.studentProfile?.group ?? null,
      };
    } catch {
      return { groupId: null };
    }
  }

  private isPersonalNotificationOnlyRole(role?: Role): boolean {
    return role === Role.ADMIN;
  }

  private formatNotification(
    notification: NotificationObject,
    userObjId: Types.ObjectId,
  ): NotificationView {
    return {
      id: notification.id ?? this.idToString(notification._id),
      userId: notification.userId ? this.idToString(notification.userId) : null,
      title: this.stringOrFallback(notification.title, 'Сповіщення'),
      message: this.stringOrFallback(notification.message, ''),
      type: this.stringOrFallback(notification.type, 'system'),
      targetType: this.stringOrFallback(notification.targetType, 'all'),
      groupId: notification.groupId
        ? this.idToString(notification.groupId)
        : null,
      readFlag: this.hasObjectId(notification.readBy, userObjId),
      important: notification.important === true,
      ...this.formatActionUrl(notification.actionUrl),
      entityType: this.nullableString(notification.entityType),
      entityId: this.nullableString(notification.entityId),
      createdAt: this.dateToIso(notification.createdAt),
      updatedAt: this.dateToIso(notification.updatedAt),
    };
  }

  private dateToIso(value: Date | string | undefined): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    return value ?? '';
  }

  private hasObjectId(values: unknown, id: Types.ObjectId) {
    if (!Array.isArray(values)) {
      return false;
    }

    const expected = id.toHexString();
    return values.some((value) => this.idToString(value) === expected);
  }

  private stringOrFallback(value: unknown, fallback: string): string {
    return typeof value === 'string' ? value : fallback;
  }

  private nullableString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value : null;
  }

  private formatActionUrl(value: unknown): { actionUrl?: string } {
    if (typeof value !== 'string') {
      return {};
    }

    const normalized = this.trimOptional(value);
    if (!normalized || !this.isSafeActionUrl(normalized)) {
      return {};
    }

    return { actionUrl: normalized };
  }

  private normalizeActionUrl(value?: string): string | undefined {
    const normalized = this.trimOptional(value);
    if (!normalized) return undefined;

    if (!this.isSafeActionUrl(normalized)) {
      throw new BadRequestException(
        'actionUrl повинен бути внутрішнім шляхом застосунку',
      );
    }

    return normalized;
  }

  private isSafeActionUrl(value: string): boolean {
    return /^\/(?!\/)[A-Za-z0-9/_?=&:.-]{1,300}$/.test(value);
  }

  private trimRequired(value: string, message: string): string {
    const normalized = value.trim();
    if (!normalized) {
      throw new BadRequestException(message);
    }
    return normalized;
  }

  private trimOptional(value?: string): string | undefined {
    const normalized = value?.trim();
    return normalized || undefined;
  }

  private toObjectId(id: string): Types.ObjectId {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Некоректний ID');
    }

    return new Types.ObjectId(id);
  }

  private idToString(value: unknown): string {
    if (value instanceof Types.ObjectId) {
      return value.toHexString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (value && typeof value === 'object' && '_id' in value) {
      return this.idToString((value as { _id?: unknown })._id);
    }

    return '';
  }
}
