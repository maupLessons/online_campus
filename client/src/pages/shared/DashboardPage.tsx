import { useQueries } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { Role } from '../../types';
import ProfileSummaryCard from '../../components/dashboard/ProfileSummaryCard';
import AccountStatusCard from '../../components/dashboard/AccountStatusCard';
import TodayScheduleCard from '../../components/dashboard/TodayScheduleCard';
import ActiveSurveysCard from '../../components/dashboard/ActiveSurveysCard';
import ElectiveStatusCard from '../../components/dashboard/ElectiveStatusCard';
import ImportantNotificationsCard from '../../components/dashboard/ImportantNotificationsCard';
import CampusNewsCard from '../../components/dashboard/CampusNewsCard';
import { scheduleApi, scheduleQueryKeys } from '../../services/scheduleApi';
import { surveysApi } from '../../services/surveysApi';
import { electivesApi } from '../../services/electivesApi';
import { notificationsApi, notificationsQueryKeys } from '../../services/notificationsApi';
import { newsApi, newsQueryKeys } from '../../services/newsApi';

const IMPORTANT_FILTERS = { important: true, readState: 'unread' as const };
const ACTIVE_SURVEYS_FILTERS = { completed: false };
const ACTIVE_SURVEYS_KEY = ['surveys', 'active', ACTIVE_SURVEYS_FILTERS] as const;
const ACTIVE_ELECTIVES_KEY = ['electives', 'active'] as const;

export default function DashboardPage() {
  const { user } = useAuthStore();
  const userId = user?.id ?? 'anonymous';
  const isStudent = user?.role === Role.STUDENT;
  const hasSchedule = isStudent || user?.role === Role.TEACHER;

  const [schedule, surveys, electives, important, news] = useQueries({
    queries: [
      { queryKey: scheduleQueryKeys.today(), queryFn: scheduleApi.today, enabled: hasSchedule },
      { queryKey: ACTIVE_SURVEYS_KEY, queryFn: () => surveysApi.listActive(ACTIVE_SURVEYS_FILTERS), enabled: hasSchedule },
      { queryKey: ACTIVE_ELECTIVES_KEY, queryFn: electivesApi.listActive, enabled: isStudent },
      { queryKey: notificationsQueryKeys.all(userId, IMPORTANT_FILTERS), queryFn: () => notificationsApi.list(IMPORTANT_FILTERS) },
      { queryKey: newsQueryKeys.latest(3), queryFn: () => newsApi.listLatest(3) },
    ],
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[460px_minmax(0,1fr)]">
        <div className="space-y-6">
          <ProfileSummaryCard user={user} />
          <AccountStatusCard user={user} />
        </div>

        <div className="space-y-6">
          {hasSchedule && (
            <TodayScheduleCard
              lessons={schedule.data?.lessons ?? []}
              session={schedule.data?.session ?? []}
              meta={schedule.data?.meta ?? { stale: false }}
              isLoading={schedule.isPending}
            />
          )}

          {(hasSchedule || isStudent) && (
            <div className={`grid gap-6 ${isStudent ? 'lg:grid-cols-2' : ''}`}>
              {hasSchedule && <ActiveSurveysCard surveys={surveys.data ?? []} isLoading={surveys.isPending} />}
              {isStudent && <ElectiveStatusCard items={electives.data ?? []} isLoading={electives.isPending} />}
            </div>
          )}

          <ImportantNotificationsCard items={important.data ?? []} isLoading={important.isPending} />

          <CampusNewsCard
            items={news.data?.items ?? []}
            isLoading={news.isPending}
            unavailable={news.isError || news.data?.unavailable === true}
          />
        </div>
      </div>
    </div>
  );
}
