import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';

import {
  isRateLimitError,
  notificationsApi,
  notificationsQueryKeys,
} from '../../services/notificationsApi';
import { useAuthStore } from '../../store/authStore';
import type { User } from '../../types';

function getUserId(user: User | null) {
  return user?.id ?? user?._id ?? null;
}

export default function NotificationsBell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAuthChecked = useAuthStore((state) => state.isAuthChecked);
  const userId = getUserId(user);
  const isNotificationsPage = location.pathname === '/notifications';
  const unreadCountQueryKey = notificationsQueryKeys.unreadCount(
    userId ?? 'anonymous',
  );

  const { data: unread } = useQuery({
    queryKey: unreadCountQueryKey,
    queryFn: notificationsApi.getUnreadCount,
    enabled: isAuthChecked && Boolean(userId) && !isNotificationsPage,
    refetchInterval: isNotificationsPage ? false : 60_000,
    refetchOnMount: true,
    refetchOnReconnect: 'always',
    refetchOnWindowFocus: false,
    retry: (failureCount, error) =>
      !isRateLimitError(error) && failureCount < 1,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 5000),
    staleTime: 30_000,
  });
  const count = unread?.count ?? 0;
  const importantCount = unread?.importantCount ?? 0;

  useEffect(() => {
    if (!userId) {
      queryClient.removeQueries({ queryKey: notificationsQueryKeys.root });
    }
  }, [queryClient, userId]);

  useEffect(() => {
    if (!isAuthChecked || !userId) {
      return;
    }

    const source = new EventSource('/api/notifications/stream', {
      withCredentials: true,
    });
    const handleChange = () => {
      void queryClient.invalidateQueries({
        queryKey: notificationsQueryKeys.root,
      });
    };

    source.addEventListener('notifications.changed', handleChange);
    return () => {
      source.removeEventListener('notifications.changed', handleChange);
      source.close();
    };
  }, [isAuthChecked, queryClient, userId]);

  const handleOpenNotifications = () => {
    navigate('/notifications');
  };

  return (
    <button
      onClick={handleOpenNotifications}
      aria-label={
        importantCount > 0
          ? t('notifications.bellImportantAria', { count, importantCount })
          : t('notifications.bellAria', { count })
      }
      className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50"
    >
      <Bell className="h-5 w-5 text-gray-600" aria-hidden="true" />

      {count > 0 && (
        <span
          className={`absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-medium text-white ${
            importantCount > 0
              ? 'bg-amber-500 ring-2 ring-amber-200'
              : 'bg-red-500'
          }`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
