import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { coursesApi, coursesQueryKeys } from '../../services/coursesApi';

type Props = { courseId: string; assignmentId: string; moodleUrl?: string; isAdmin: boolean; onSaved: (message: string) => void };

export default function MoodleUrlEditor({ courseId, assignmentId, moodleUrl, isAdmin, onSaved }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(moodleUrl ?? '');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: (body: { moodleUrl: string | null; reason?: string }) => coursesApi.setMoodleUrl(courseId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: coursesQueryKeys.card(assignmentId) });
      onSaved(t('courses.moodleUrl.saved'));
      setOpen(false);
    },
    onError: () => onSaved(t('courses.moodleUrl.errors.save')),
  });

  const save = (next: string | null) => mutation.mutate({ moodleUrl: next, ...(isAdmin ? { reason } : {}) });
  const reasonInvalid = isAdmin && reason.trim().length < 10;

  if (!open) {
    return <button type="button" className="text-sm text-blue-700 underline-offset-4 hover:underline" onClick={() => setOpen(true)}>{t('courses.moodleUrl.edit')}</button>;
  }
  return (
    <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="block text-xs font-medium text-slate-600">{t('courses.moodleUrl.label')}</label>
      <input className="w-full rounded-lg border px-3 py-2 text-sm" value={value} maxLength={500} placeholder="https://dist.maup.com.ua/course/view.php?id=…" onChange={(e) => setValue(e.target.value)} />
      {isAdmin && (
        <>
          <label className="block text-xs font-medium text-slate-600">{t('courses.moodleUrl.reason')}</label>
          <input className="w-full rounded-lg border px-3 py-2 text-sm" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={mutation.isPending || reasonInvalid || !value.trim()} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => save(value.trim())}>{t('courses.resources.save')}</button>
        <button type="button" disabled={mutation.isPending || reasonInvalid} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => save(null)}>{t('courses.moodleUrl.reset')}</button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600" onClick={() => setOpen(false)}>{t('courses.resources.cancel')}</button>
      </div>
    </div>
  );
}
