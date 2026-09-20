import { useMemo, useState } from 'react';
import type { SyntheticEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarCheck2, LoaderCircle, Trash2 } from 'lucide-react';
import { academicTermsApi } from '../../services/academicTermsApi';
import { CURRENT_TERM_QUERY_KEY } from '../../hooks/useCurrentTerm';
import { useAutoDismissState } from '../../hooks/useAutoDismissState';
import { getLocalizedApiErrorMessage } from '../../utils/apiErrorMessage';
import {
  buildCreateAcademicTermInput,
  derivedMaupDefaults,
  initialAcademicTermForm,
  sortAcademicTerms,
  validateAcademicTermForm,
  type AcademicTermFormState,
} from '../../utils/academicTermForm';
import type { AcademicTerm } from '../../types';

const TERMS_QUERY_KEY = ['academic-terms', 'list'];

const STATUS_LABEL_KEYS: Record<AcademicTerm['status'], string> = {
  planned: 'academicTerms.statusPlanned',
  current: 'academicTerms.statusCurrent',
  closed: 'academicTerms.statusClosed',
};

const STATUS_CLASSES: Record<AcademicTerm['status'], string> = {
  planned: 'bg-slate-100 text-slate-700',
  current: 'bg-green-100 text-green-700',
  closed: 'bg-gray-100 text-gray-500',
};

type PendingAction = { kind: 'activate' | 'remove'; term: AcademicTerm };

type ConfirmDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel,
  isBusy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{description}</p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AcademicTermsPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<AcademicTermFormState>(() =>
    initialAcademicTermForm(),
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [error, setError] = useAutoDismissState<string | null>(null);
  const [notice, setNotice] = useAutoDismissState<string | null>(null);

  const { data, isPending, isError } = useQuery({
    queryKey: TERMS_QUERY_KEY,
    queryFn: () => academicTermsApi.list(),
  });

  const terms = useMemo(() => sortAcademicTerms(data ?? []), [data]);
  const maupDefaults = derivedMaupDefaults(form);

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(
      i18n.language.startsWith('en') ? 'en-US' : 'uk-UA',
      { dateStyle: 'medium' },
    ).format(new Date(value));

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: TERMS_QUERY_KEY });
    await queryClient.invalidateQueries({ queryKey: CURRENT_TERM_QUERY_KEY });
  };

  const createTerm = useMutation({
    mutationFn: () =>
      academicTermsApi.create(buildCreateAcademicTermInput(form)),
    onSuccess: async () => {
      setNotice(t('academicTerms.created'));
      setForm(initialAcademicTermForm());
      await invalidate();
    },
    onError: (failure: unknown) =>
      setError(
        getLocalizedApiErrorMessage(
          failure,
          i18n.language,
          t('academicTerms.createError'),
        ),
      ),
  });

  const activateTerm = useMutation({
    mutationFn: (id: string) => academicTermsApi.activate(id),
    onSuccess: async () => {
      setPending(null);
      setNotice(t('academicTerms.activated'));
      await invalidate();
    },
    onError: (failure: unknown) => {
      setPending(null);
      setError(
        getLocalizedApiErrorMessage(
          failure,
          i18n.language,
          t('academicTerms.activateError'),
        ),
      );
    },
  });

  const removeTerm = useMutation({
    mutationFn: (id: string) => academicTermsApi.remove(id),
    onSuccess: async () => {
      setPending(null);
      setNotice(t('academicTerms.removed'));
      await invalidate();
    },
    onError: (failure: unknown) => {
      setPending(null);
      setError(
        getLocalizedApiErrorMessage(
          failure,
          i18n.language,
          t('academicTerms.removeError'),
        ),
      );
    },
  });

  const handleCreate = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationKey = validateAcademicTermForm(form);

    if (validationKey) {
      setError(t(validationKey));
      return;
    }

    createTerm.mutate();
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.kind === 'activate') {
      activateTerm.mutate(pending.term.id);
      return;
    }
    removeTerm.mutate(pending.term.id);
  };

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('academicTerms.title')}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {t('academicTerms.description')}
        </p>
      </div>

      {notice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {notice}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form
        onSubmit={handleCreate}
        className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          {t('academicTerms.createTitle')}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {t('academicTerms.academicYear')} *
            </span>
            <input
              type="text"
              value={form.academicYear}
              onChange={(event) =>
                setForm({ ...form, academicYear: event.currentTarget.value })
              }
              placeholder="2026/2027"
              required
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {t('academicTerms.termNumber')} *
            </span>
            <select
              value={form.termNumber}
              onChange={(event) =>
                setForm({
                  ...form,
                  termNumber: event.currentTarget.value as '1' | '2',
                })
              }
              className={inputClass}>
              <option value="1">1</option>
              <option value="2">2</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {t('academicTerms.startsAt')} *
            </span>
            <input
              type="date"
              value={form.startsAt}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.currentTarget.value })
              }
              required
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {t('academicTerms.endsAt')} *
            </span>
            <input
              type="date"
              value={form.endsAt}
              onChange={(event) =>
                setForm({ ...form, endsAt: event.currentTarget.value })
              }
              required
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {t('academicTerms.maupAcademicYear')}
            </span>
            <input
              type="text"
              value={form.maupAcademicYear}
              onChange={(event) =>
                setForm({
                  ...form,
                  maupAcademicYear: event.currentTarget.value,
                })
              }
              placeholder={String(maupDefaults.maupAcademicYear)}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              {t('academicTerms.maupSemester')}
            </span>
            <input
              type="text"
              value={form.maupSemester}
              onChange={(event) =>
                setForm({ ...form, maupSemester: event.currentTarget.value })
              }
              placeholder={String(maupDefaults.maupSemester)}
              className={inputClass}
            />
          </label>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          {t('academicTerms.maupHint', {
            year: maupDefaults.maupAcademicYear,
            semester: maupDefaults.maupSemester,
          })}
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="submit"
            disabled={createTerm.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {createTerm.isPending
              ? t('academicTerms.creating')
              : t('academicTerms.create')}
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[820px]">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('academicTerms.academicYear')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('academicTerms.termNumber')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('academicTerms.dates')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('academicTerms.maupParams')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('academicTerms.status')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('academicTerms.actions')}
              </th>
            </tr>
          </thead>

          <tbody>
            {terms.map((term) => (
              <tr key={term.id} className="border-b last:border-0">
                <td className="p-4 font-medium text-gray-900">
                  {term.academicYear}
                </td>

                <td className="p-4 text-gray-600">
                  {t('courses.termNumber', { n: term.termNumber })}
                </td>

                <td className="p-4 text-gray-600">
                  {formatDate(term.startsAt)} — {formatDate(term.endsAt)}
                </td>

                <td className="p-4 text-gray-600">
                  {term.maupAcademicYear} / {term.maupSemester}
                </td>

                <td className="p-4">
                  <span
                    className={`rounded px-2 py-1 text-xs ${STATUS_CLASSES[term.status]}`}>
                    {t(STATUS_LABEL_KEYS[term.status])}
                  </span>
                </td>

                <td className="p-4">
                  <div className="flex items-center gap-3">
                    {term.status !== 'current' && (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'activate', term })}
                        className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
                        <CalendarCheck2
                          className="h-4 w-4"
                          aria-hidden="true"
                        />
                        {t('academicTerms.activate')}
                      </button>
                    )}

                    {term.status === 'planned' && (
                      <button
                        type="button"
                        onClick={() => setPending({ kind: 'remove', term })}
                        className="text-red-600 hover:text-red-800"
                        title={t('academicTerms.remove')}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                        <span className="sr-only">
                          {t('academicTerms.remove')}
                        </span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}

            {isPending && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-gray-500">
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    {t('academicTerms.loading')}
                  </span>
                </td>
              </tr>
            )}

            {isError && !isPending && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-red-600">
                  {t('academicTerms.loadError')}
                </td>
              </tr>
            )}

            {!isPending && !isError && terms.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-sm text-gray-500">
                  {t('academicTerms.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmDialog
          title={t(
            pending.kind === 'activate'
              ? 'academicTerms.activateConfirmTitle'
              : 'academicTerms.removeConfirmTitle',
          )}
          description={t(
            pending.kind === 'activate'
              ? 'academicTerms.activateConfirmText'
              : 'academicTerms.removeConfirmText',
            {
              academicYear: pending.term.academicYear,
              termNumber: pending.term.termNumber,
            },
          )}
          confirmLabel={t(
            pending.kind === 'activate'
              ? 'academicTerms.activate'
              : 'academicTerms.remove',
          )}
          cancelLabel={t('academicTerms.cancel')}
          isBusy={activateTerm.isPending || removeTerm.isPending}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
