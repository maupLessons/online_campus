import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Role, type Notification, type User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import CreateNotificationModal from '../../components/notifications/CreateNotificationModal';
import NotificationItem from '../../components/notifications/NotificationItem';
import {
  isRateLimitError,
  notificationsApi,
  notificationsQueryKeys,
} from '../../services/notificationsApi';

function getUserId(user: User | null) {
  return user?.id ?? user?._id ?? null;
}

export default function NotificationsPage() {
  const [isModalOpen, setIsModalOpen] =
    useState(false);
  const [notificationToEdit, setNotificationToEdit] =
    useState<Notification | null>(null);

  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const userId = getUserId(user);
  const isAdmin = user?.role === Role.ADMIN;
  const notificationsQueryKey = useMemo(
    () =>
      isAdmin
        ? notificationsQueryKeys.adminAll(userId ?? 'anonymous')
        : notificationsQueryKeys.all(userId ?? 'anonymous'),
    [isAdmin, userId],
  );
  const unreadCountQueryKey = useMemo(
    () => notificationsQueryKeys.unreadCount(userId ?? 'anonymous'),
    [userId],
  );

  const { t, i18n } = useTranslation();

  const locale =
    i18n.language === 'en'
      ? 'en-US'
      : 'uk-UA';

  const {
    data: notifications = [],
    isLoading,
    isError,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: isAdmin ? notificationsApi.listForAdmin : notificationsApi.list,
    enabled: Boolean(userId),
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => previous,
    retry: (failureCount, error) =>
      !isRateLimitError(error) && failureCount < 2,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    staleTime: 10_000,
  });

  const unreadCount = notifications.filter((notification) =>
    isAdmin
      ? notification.userId === userId && !notification.readFlag
      : !notification.readFlag,
  ).length;
  const notificationLoadError = isRateLimitError(error)
    ? t('notifications.rateLimitError')
    : t('notifications.loadError');

  const syncUnreadCount = useCallback((nextNotifications: Notification[]) => {
    queryClient.setQueryData(
      unreadCountQueryKey,
      nextNotifications.filter((notification) =>
        isAdmin
          ? notification.userId === userId && !notification.readFlag
          : !notification.readFlag,
      ).length,
    );
  }, [isAdmin, queryClient, unreadCountQueryKey, userId]);

  useEffect(() => {
    if (!isLoading && !isError) {
      syncUnreadCount(notifications);
    }
  }, [isError, isLoading, notifications, syncUnreadCount]);

  const invalidateNotifications = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: notificationsQueryKey }),
      queryClient.invalidateQueries({
        queryKey: unreadCountQueryKey,
      }),
    ]);
  }, [queryClient, notificationsQueryKey, unreadCountQueryKey]);

  const handleNotificationSaved = async (savedNotification: Notification) => {
    let nextNotifications: Notification[] | undefined;
    const shouldShowSavedNotification =
      isAdmin || savedNotification.userId === userId;

    if (savedNotification.id && shouldShowSavedNotification) {
      queryClient.setQueryData<Notification[]>(
        notificationsQueryKey,
        (current = []) => {
          const exists = current.some(
            (notification) => notification.id === savedNotification.id,
          );

          nextNotifications = exists
            ? current.map((notification) =>
                notification.id === savedNotification.id
                  ? { ...notification, ...savedNotification }
                  : notification,
              )
            : [savedNotification, ...current];

          return nextNotifications;
        },
      );

      if (nextNotifications) {
        syncUnreadCount(nextNotifications);
      }
    }

    await invalidateNotifications();
  };

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markAsRead,
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: notificationsQueryKey,
      });

      const previous =
        queryClient.getQueryData<Notification[]>(notificationsQueryKey) ??
        [];
      const next = previous.map((notification) =>
        notification.id === id
          ? { ...notification, readFlag: true }
          : notification,
      );
      queryClient.setQueryData(notificationsQueryKey, next);
      syncUnreadCount(next);

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
        syncUnreadCount(context.previous);
      }
    },
    onSettled: invalidateNotifications,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      isAdmin ? notificationsApi.removeAsAdmin(id) : notificationsApi.remove(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: notificationsQueryKey,
      });

      const previous =
        queryClient.getQueryData<Notification[]>(notificationsQueryKey) ??
        [];
      const next = previous.filter((notification) => notification.id !== id);
      queryClient.setQueryData(notificationsQueryKey, next);
      syncUnreadCount(next);

      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
        syncUnreadCount(context.previous);
      }
    },
    onSettled: invalidateNotifications,
  });

  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllAsRead,
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: notificationsQueryKey,
      });

      const previous =
        queryClient.getQueryData<Notification[]>(notificationsQueryKey) ??
        [];
      const next = previous.map((notification) => ({
        ...notification,
        readFlag: true,
      }));
      queryClient.setQueryData(notificationsQueryKey, next);
      syncUnreadCount(next);

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
        syncUnreadCount(context.previous);
      }
    },
    onSettled: invalidateNotifications,
  });

  const deleteAllMutation = useMutation({
    mutationFn: notificationsApi.removeAll,
    onMutate: async () => {
      await queryClient.cancelQueries({
        queryKey: notificationsQueryKey,
      });

      const previous =
        queryClient.getQueryData<Notification[]>(notificationsQueryKey) ??
        [];
      queryClient.setQueryData(notificationsQueryKey, []);
      queryClient.setQueryData(unreadCountQueryKey, 0);

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
        syncUnreadCount(context.previous);
      }
    },
    onSettled: invalidateNotifications,
  });

  const handleRead = (id: string) => {
    markReadMutation.mutate(id);
  };

  const handleDelete = (id: string) => {
    deleteMutation.mutate(id);
  };

  const handleMarkAllRead = () => {
    markAllReadMutation.mutate();
  };

  const handleDeleteAll = () => {
    const confirmed = window.confirm(
      t('notifications.deleteAllConfirm'),
    );

    if (!confirmed) {
      return;
    }

    deleteAllMutation.mutate();
  };

  const handleOpenCreateModal = () => {
    setNotificationToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (notification: Notification) => {
    setNotificationToEdit(notification);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setNotificationToEdit(null);
  };

  const getNotificationAudienceLabel = (notification: Notification) => {
    if (notification.userId === userId) {
      return t('notifications.audience.personal');
    }

    if (notification.targetType === 'group') {
      return t('notifications.audience.group');
    }

    if (notification.targetType === 'students') {
      return t('notifications.audience.students');
    }

    return t('notifications.audience.broadcast');
  };

  return (
    <div className="p-5">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-2xl font-bold">
          {t('nav.notifications')}
        </h1>

        {isAdmin && (
          <button
            onClick={handleOpenCreateModal}
            className="rounded-lg border border-gray-400 px-4 py-2 transition-colors hover:bg-gray-200"
          >
            ➕ {t('notifications.create')}
          </button>
        )}
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        {notifications.length > 0 && (
          <button
            onClick={handleMarkAllRead}
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
            className="rounded-lg border border-gray-400 px-4 py-2 transition-colors hover:bg-gray-200"
          >
            {t('notifications.markAllRead')}
          </button>
        )}

        {notifications.length > 0 && !isAdmin && (
          <button
            onClick={handleDeleteAll}
            disabled={deleteAllMutation.isPending}
            className="rounded-lg border border-red-300 px-4 py-2 text-red-600 transition-colors hover:bg-red-50"
          >
            {t('notifications.deleteAll')}
          </button>
        )}
      </div>

      <div className="space-y-3">
        {isLoading && (
          <p className="text-gray-500">{t('common.loading')}</p>
        )}

        {isError && !isFetching && notifications.length === 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{notificationLoadError}</span>
              <button
                type="button"
                onClick={() => void refetch()}
                disabled={isFetching}
                className="rounded-md border border-red-300 px-3 py-1.5 font-medium text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('common.retry')}
              </button>
            </div>
          </div>
        )}

        {!isLoading && !isError && notifications.length === 0 && (
          <p className="text-gray-500">
            {t('notifications.empty')}
          </p>
        )}

        {notifications.map((notification) => (
          <div key={notification.id}>
            <NotificationItem
              notification={notification}
              onRead={
                !isAdmin || notification.userId === userId
                  ? handleRead
                  : undefined
              }
              onDelete={handleDelete}
              onEdit={isAdmin ? handleOpenEditModal : undefined}
              audienceLabel={
                isAdmin ? getNotificationAudienceLabel(notification) : undefined
              }
              viewerRole={user?.role}
            />

            <div className="mt-1 text-right text-xs text-gray-400">
              {new Date(
                notification.createdAt,
              ).toLocaleDateString(locale)}
            </div>
          </div>
        ))}
      </div>

      <CreateNotificationModal
        open={isModalOpen}
        onClose={handleCloseModal}
        onCreated={handleNotificationSaved}
        notification={notificationToEdit}
      />
    </div>
  );
}
