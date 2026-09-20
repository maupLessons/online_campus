import { useTranslation } from 'react-i18next';
import type { ScheduleMeta } from '../../types';

// noSnapshotKey: on teacher schedule pages, spec §6 requires longer text
// ("Data will appear after the first login by a student of the group…"), elsewhere — the short §7 of spec 03.
type Props = { meta: ScheduleMeta; noSnapshotKey?: 'schedule.unavailable' | 'schedule.noSnapshotTeacher' };

export default function StaleBanner({ meta, noSnapshotKey = 'schedule.unavailable' }: Props) {
  const { t, i18n } = useTranslation();
  const info = (key: string) => <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t(key)}</p>;
  if (meta.reason === 'no_current_term') return info('schedule.noCurrentTerm');
  if (meta.reason === 'no_active_profile') return info('schedule.noActiveProfile');
  // Spec §5.3 / §6: for a teacher without externalTeacherId the view can't be built — separate text.
  if (meta.reason === 'no_external_teacher_id') return info('schedule.noExternalTeacherId');
  if (meta.reason === 'no_snapshot') return <p className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{t(noSnapshotKey)}</p>;
  if (!meta.stale || !meta.fetchedAt) return null;
  const at = new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-US' : 'uk-UA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(meta.fetchedAt));
  return <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">{t('schedule.stale', { at })}</p>;
}
