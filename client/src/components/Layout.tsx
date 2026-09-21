import { Link, Outlet, useLocation } from 'react-router';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { ROLE_LABEL_KEYS } from '../types';
import NotificationsBell from './notifications/NotificationsBell';
import LanguageSwitcher from './LanguageSwitcher';
import NoCurrentTermBanner from './NoCurrentTermBanner';
import { getNavItemsForRole, getPageTitleKey } from './navItems';

export default function Layout() {
  const location = useLocation();
  const { t, i18n } = useTranslation();

  const { user, logout, loadProfile, isAuthenticated } = useAuthStore();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!user && isAuthenticated) {
      void loadProfile().catch(() => undefined);
    }
  }, [user, isAuthenticated, loadProfile]);

  const visibleNavItems = useMemo(
    () => (user ? getNavItemsForRole(user.role) : []),
    [user],
  );

  const handleLogout = async () => {
    setSidebarOpen(false);
    await logout().catch(() => undefined);
  };

  const pageTitle = useMemo(
    () => t(getPageTitleKey(location.pathname)),
    [location.pathname, t],
  );

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

          <nav className="sidebar-scroll-area min-h-0 flex-1 overflow-y-auto border-y border-white/[0.06] px-3 py-5 sm:px-4 sm:py-6">
            <div className="space-y-1.5">
              {visibleNavItems.map((item) => {
                const isActive =
                  location.pathname === item.path ||
                  (item.path !== '/dashboard' &&
                    location.pathname.startsWith(`${item.path}/`) &&
                    !visibleNavItems.some(
                      (other) =>
                        other.path !== item.path &&
                        other.path.startsWith(`${item.path}/`) &&
                        (location.pathname === other.path ||
                          location.pathname.startsWith(`${other.path}/`)),
                    ));

                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={
                      isActive
                        ? 'flex items-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16233b]'
                        : 'flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16233b]'
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
                  ? 'flex items-center rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(37,99,235,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16233b]'
                  : 'flex items-center rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition-colors duration-200 hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16233b]'
                }>
                {t('nav.notifications')}
              </Link>
            </div>
          </nav>

          <div className="sticky bottom-0 shrink-0 border-t border-white/10 bg-[#16233b] px-4 py-5">
            <a
              href="https://maup.com.ua/ua/kontakti/kontaktna-informaciya.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 w-full items-center justify-center rounded-xl bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 shadow-sm transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#16233b]">
              {t('layout.contacts')}
            </a>

            <div className="mt-4 flex min-h-10 items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleLogout}
                className="flex min-h-10 flex-1 items-center rounded-2xl px-4 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/5 hover:text-white">
                {t('layout.logout')}
              </button>

              <LanguageSwitcher
                showLabel={false}
                className="shrink-0"
              />
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
          <NoCurrentTermBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
