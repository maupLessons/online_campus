import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCurrentTerm } from '../hooks/useCurrentTerm';
import { useAuthStore } from '../store/authStore';
import { Role } from '../types';

/**
 * Shown to all roles if `/academic-terms/current` returns 404.
 * Stays silent during loading and on a network error: the banner must mean
 * "no period configured", not "the server is currently unavailable".
 */
export default function NoCurrentTermBanner() {
  const { t } = useTranslation();
  const { term, isLoading, isError } = useCurrentTerm();
  const role = useAuthStore((state) => state.user?.role ?? null);

  if (isLoading || isError || term) {
    return null;
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center">
      <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />

      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t('noCurrentTerm.title')}</p>
        <p className="mt-1 leading-5">{t('noCurrentTerm.description')}</p>
      </div>

      {role === Role.ADMIN && (
        <Link
          to="/admin/academic-terms"
          className="shrink-0 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700">
          {t('noCurrentTerm.adminAction')}
        </Link>
      )}
    </div>
  );
}
