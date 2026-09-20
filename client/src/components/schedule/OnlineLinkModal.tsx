import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { scheduleApi } from '../../services/scheduleApi';
import type { OnlineLessonLink, ScheduleEntry } from '../../types';
import { deriveInitialScope, type LinkScope } from '../../utils/onlineLinkScope';

type Props = { entry: ScheduleEntry; existingLink?: OnlineLessonLink; onClose: () => void };

export default function OnlineLinkModal({ entry, existingLink, onClose }: Props) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [url, setUrl] = useState(entry.onlineUrl ?? '');
  const [scope, setScope] = useState<LinkScope>(() => deriveInitialScope(existingLink));
  const [error, setError] = useState<string | null>(null);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['schedule'] });

  const save = useMutation({
    mutationFn: () => scheduleApi.upsertLink({
      groupCode: entry.groupCode, subjectKey: entry.subjectKey, url,
      ...(scope === 'pair' ? { date: entry.date, startTime: entry.startTime } : {}),
      ...(scope === 'date' ? { date: entry.date } : {}),
    }),
    onSuccess: async () => { await invalidate(); onClose(); },
    onError: () => setError(t('schedule.linkSaveError')),
  });
  const remove = useMutation({
    mutationFn: () => scheduleApi.deleteLink(existingLink?._id as string),
    onSuccess: async () => { await invalidate(); onClose(); },
    onError: () => setError(t('schedule.linkDeleteError')),
  });

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <h2 className="text-lg font-semibold">{t('schedule.setLink')}</h2>
        <p className="text-sm text-gray-600">{entry.courseTitle} · {entry.groupCode} · {entry.date} {entry.startTime}</p>
        <input type="url" required pattern="https://.*" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" className="w-full rounded-lg border px-3 py-2" />
        <div className="flex gap-4 text-sm">
          <label><input type="radio" checked={scope === 'pair'} onChange={() => setScope('pair')} /> {t('schedule.linkScopePair')}</label>
          <label><input type="radio" checked={scope === 'subject'} onChange={() => setScope('subject')} /> {t('schedule.linkScopeSubject')}</label>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          {existingLink && <button type="button" onClick={() => remove.mutate()} className="text-red-600">{t('common.delete')}</button>}
          <button type="button" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" disabled={save.isPending} className="rounded-lg bg-blue-600 px-4 py-2 text-white">{t('common.save')}</button>
        </div>
      </form>
    </div>
  );
}
