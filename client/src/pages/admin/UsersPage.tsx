import { useEffect, useState } from 'react';
import api from '../../services/api';
import type { User } from '../../types';
import { Role, ROLE_LABEL_KEYS } from '../../types';
import { useTranslation } from 'react-i18next';
import CreateUserModal from '../../components/CreateUserModal';
import { useAuthStore } from '../../store/authStore';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const currentUser = useAuthStore((state) => state.user);
  const canManageUsers = currentUser?.role === Role.ADMIN;
  const { t } = useTranslation();

  const handleToggleBlock = async (user: User) => {
    try {
      const { data: updated } = await api.patch(`/users/${user.id}/block`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, status: updated.status } : u)));
    } catch {
      // error
    }
  };

  useEffect(() => {
    const params = new URLSearchParams();
    if (roleFilter) params.set('role', roleFilter);

    api
      .get(`/users?${params}`)
      .then(({ data }) => {
        const fetchedUsers = Array.isArray(data) ? data : data.docs || [];
        setUsers(fetchedUsers);
      })
      .catch(() => {});
  }, [roleFilter, refreshKey]);

  const handleSearch = async () => {
    if (!search.trim()) return;
    try {
      const { data } = await api.get(
        `/users/search?q=${encodeURIComponent(search)}`,
      );
      setUsers(data);
    } catch {
      // error
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {t('users.title')}
        </h1>
        {canManageUsers && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {t('users.addUser')}
          </button>
        )}
      </div>

      {!canManageUsers && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          {t('users.readOnlyStudentDirectory')}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-col gap-2 flex-1 sm:flex-row">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={t('users.searchPlaceholder')}
              className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />

            <button
              onClick={handleSearch}
              className="w-full sm:w-auto px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
              {t('users.searchButton')}
            </button>
          </div>

          {canManageUsers && (
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">{t('users.allRoles')}</option>
              {Object.values(Role).map((role) => (
                <option key={role} value={role}>
                  {t(ROLE_LABEL_KEYS[role])}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-[700px] w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">
                {t('users.fullName')}
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">
                {t('users.role')}
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">
                {t('users.email')}
              </th>
              <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">
                {t('users.status')}
              </th>
              {canManageUsers && (
                <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">
                  {t('users.actions')}
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {users.map((user) => (
              <tr
                key={user.id}
                className="border-b last:border-0 hover:bg-gray-50">
                <td className="p-4">
                  <div className="font-medium text-gray-900">
                    {user.lastName} {user.firstName} {user.middleName || ''}
                  </div>
                </td>

                <td className="p-4">
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    {t(ROLE_LABEL_KEYS[user.role])}
                  </span>
                </td>

                <td className="p-4 text-gray-600">{user.email}</td>

                <td className="p-4">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      user.status === 'active'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                    {user.status === 'active'
                      ? t('users.statusActive')
                      : t('users.statusBlocked')}
                  </span>
                </td>

                {canManageUsers && (
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingUser(user);
                        setIsCreateModalOpen(true);
                      }}
                      className="text-blue-600 hover:text-blue-800 transition-colors"
                      title={t('users.edit')}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleBlock(user)}
                      className={`transition-colors ${
                        user.status === 'active'
                          ? 'text-red-500 hover:text-red-700'
                          : 'text-green-600 hover:text-green-800'
                      }`}
                      title={user.status === 'active' ? t('users.block') : t('users.unblock')}
                    >
                      {user.status === 'active' ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
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
          onSuccess={() => setRefreshKey((prev) => prev + 1)}
        />
      )}
    </div>
  );
}
