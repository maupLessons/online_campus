import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { coursesApi, coursesQueryKeys } from '../../services/coursesApi';
import { MAX_RESOURCES, validateResourceUrl } from '../../utils/resourceLinks';
import type { CourseResource, CourseResourceType, ResourceInput } from '../../types';

const TYPES: CourseResourceType[] = ['link', 'video', 'document', 'other'];

type Props = { assignmentId: string; resources: CourseResource[]; onClose: () => void; onSaved: (message: string) => void };

export default function ResourcesEditor({ assignmentId, resources, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<ResourceInput[]>(resources.map(({ title, type, url }) => ({ title, type, url })));
  const [errors, setErrors] = useState<Record<number, string>>({});

  const mutation = useMutation({
    mutationFn: (next: ResourceInput[]) => coursesApi.setResources(assignmentId, next),
    onSuccess: (card) => {
      queryClient.setQueryData(coursesQueryKeys.card(assignmentId), card);
      onSaved(t('courses.resources.saved'));
      onClose();
    },
    onError: () => onSaved(t('courses.resources.errors.save')),
  });

  const update = (index: number, patch: Partial<ResourceInput>) =>
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const submit = () => {
    const nextErrors: Record<number, string> = {};
    rows.forEach((row, i) => {
      if (!row.title.trim()) nextErrors[i] = t('courses.resources.errors.title');
      const urlError = validateResourceUrl(row.url);
      if (urlError) nextErrors[i] = t(urlError);
    });
    if (rows.length > MAX_RESOURCES) nextErrors[-1] = t('courses.resources.errors.limit', { max: MAX_RESOURCES });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) mutation.mutate(rows.map((r) => ({ ...r, title: r.title.trim(), url: r.url.trim() })));
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 md:grid-cols-[1fr_140px_2fr_auto]">
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder={t('courses.resources.titleLabel')} value={row.title} maxLength={120} onChange={(e) => update(i, { title: e.target.value })} />
          <select className="rounded-lg border px-3 py-2 text-sm" value={row.type} onChange={(e) => update(i, { type: e.target.value as CourseResourceType })}>
            {TYPES.map((type) => <option key={type} value={type}>{t(`courses.resources.types.${type}`)}</option>)}
          </select>
          <input className="rounded-lg border px-3 py-2 text-sm" placeholder={t('courses.resources.urlLabel')} value={row.url} maxLength={500} onChange={(e) => update(i, { url: e.target.value })} />
          <button type="button" aria-label={t('courses.resources.remove')} className="text-slate-500 hover:text-red-600" onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
          {errors[i] && <p className="md:col-span-4 text-xs text-red-600">{errors[i]}</p>}
        </div>
      ))}
      {errors[-1] && <p className="text-xs text-red-600">{errors[-1]}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={rows.length >= MAX_RESOURCES} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-sm disabled:opacity-50" onClick={() => setRows((prev) => [...prev, { title: '', type: 'link', url: '' }])}>
          <Plus className="h-4 w-4" /> {t('courses.resources.add')}
        </button>
        <button type="button" disabled={mutation.isPending} className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={submit}>{t('courses.resources.save')}</button>
        <button type="button" className="rounded-lg px-3 py-2 text-sm text-slate-600" onClick={onClose}>{t('courses.resources.cancel')}</button>
      </div>
    </div>
  );
}
