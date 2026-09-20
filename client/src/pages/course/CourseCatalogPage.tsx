import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { useTranslation } from 'react-i18next';
import { coursesApi, coursesQueryKeys } from '../../services/coursesApi';
import { ReferenceType, referencesApi, type DepartmentReference } from '../../services/referencesApi';
import { useAuthStore } from '../../store/authStore';
import { useAutoDismissState } from '../../hooks/useAutoDismissState';
import { Role, type CourseCatalogItem, type CourseStatus, type CreateCourseInput } from '../../types';

const emptyForm: CreateCourseInput = { code: '', name: '', description: '', departmentId: '', credits: 3, externalSubjectId: '', moodleUrl: '' };

export default function CourseCatalogPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const canWrite = user?.role === Role.DEPARTMENT_HEAD || user?.role === Role.ADMIN;
  const showDepartmentFilter = user?.role === Role.DEAN || user?.role === Role.ADMIN;

  const [status, setStatus] = useState<CourseStatus>('active');
  const [departmentId, setDepartmentId] = useState('');
  const [editing, setEditing] = useState<CourseCatalogItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateCourseInput>(emptyForm);
  const [moodleUrlReason, setMoodleUrlReason] = useState('');
  const [message, setMessage] = useAutoDismissState<string>('');
  const isAdmin = user?.role === Role.ADMIN;

  const filters = useMemo(() => ({ status, departmentId: departmentId || undefined, limit: 100 }), [status, departmentId]);
  const { data, isLoading, isError } = useQuery({ queryKey: coursesQueryKeys.catalog(filters), queryFn: () => coursesApi.listCatalog(filters) });
  const { data: departments = [] } = useQuery({
    queryKey: ['references', ReferenceType.DEPARTMENTS],
    queryFn: () => referencesApi.listOptions<DepartmentReference>(ReferenceType.DEPARTMENTS),
    enabled: showDepartmentFilter || creating,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['courses', 'catalog'] });
  // the server returns 409 with a code: course_code_taken | course_external_subject_id_taken (+ courseCode)
  const onError = (error: unknown) => {
    const response = error instanceof AxiosError ? error.response : undefined;
    const body = response?.data as { code?: string; courseCode?: string } | undefined;
    if (response?.status === 409 && body?.code === 'course_external_subject_id_taken') {
      setMessage(t('catalog.errors.externalSubjectIdTaken', { code: body.courseCode ?? '' }));
      return;
    }
    setMessage(t(response?.status === 409 ? 'catalog.errors.codeExists' : 'catalog.errors.save'));
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateCourseInput) => coursesApi.createCourse({
      ...input,
      description: input.description || undefined,
      externalSubjectId: input.externalSubjectId?.trim() || undefined,
      moodleUrl: input.moodleUrl || undefined,
    }),
    onSuccess: () => { invalidate(); setCreating(false); setForm(emptyForm); setMessage(t('catalog.saved')); },
    onError,
  });
  const updateMutation = useMutation({
    // we always send externalSubjectId: an empty string REMOVES the key on the server (§4.1a)
    mutationFn: ({ id, input }: { id: string; input: CreateCourseInput }) => coursesApi.updateCourse(id, {
      name: input.name,
      description: input.description || undefined,
      credits: input.credits,
      externalSubjectId: (input.externalSubjectId ?? '').trim(),
    }),
    onSuccess: () => { invalidate(); setEditing(null); setMessage(t('catalog.saved')); },
    onError,
  });
  // Moodle URL — a separate endpoint (§4.1a): an empty field means "remove the link" (null),
  // a non-empty one — a new value. An error here isn't a 409 code/key conflict, so it's a separate, simpler
  // onError (the same text as MoodleUrlEditor on the discipline card). The admin must provide a
  // reason (server: courses.service.ts setMoodleUrl) — the same rule as in MoodleUrlEditor.
  const moodleUrlMutation = useMutation({
    mutationFn: ({ id, moodleUrl, reason }: { id: string; moodleUrl: string | null; reason?: string }) =>
      coursesApi.setMoodleUrl(id, { moodleUrl, reason }),
    onSuccess: () => { invalidate(); setEditing(null); setMoodleUrlReason(''); setMessage(t('catalog.saved')); },
    onError: () => setMessage(t('courses.moodleUrl.errors.save')),
  });
  const archiveMutation = useMutation({
    mutationFn: (course: CourseCatalogItem) => (course.status === 'active' ? coursesApi.archiveCourse(course.id) : coursesApi.restoreCourse(course.id)),
    onSuccess: () => { invalidate(); setMessage(t('catalog.saved')); },
    onError: (error: unknown) => {
      const status = error instanceof AxiosError ? error.response?.status : undefined;
      setMessage(t(status === 409 ? 'catalog.archiveBlocked' : 'catalog.errors.save'));
    },
  });

  const startEdit = (course: CourseCatalogItem) => {
    setEditing(course);
    setForm({ code: course.code, name: course.name, description: course.description ?? '', departmentId: course.departmentId, credits: course.credits, externalSubjectId: course.externalSubjectId ?? '', moodleUrl: course.moodleUrl ?? '' });
    setMoodleUrlReason('');
  };

  // Comparison with the original — both for submit and to show the "reason" field to the admin.
  const nextMoodleUrl = (form.moodleUrl ?? '').trim();
  const moodleUrlChanged = editing !== null && nextMoodleUrl !== (editing.moodleUrl ?? '');
  // The admin must provide a reason (server: courses.service.ts setMoodleUrl) only when actually
  // changing the link — the same rule as in MoodleUrlEditor.
  const showMoodleUrlReason = isAdmin && moodleUrlChanged;
  const moodleUrlReasonInvalid = showMoodleUrlReason && moodleUrlReason.trim().length < 10;

  // Editing may touch two different endpoints: PATCH /courses/:id (name/description/credits/MAUP key)
  // and PATCH /courses/:id/moodle-url (separate, because authorization/audit differ on the server). We call
  // moodle-url AFTER updateCourse, and only the one that actually changed.
  const submitEdit = async () => {
    if (!editing) return;
    if (moodleUrlReasonInvalid) return;
    const fieldsChanged =
      form.name !== editing.name ||
      (form.description || '') !== (editing.description ?? '') ||
      form.credits !== editing.credits ||
      (form.externalSubjectId ?? '').trim() !== (editing.externalSubjectId ?? '');
    if (!fieldsChanged && !moodleUrlChanged) {
      setEditing(null);
      return;
    }
    try {
      if (fieldsChanged) {
        await updateMutation.mutateAsync({ id: editing.id, input: form });
      }
      if (moodleUrlChanged) {
        await moodleUrlMutation.mutateAsync({
          id: editing.id,
          moodleUrl: nextMoodleUrl || null,
          ...(isAdmin ? { reason: moodleUrlReason.trim() } : {}),
        });
      }
    } catch {
      // onError of the corresponding mutation already showed the message
    }
  };

  const submit = () => (editing ? void submitEdit() : createMutation.mutate(form));
  const formOpen = creating || editing !== null;
  const colCount = canWrite ? 8 : 7; // code, name, credits, status, MAUP key, moodle, assignments [, actions]

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('catalog.title')}</h1>
          <p className="text-sm text-slate-500">{t('catalog.subtitle')}</p>
        </div>
        {canWrite && !formOpen && (
          <button type="button" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white" onClick={() => { setForm(emptyForm); setCreating(true); }}>{t('catalog.create')}</button>
        )}
      </div>

      {message && <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}

      <div className="flex flex-wrap gap-3">
        <label className="text-sm">
          <span className="mr-2 text-slate-600">{t('catalog.filters.status')}</span>
          <select className="rounded-lg border px-3 py-2" value={status} onChange={(e) => setStatus(e.target.value as CourseStatus)}>
            <option value="active">{t('catalog.status.active')}</option>
            <option value="archived">{t('catalog.status.archived')}</option>
          </select>
        </label>
        {showDepartmentFilter && (
          <label className="text-sm">
            <span className="mr-2 text-slate-600">{t('catalog.filters.department')}</span>
            <select className="rounded-lg border px-3 py-2" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">—</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        )}
      </div>

      {formOpen && (
        <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <label className="text-sm">{t('catalog.form.code')}<input required disabled={Boolean(editing)} className="mt-1 w-full rounded-lg border px-3 py-2" value={form.code} maxLength={32} onChange={(e) => setForm({ ...form, code: e.target.value })} /></label>
          <label className="text-sm">{t('catalog.form.name')}<input required className="mt-1 w-full rounded-lg border px-3 py-2" value={form.name} maxLength={200} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="text-sm">{t('catalog.form.credits')}<input required type="number" step="0.5" min="0.5" max="30" className="mt-1 w-full rounded-lg border px-3 py-2" value={form.credits} onChange={(e) => setForm({ ...form, credits: Number(e.target.value) })} /></label>
          {!editing && (
            <label className="text-sm">{t('catalog.form.department')}
              <select required className="mt-1 w-full rounded-lg border px-3 py-2" value={form.departmentId} onChange={(e) => setForm({ ...form, departmentId: e.target.value })}>
                <option value="">—</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </label>
          )}
          <label className="text-sm">{t('catalog.form.externalSubjectId')}
            <input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.externalSubjectId} maxLength={64} pattern="[A-Za-z0-9._-]*" placeholder="1001" onChange={(e) => setForm({ ...form, externalSubjectId: e.target.value })} />
            <span className="mt-1 block text-xs text-slate-500">{t('catalog.form.externalSubjectIdHint')}</span>
          </label>
          <label className="text-sm md:col-span-2">{t('catalog.form.moodleUrl')}<input className="mt-1 w-full rounded-lg border px-3 py-2" value={form.moodleUrl} maxLength={500} onChange={(e) => setForm({ ...form, moodleUrl: e.target.value })} /></label>
          {showMoodleUrlReason && (
            <label className="text-sm md:col-span-2">{t('courses.moodleUrl.reason')}<input className="mt-1 w-full rounded-lg border px-3 py-2" value={moodleUrlReason} maxLength={500} onChange={(e) => setMoodleUrlReason(e.target.value)} /></label>
          )}
          <label className="text-sm md:col-span-2">{t('catalog.form.description')}<textarea className="mt-1 w-full rounded-lg border px-3 py-2" rows={3} value={form.description} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <div className="flex gap-2 md:col-span-2">
            <button type="submit" disabled={createMutation.isPending || updateMutation.isPending || moodleUrlMutation.isPending || moodleUrlReasonInvalid} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{t('catalog.form.save')}</button>
            <button type="button" className="rounded-lg px-4 py-2 text-sm text-slate-600" onClick={() => { setCreating(false); setEditing(null); setMoodleUrlReason(''); }}>{t('catalog.form.cancel')}</button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">{t('catalog.columns.code')}</th>
              <th className="px-4 py-3">{t('catalog.columns.name')}</th>
              <th className="px-4 py-3">{t('catalog.columns.credits')}</th>
              <th className="px-4 py-3">{t('catalog.columns.status')}</th>
              <th className="px-4 py-3">{t('catalog.columns.externalSubjectId')}</th>
              <th className="px-4 py-3">{t('catalog.columns.moodle')}</th>
              <th className="px-4 py-3">{t('catalog.columns.assignments')}</th>
              {canWrite && <th className="px-4 py-3">{t('catalog.columns.actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isError && <tr><td colSpan={colCount} className="px-4 py-6 text-center text-red-700">{t('courses.loadError')}</td></tr>}
            {!isError && isLoading && <tr><td colSpan={colCount} className="px-4 py-6 text-center text-slate-400">{t('common.loading')}</td></tr>}
            {!isError && !isLoading && (data?.docs.length ?? 0) === 0 && <tr><td colSpan={colCount} className="px-4 py-6 text-center text-slate-400">{t('catalog.empty')}</td></tr>}
            {!isError && data?.docs.map((course) => (
              <tr key={course.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono">{course.code}</td>
                <td className="px-4 py-3">{course.name}</td>
                <td className="px-4 py-3">{course.credits}</td>
                <td className="px-4 py-3">{t(`catalog.statusValue.${course.status}`)}</td>
                <td className="px-4 py-3 font-mono text-slate-500">{course.externalSubjectId ?? '—'}</td>
                <td className="max-w-[200px] truncate px-4 py-3 text-slate-500">{course.moodleUrl ? course.moodleUrl.replace(/^https:\/\//, '') : '—'}</td>
                <td className="px-4 py-3">{course.activeAssignmentsCount ?? 0}</td>
                {canWrite && (
                  <td className="space-x-3 px-4 py-3">
                    {course.status === 'active' && <button type="button" className="text-blue-700 hover:underline" onClick={() => startEdit(course)}>{t('catalog.edit')}</button>}
                    <button
                      type="button"
                      disabled={course.status === 'active' && (course.activeAssignmentsCount ?? 0) > 0}
                      title={course.status === 'active' && (course.activeAssignmentsCount ?? 0) > 0 ? t('catalog.archiveBlocked') : undefined}
                      className="text-slate-700 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => {
                        if (course.status === 'active' && !window.confirm(t('catalog.archiveConfirm', { code: course.code }))) return;
                        archiveMutation.mutate(course);
                      }}
                    >
                      {course.status === 'active' ? t('catalog.archive') : t('catalog.restore')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
