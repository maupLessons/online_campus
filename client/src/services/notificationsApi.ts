import api from './api';
import type { AxiosError } from 'axios';
import type { Notification, NotificationInput } from '../types';

type NotificationResponse = Partial<Notification> & {
  _id?: string;
  readBy?: unknown[];
};

const normalizeNotification = (notification: NotificationResponse): Notification => ({
  id: notification.id ?? notification._id ?? '',
  userId: notification.userId ?? null,
  type: notification.type ?? 'system',
  title: notification.title ?? '',
  message: notification.message ?? '',
  targetType: notification.targetType ?? 'all',
  groupId: notification.groupId ?? null,
  createdAt: notification.createdAt ?? new Date().toISOString(),
  readFlag: notification.readFlag ?? false,
  important: notification.important ?? false,
  actionUrl: notification.actionUrl,
  entityType: notification.entityType ?? null,
  entityId: notification.entityId ?? null,
});

export const isRateLimitError = (error: unknown) =>
  (error as AxiosError | undefined)?.response?.status === 429;

export const notificationsQueryKeys = {
  root: ['notifications'] as const,
  all: (userId: string) => ['notifications', userId, 'list'] as const,
  adminAll: (userId: string) =>
    ['notifications', userId, 'admin-list'] as const,
  unreadCount: (userId: string) =>
    ['notifications', userId, 'unread-count'] as const,
};

export const notificationsApi = {
  list: async () => {
    const { data } = await api.get<NotificationResponse[]>('/notifications');
    return data.map(normalizeNotification);
  },

  listForAdmin: async () => {
    const { data } =
      await api.get<NotificationResponse[]>('/notifications/admin');
    return data.map(normalizeNotification);
  },

  getUnreadCount: async () => {
    const { data } = await api.get<{ count: number }>(
      '/notifications/unread-count',
    );
    return data.count;
  },

  create: async (payload: NotificationInput) => {
    const { data } = await api.post<NotificationResponse>(
      '/notifications',
      payload,
    );
    return normalizeNotification(data);
  },

  update: async (id: string, payload: Partial<NotificationInput>) => {
    const { data } = await api.patch<NotificationResponse>(
      `/notifications/${id}`,
      payload,
    );
    return normalizeNotification(data);
  },

  markAsRead: async (id: string) => {
    const { data } = await api.patch<NotificationResponse>(
      `/notifications/${id}/read`,
    );
    return normalizeNotification(data);
  },

  markAllAsRead: async () => {
    const { data } = await api.patch<{ success: true }>(
      '/notifications/read-all',
    );
    return data;
  },

  remove: async (id: string) => {
    const { data } = await api.delete<{ success: true }>(
      `/notifications/${id}`,
    );
    return data;
  },

  removeAsAdmin: async (id: string) => {
    const { data } = await api.delete<{ success: true }>(
      `/notifications/admin/${id}`,
    );
    return data;
  },

  removeAll: async () => {
    const { data } = await api.delete<{ success: true }>('/notifications');
    return data;
  },
};
