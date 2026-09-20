import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { StudentProfile, User } from '../../types';
import { pickActiveStudentProfile } from '../../utils/activeStudentProfile';

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-4">
      <span className="font-medium text-gray-700">{label}:</span>
      <span className="min-w-0 break-words text-right text-gray-900">{value || '—'}</span>
    </div>
  );
}

function ProfileTile({ profile, isCurrent }: { profile: StudentProfile; isCurrent: boolean }) {
  const { t } = useTranslation();
  const inactive = profile.status !== 'active';
  return (
    <div className={`rounded-2xl border p-4 ${inactive ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-200 bg-white'}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{t('profile.myProfiles.group')}: {profile.group?.code ?? '—'}</p>
        {isCurrent && <span className="rounded-full bg-blue-600 px-3 py-0.5 text-xs font-medium text-white">{t('profile.myProfiles.current')}</span>}
        {!inactive && !isCurrent && <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs font-medium text-slate-500">{t('profile.myProfiles.active')}</span>}
        {inactive && <span className="rounded-full bg-slate-200 px-3 py-0.5 text-xs font-medium text-slate-600">{t('profile.myProfiles.inactive')}</span>}
      </div>
      <div className="space-y-2 text-sm">
        <InfoRow label={t('profile.specialty')} value={profile.specialty} />
        <InfoRow label={t('profile.institute')} value={profile.institute} />
        <InfoRow label={t('profile.studyForm')} value={profile.studyForm} />
      </div>
    </div>
  );
}

export default function StudentProfileSections({ user }: { user: User }) {
  const { t } = useTranslation();
  if (user.role !== 'student') return null;

  const active = pickActiveStudentProfile(user);
  const profiles = user.studentProfiles ?? [];

  return (
    <>
      <section className="rounded-3xl bg-white p-6 shadow-sm">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">{t('profile.studentInfo')}</h2>
        <div className="space-y-3 text-sm">
          <InfoRow label={t('profile.institute')} value={active?.institute} />
          <InfoRow label={t('profile.specialty')} value={active?.specialty} />
          <InfoRow label={t('profile.groupCode')} value={active?.group?.code} />
          <InfoRow label={t('profile.recordBookNumber')} value={active?.recordBookNumber} />
          <InfoRow label={t('profile.year')} value={active?.year} />
          <InfoRow label={t('profile.studyForm')} value={active?.studyForm} />
        </div>
        <p className="mt-5 text-xs text-slate-500">{t('profile.syncHint')}</p>
      </section>

      <section className="rounded-3xl bg-white p-6 shadow-sm xl:col-span-2">
        <h2 className="mb-5 text-lg font-semibold text-gray-900">{t('profile.myProfiles.title')}</h2>
        {profiles.length === 0 ? (
          <p className="text-sm text-slate-500">{t('profile.myProfiles.empty')}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {profiles.map((p) => (
              <ProfileTile key={p.id} profile={p} isCurrent={p.id === active?.id} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}
