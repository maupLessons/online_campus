import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { Role, ROLE_LABEL_KEYS } from '../types';
import NotificationsBell from './notifications/NotificationsBell';
import LanguageSwitcher from './LanguageSwitcher';

const ALL_ROLES = Object.values(Role) as Role[];

const NAV_ITEMS: {
  labelKey: string;
  path: string;
  roles: Role[];
}[] = [
  { labelKey: 'nav.profile', path: '/profile', roles: ALL_ROLES },
  { labelKey: 'nav.dashboard', path: '/dashboard', roles: ALL_ROLES },
  { labelKey: 'nav.schedule', path: '/schedule', roles: ALL_ROLES },
  {
    labelKey: 'nav.courses',
    path: '/courses',
    roles: [Role.STUDENT, Role.TEACHER, Role.DEPARTMENT_HEAD, Role.DEAN],
  },
  {
    labelKey: 'nav.assignments',
    path: '/assignments',
    roles: [Role.STUDENT],
  },
  {
    labelKey: 'nav.grades',
    path: '/grades',
    roles: [Role.STUDENT],
  },
  {
    labelKey: 'nav.surveys',
    path: '/surveys',
    roles: [Role.STUDENT, Role.TEACHER],
  },
  {
    labelKey: 'nav.surveyAdmin',
    path: '/surveys/admin',
    roles: [Role.ADMIN, Role.DEAN, Role.RECTOR],
  },
  {
    labelKey: 'nav.electives',
    path: '/electives',
    roles: [Role.STUDENT],
  },
  {
    labelKey: 'nav.electiveAdmin',
    path: '/electives/admin',
    roles: [
      Role.ADMIN,
      Role.DEPARTMENT_HEAD,
      Role.DEAN,
      Role.RECTOR,
      Role.PRESIDENT,
    ],
  },
  {
    labelKey: 'nav.users',
    path: '/users',
    roles: [Role.ADMIN, Role.PRESIDENT, Role.RECTOR, Role.DEAN],
  },
  {
    labelKey: 'nav.auditLog',
    path: '/audit-log',
    roles: [Role.ADMIN],
  },
  {
    labelKey: 'nav.references',
    path: '/references',
    roles: ALL_ROLES,
  },
];

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const { user, logout, loadProfile, isAuthenticated } = useAuthStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!user && isAuthenticated) {
      void loadProfile().catch(() => undefined);
    }
  }, [user, isAuthenticated, loadProfile]);

  const visibleNavItems = NAV_ITEMS.filter((item) =>
    user ? item.roles.includes(user.role) : false,
  );

  const handleLogout = async () => {
    setSidebarOpen(false);
    await logout().catch(() => undefined);
    navigate('/login', { replace: true });
  };

  const pageTitle = useMemo(() => {
    if (location.pathname.startsWith('/surveys/admin')) {
      return t('nav.surveyAdmin');
    }

    if (location.pathname.startsWith('/surveys')) {
      return t('nav.surveys');
    }

    if (location.pathname.startsWith('/electives/admin')) {
      return t('nav.electiveAdmin');
    }

    if (location.pathname.startsWith('/electives')) {
      return t('nav.electives');
    }

    switch (location.pathname) {
      case '/dashboard':
        return t('nav.dashboard');
      case '/profile':
        return t('nav.profile');
      case '/schedule':
        return t('nav.schedule');
      case '/courses':
        return t('nav.courses');
      case '/assignments':
        return t('nav.assignments');
      case '/grades':
        return t('nav.grades');
      case '/users':
        return t('nav.users');
      case '/notifications':
        return t('nav.notifications');
      case '/audit-log':
        return t('nav.auditLog');
      case '/references':
        return t('nav.references');
      default:
        return t('app.title');
    }
  }, [location.pathname, t]);

  const greetingName =
    user?.firstName ||
    user?.lastName ||
    user?.login ||
    t('dashboard.userFallback');

  const headerTitle =
    location.pathname === '/dashboard'
      ? t('dashboard.welcome', { name: greetingName })
      : pageTitle;

  const currentDate = useMemo(() => {
    const locale = i18n.language.startsWith('en') ? 'en-US' : 'uk-UA';
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }, [i18n.language]);

  return (
    <div className="min-h-screen bg-[#f3f6fb]">
      {sidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-40
          w-[280px] bg-[#16233b] text-white
          transform transition-transform duration-300
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:translate-x-0
        `}>
        <div className="flex h-full flex-col">
          <div className="border-b border-white/10 px-6 py-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white p-1.5 shadow-lg">
                <img
                  src="/maup_logo.svg"
                  alt={t('login.logoAlt')}
                  className="h-full w-full object-contain"
                />
              </div>

              <div>
                <h1 className="text-lg font-semibold tracking-wide">
                  {t('app.title')}
                </h1>

                {user && (
                  <p className="mt-1 text-sm text-slate-300">
                    {t(ROLE_LABEL_KEYS[user.role])}
                  </p>
                )}
              </div>
            </div>
          </div>

          <nav className="flex-1 px-4 py-6">
            <div className="space-y-2">
              {visibleNavItems.map((item) => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/dashboard' &&
                    location.pathname.startsWith(item.path));

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={
                      isActive
                        ? 'flex items-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)]'
                        : 'flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white'
                    }>
                    {t(item.labelKey)}
                  </Link>
                );
              })}

              <Link
                to="/notifications"
                onClick={() => setSidebarOpen(false)}
                className={
                  location.pathname === '/notifications'
                    ? 'flex items-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)]'
                    : 'flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white'
                }>
                {t('nav.notifications')}
              </Link>
            </div>
          </nav>

          <div className="border-t border-white/10 px-4 py-5">
            <div className="mb-4 rounded-2xl bg-white/5 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t('layout.supportTitle')}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-300">
                {t('layout.supportText')}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-10 flex-1 items-center rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
                {t('layout.logout')}
              </button>

              <LanguageSwitcher showLabel={false} className="shrink-0" />
            </div>
          </div>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[280px]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-3 backdrop-blur sm:px-6 sm:py-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen((prev) => !prev)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 lg:hidden"
              aria-label={t('layout.openMenu')}>
              <span className="text-xl leading-none">☰</span>
            </button>

            <div className="min-w-0 flex-1">
              <h2 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-2xl">
                {headerTitle}
              </h2>
              <p className="mt-1 truncate text-[11px] text-slate-500 capitalize sm:text-sm">
                {currentDate}
              </p>
            </div>

            <div className="ml-auto flex shrink-0 items-center justify-end gap-2 sm:gap-3">
              {user && (
                <Link
                  to="/profile"
                  className="hidden h-12 items-center rounded-full border border-slate-200 bg-white px-5 text-sm font-medium text-slate-900 transition hover:border-slate-300 hover:bg-slate-50 md:flex">
                  {user.lastName} {user.firstName}
                </Link>
              )}

              <NotificationsBell />
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
