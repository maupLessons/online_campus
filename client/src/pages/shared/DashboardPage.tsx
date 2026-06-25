import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import api from '../../services/api';
import ProfileSummaryCard from '../../components/dashboard/ProfileSummaryCard';
import PerformanceCard from '../../components/dashboard/PerformanceCard';
import TodayScheduleCard from '../../components/dashboard/TodayScheduleCard';
import DeadlinesCard from '../../components/dashboard/DeadlinesCard';
import SurveyHighlightCard from '../../components/dashboard/SurveyHighlightCard';
import CampusNewsCard from '../../components/dashboard/CampusNewsCard';
import { newsApi, type NewsItem } from '../../services/newsApi';

export type ScheduleItem = {
  id?: string;
  title?: string;
  subjectName?: string;
  courseName?: string;
  lessonType?: string;
  teacherName?: string;
  classroom?: string;
  classroomName?: string;
  startTime?: string;
  endTime?: string;
  status?: string;
  date?: string;
};

export type NotificationItem = {
  id?: string;
  title?: string;
  message?: string;
  createdAt?: string;
  type?: string;
  read?: boolean;
  readFlag?: boolean;
  actionUrl?: string;
  entityType?: string | null;
  entityId?: string | null;
};

function normalizeArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (
    value &&
    typeof value === 'object' &&
    'items' in value &&
    Array.isArray((value as { items?: unknown[] }).items)
  ) {
    return ((value as { items: T[] }).items ?? []) as T[];
  }
  return [];
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [schedule, setSchedule] = useState<ScheduleItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsUnavailable, setNewsUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardData = async () => {
      setIsLoading(true);

      const [scheduleResult, notificationsResult, newsResult] =
        await Promise.allSettled([
          api.get('/schedule/my'),
          api.get('/notifications'),
          newsApi.listLatest(3),
        ]);

      if (!isMounted) return;

      if (scheduleResult.status === 'fulfilled') {
        setSchedule(normalizeArray<ScheduleItem>(scheduleResult.value.data));
      } else {
        setSchedule([]);
      }

      if (notificationsResult.status === 'fulfilled') {
        setNotifications(
          normalizeArray<NotificationItem>(notificationsResult.value.data),
        );
      } else {
        setNotifications([]);
      }

      if (newsResult.status === 'fulfilled') {
        setNews(newsResult.value.items);
        setNewsUnavailable(newsResult.value.unavailable);
      } else {
        setNews([]);
        setNewsUnavailable(true);
      }

      setIsLoading(false);
    };

    loadDashboardData();

    return () => {
      isMounted = false;
    };
  }, []);

  const todaySchedule = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);

    const filtered = schedule.filter((item) => {
      if (!item.date) return true;
      return item.date.slice(0, 10) === today;
    });

    return filtered.slice(0, 4);
  }, [schedule]);

  return (
    <div className="space-y-6">
      {/* <div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">
          {t('dashboard.welcome', { name: greetingName })}
        </h1>
        <p className="mt-2 text-base text-slate-500">
          {t('dashboard.overview')}
        </p>
      </div> */}

      <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
        <div className="space-y-6">
          <ProfileSummaryCard user={user} />
          <PerformanceCard user={user} />
        </div>

        <div className="space-y-6">
          <TodayScheduleCard items={todaySchedule} isLoading={isLoading} />
          <CampusNewsCard
            items={news}
            isLoading={isLoading}
            unavailable={newsUnavailable}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <DeadlinesCard items={notifications} />
            <SurveyHighlightCard items={notifications} />
          </div>
        </div>
      </div>
    </div>
  );
}
