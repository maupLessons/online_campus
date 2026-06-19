import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Plus, RotateCcw, Search } from 'lucide-react';
import { Role, type Notification, type User } from '../../types';
import { useAuthStore } from '../../store/authStore';
import CreateNotificationModal from '../../components/notifications/CreateNotificationModal';
import NotificationItem from '../../components/notifications/NotificationItem';
import {
  isRateLimitError,
  notificationsApi,
  notificationsQueryKeys,
  type NotificationListFilters,
} from '../../services/notificationsApi';

const notificationTypes = [
  'schedule_change',
  'new_assignment',
  'assignment_submitted',
  'assignment_returned',
  'new_survey',
  'grade',
  'announcement',
  'system',
] as const;

const notificationTargets = [
  'all',
  'students',
  'teachers',
  'students_teachers',
  'group',
] as const;

function getUserId(user: User | null) {
  return user?.id ?? user?._id ?? null;
}

export default function NotificationsPage() {
  const [isModalOpen, setIsModalOpen] =
    useState(false);
  const [notificationToEdit, setNotificationToEdit] =
    useState<Notification | null>(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<NotificationListFilters>({});

  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const userId = getUserId(user);
  const isAdmin = user?.role === Role.ADMIN;
  const effectiveFilters = useMemo<NotificationListFilters>(
    () => ({
      ...filters,
      search: search || undefined,
    }),
    [filters, search],
  );
  const hasActiveFilters = Object.values(effectiveFilters).some(
    (value) => value !== undefined && value !== '',
  );
  const notificationsQueryKey = useMemo(
    () =>
      isAdmin
        ? notificationsQueryKeys.adminAll(
            userId ?? 'anonymous',
            effectiveFilters,
          )
        : notificationsQueryKeys.all(userId ?? 'anonymous', effectiveFilters),
    [effectiveFilters, isAdmin, userId],
  );
  const unreadCountQueryKey = useMemo(
    () => notificationsQueryKeys.unreadCount(userId ?? 'anonymous'),
    [userId],
  );

  const { t, i18n } = useTranslation();

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [searchInput]);

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
    queryFn: () =>
      isAdmin
        ? notificationsApi.listForAdmin(effectiveFilters)
        : notificationsApi.list(effectiveFilters),
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
    if (hasActiveFilters) {
      return;
    }

    queryClient.setQueryData(
      unreadCountQueryKey,
      nextNotifications.filter((notification) =>
        isAdmin
          ? notification.userId === userId && !notification.readFlag
          : !notification.readFlag,
      ).length,
    );
  }, [hasActiveFilters, isAdmin, queryClient, unreadCountQueryKey, userId]);

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

  const resetFilters = () => {
    setSearchInput('');
    setSearch('');
    setFilters({});
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

    if (notification.targetType === 'teachers') {
      return t('notifications.audience.teachers');
    }

    if (notification.targetType === 'students_teachers') {
      return t('notifications.audience.studentsTeachers');
    }

    return t('notifications.audience.broadcast');
  };

  return (
    <div className="p-5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">
          {t('nav.notifications')}
        </h1>

        {isAdmin && (
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex w-auto max-w-full items-center justify-center gap-2 self-start rounded-lg border border-gray-400 px-4 py-2 text-base font-normal leading-normal text-slate-900 transition-colors hover:bg-gray-200 sm:self-auto"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 whitespace-nowrap text-left">
              {t('notifications.create')}
            </span>
          </button>
        )}
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label className="relative md:col-span-2 xl:col-span-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('notifications.filters.searchPlaceholder')}
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
          </label>

          <select
            value={filters.readState ?? ''}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                readState:
                  (event.target.value as 'read' | 'unread') || undefined,
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('notifications.filters.allStates')}</option>
            <option value="unread">{t('notifications.unread')}</option>
            <option value="read">{t('notifications.read')}</option>
          </select>

          <select
            value={filters.type ?? ''}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                type: event.target.value || undefined,
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('notifications.filters.allTypes')}</option>
            {notificationTypes.map((type) => (
              <option key={type} value={type}>
                {t(`notifications.types.${type}`)}
              </option>
            ))}
          </select>

          <select
            value={
              filters.important === undefined
                ? ''
                : String(filters.important)
            }
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                important:
                  event.target.value === ''
                    ? undefined
                    : event.target.value === 'true',
              }))
            }
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t('notifications.filters.allPriorities')}</option>
            <option value="true">{t('notifications.filters.important')}</option>
            <option value="false">{t('notifications.filters.regular')}</option>
          </select>

          {isAdmin ? (
            <select
              value={filters.targetType ?? ''}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  targetType: event.target.value || undefined,
                }))
              }
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">{t('notifications.filters.allAudiences')}</option>
              {notificationTargets.map((target) => (
                <option key={target} value={target}>
                  {t(
                    `notifications.form.targets.${
                      target === 'students_teachers'
                        ? 'studentsTeachers'
                        : target
                    }`,
                  )}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t('notifications.filters.reset')}
            </button>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
          <span>
            {t('notifications.filters.results', {
              count: notifications.length,
            })}
          </span>
          {isAdmin && (
            <button
              type="button"
              onClick={resetFilters}
              disabled={!hasActiveFilters}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {t('notifications.filters.reset')}
            </button>
          )}
        </div>
      </section>

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
