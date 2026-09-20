import { useTranslation } from 'react-i18next';

import { ROLE_LABEL_KEYS, type User } from '../../types';

type Props = {
  user: User | null;
};

type StatTileProps = {
  label: string;
  value: string;
};

function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="min-w-0 rounded-[24px] bg-slate-50 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">
        {label}
      </p>

      <p className="mt-3 truncate text-lg font-semibold text-slate-900" title={value}>
        {value}
      </p>
    </div>
  );
}

export default function AccountStatusCard({ user }: Props) {
  const { t } = useTranslation();

  const role = user ? t(ROLE_LABEL_KEYS[user.role]) : '—';

  const status =
    user?.status === 'active'
      ? t('status.active')
      : user?.status === 'blocked'
        ? t('status.blocked')
        : '—';

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <h3 className="mb-5 text-lg font-semibold text-slate-900">
        {t('dashboard.accountStatus')}
      </h3>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label={t('dashboard.role')} value={role} />
        <StatTile label={t('dashboard.status')} value={status} />
      </div>
    </div>
  );
}
