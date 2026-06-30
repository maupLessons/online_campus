import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import CreateUserModal from '../../components/CreateUserModal';
import api from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import type { PaginatedResponse, User } from '../../types';
import { Role, ROLE_LABEL_KEYS } from '../../types';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
type UserStatusFilter = User['status'] | '';

const EMPTY_PAGE: PaginatedResponse<User> = {
  docs: [],
  totalDocs: 0,
  limit: PAGE_SIZE_OPTIONS[0],
  page: 1,
  totalPages: 0,
  hasNextPage: false,
  hasPrevPage: false,
};

export default function UsersPage() {
  const [usersPage, setUsersPage] =
    useState<PaginatedResponse<User>>(EMPTY_PAGE);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | ''>('');
  const [statusFilter, setStatusFilter] = useState<UserStatusFilter>('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState<number>(PAGE_SIZE_OPTIONS[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const currentUser = useAuthStore((state) => state.user);
  const canManageUsers = currentUser?.role === Role.ADMIN;
  const { t } = useTranslation();

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    void api
      .get<PaginatedResponse<User>>('/users', {
        params: {
          page,
          limit,
          role: roleFilter || undefined,
          status: statusFilter || undefined,
          search: appliedSearch || undefined,
        },
        signal: controller.signal,
      })
      .then(({ data }) => {
        if (!active) return;

        if (data.totalPages > 0 && page > data.totalPages) {
          setLoading(true);
          setPage(data.totalPages);
          return;
        }
        setUsersPage(data);
      })
      .catch(() => {
        if (active && !controller.signal.aborted) {
          setUsersPage(EMPTY_PAGE);
          setError(t('users.loadError'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [appliedSearch, limit, page, refreshKey, roleFilter, statusFilter, t]);

  const handleToggleBlock = async (user: User) => {
    try {
      const { data: updated } = await api.patch<User>(
        `/users/${user.id}/block`,
      );
      setUsersPage((current) => ({
        ...current,
        docs: current.docs.map((item) =>
          item.id === user.id ? { ...item, status: updated.status } : item,
        ),
      }));
    } catch {
      setError(t('users.actionError'));
    }
  };

  const handleSearch = () => {
    setLoading(true);
    setError(null);
    setPage(1);
    setAppliedSearch(search.trim());
    if (search.trim() === appliedSearch) {
      setRefreshKey((current) => current + 1);
    }
  };
  const hasActiveFilters =
    search.trim() !== '' ||
    appliedSearch !== '' ||
    roleFilter !== '' ||
    statusFilter !== '';

  const resetFilters = () => {
    setLoading(true);
    setError(null);
    setSearch('');
    setAppliedSearch('');
    setRoleFilter('');
    setStatusFilter('');
    setPage(1);
  };

  const currentPage = usersPage.totalPages === 0 ? 0 : usersPage.page;
  const totalPages = usersPage.totalPages;

  return (
    <div>
      <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="text-2xl font-bold text-gray-900">{t('users.title')}</h1>
        {canManageUsers && (
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
          >
            {t('users.addUser')}
          </button>
        )}
      </div>

      <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') handleSearch();
              }}
              placeholder={t('users.searchPlaceholder')}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 sm:flex-1"
            />

            <button
              type="button"
              onClick={handleSearch}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 sm:w-auto"
            >
              {t('users.searchButton')}
            </button>
          </div>

          <select
            value={roleFilter}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setRoleFilter(event.target.value as Role | '');
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 lg:w-auto"
            aria-label={t('users.role')}
          >
            <option value="">{t('users.allRoles')}</option>
            {Object.values(Role).map((role) => (
              <option key={role} value={role}>
                {t(ROLE_LABEL_KEYS[role])}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(event) => {
              setLoading(true);
              setError(null);
              setStatusFilter(event.target.value as UserStatusFilter);
              setPage(1);
            }}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 lg:w-auto"
            aria-label={t('users.status')}
          >
            <option value="">{t('users.allStatuses')}</option>
            <option value="active">{t('users.statusActive')}</option>
            <option value="blocked">{t('users.statusBlocked')}</option>
          </select>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="whitespace-nowrap">{t('users.perPage')}</span>
            <select
              value={limit}
              onChange={(event) => {
                setLoading(true);
                setError(null);
                setLimit(Number(event.target.value));
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PAGE_SIZE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={resetFilters}
            disabled={!hasActiveFilters}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300 lg:w-auto"
          >
            {t('users.resetFilters')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[700px]">
          <thead className="border-b bg-gray-50">
            <tr>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('users.fullName')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('users.role')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('users.email')}
              </th>
              <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                {t('users.status')}
              </th>
              {canManageUsers && (
                <th className="p-4 text-left text-xs font-semibold uppercase text-gray-500">
                  {t('users.actions')}
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {usersPage.docs.map((user) => (
              <tr
                key={user.id}
                className="border-b last:border-0 hover:bg-gray-50"
              >
                <td className="p-4">
                  <div className="font-medium text-gray-900">
                    {user.lastName} {user.firstName} {user.middleName || ''}
                  </div>
                </td>

                <td className="p-4">
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700">
                    {t(ROLE_LABEL_KEYS[user.role])}
                  </span>
                </td>

                <td className="p-4 text-gray-600">{user.email}</td>

                <td className="p-4">
                  <span
                    className={`rounded px-2 py-1 text-xs ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {user.status === 'active'
                      ? t('users.statusActive')
                      : t('users.statusBlocked')}
                  </span>
                </td>

                {canManageUsers && (
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingUser(user);
                          setIsCreateModalOpen(true);
                        }}
                        className="text-blue-600 transition-colors hover:text-blue-800"
                        title={t('users.edit')}
                      >
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleToggleBlock(user)}
                        className={`transition-colors ${
                          user.status === 'active'
                            ? 'text-red-500 hover:text-red-700'
                            : 'text-green-600 hover:text-green-800'
                        }`}
                        title={
                          user.status === 'active'
                            ? t('users.block')
                            : t('users.unblock')
                        }
                      >
                        {user.status === 'active' ? (
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-5 w-5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}

            {loading && usersPage.docs.length === 0 && (
              <tr>
                <td
                  colSpan={canManageUsers ? 5 : 4}
                  className="p-10 text-center text-sm text-gray-500"
                >
                  <span className="inline-flex items-center gap-2">
                    <LoaderCircle
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                    {t('users.loading')}
                  </span>
                </td>
              </tr>
            )}

            {!loading && usersPage.docs.length === 0 && (
              <tr>
                <td
                  colSpan={canManageUsers ? 5 : 4}
                  className="p-10 text-center text-sm text-gray-500"
                >
                  {t('users.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-gray-600">
          {t('users.pageInfo', {
            page: currentPage,
            total: totalPages,
            count: usersPage.totalDocs,
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setPage((current) => Math.max(1, current - 1));
            }}
            disabled={!usersPage.hasPrevPage || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {t('users.previous')}
          </button>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setError(null);
              setPage((current) => current + 1);
            }}
            disabled={!usersPage.hasNextPage || loading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
          >
            {t('users.next')}
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {canManageUsers && (
        <CreateUserModal
          key={`${isCreateModalOpen ? 'open' : 'closed'}-${editingUser?.id ?? 'create'}`}
          isOpen={isCreateModalOpen}
          userToEdit={editingUser}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingUser(null);
          }}
          onSuccess={() => {
            setLoading(true);
            setError(null);
            setRefreshKey((current) => current + 1);
          }}
        />
      )}
    </div>
  );
}
