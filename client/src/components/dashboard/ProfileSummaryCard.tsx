import { useTranslation } from 'react-i18next';

import { ROLE_LABEL_KEYS, type User } from '../../types';

type Props = {
  user: User | null;
};

type InfoTileProps = {
  label: string;
  value: string | number | null | undefined;
};

function InfoTile({ label, value }: InfoTileProps) {
  return (
    <div className="min-w-0 rounded-2xl bg-slate-50 px-4 py-3">
      <p className="mb-1 text-xs text-slate-400">{label}</p>

      <p
        className="truncate text-sm font-semibold text-slate-900"
        title={value ? String(value) : '—'}>
        {value || '—'}
      </p>
    </div>
  );
}

export default function ProfileSummaryCard({ user }: Props) {
  const { t } = useTranslation();

  const fullName = [user?.lastName, user?.firstName, user?.middleName]
    .filter(Boolean)
    .join(' ');

  const initials = `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`;

  const profileId =
    user?.studentProfile?.recordBookNumber || user?.login || '—';

  const groupOrPosition = user?.studentProfile
    ? user.studentProfile.group || '—'
    : user?.teacherProfile?.position || '—';

  const year = user?.studentProfile?.year
    ? t('dashboard.studyYearValue', { year: user.studentProfile.year })
    : '—';

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="flex items-start gap-4">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-2xl font-bold text-blue-700">
          {initials || 'U'}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-600">
            {user ? t(ROLE_LABEL_KEYS[user.role]) : '—'}
          </p>

          <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-900">
            {fullName || '—'}
          </h3>

          <p className="mt-1 text-sm text-slate-400">ID: {profileId}</p>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <InfoTile label={t('dashboard.email')} value={user?.email} />
        <InfoTile label={t('dashboard.phone')} value={user?.phone} />

        <InfoTile
          label={
            user?.studentProfile
              ? t('dashboard.groupId')
              : t('dashboard.position')
          }
          value={groupOrPosition}
        />

        <InfoTile label={t('dashboard.studyYear')} value={year} />
      </div>
    </div>
  );
}
