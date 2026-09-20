import { Role } from '../types';

export type NavItem = { labelKey: string; path: string };
export type RoleNavItem = NavItem & { roles: readonly Role[] };

const NON_STUDENT_ROLES = (Object.values(Role) as Role[]).filter((r) => r !== Role.STUDENT);

/** Student menu: order and composition — spec 03 §6.4 (11 items). "Notifications" is a separate block in Layout. */
export const STUDENT_NAV_ITEMS: readonly NavItem[] = [
  { labelKey: 'nav.dashboard', path: '/dashboard' },
  { labelKey: 'nav.profile', path: '/profile' },
  { labelKey: 'nav.schedule', path: '/schedule' },
  { labelKey: 'nav.scheduleSession', path: '/schedule/session' },
  { labelKey: 'nav.courses', path: '/courses' },
  { labelKey: 'nav.finance', path: '/finance' },
  { labelKey: 'nav.gradebook', path: '/gradebook' },
  { labelKey: 'nav.resources', path: '/resources' },
  { labelKey: 'nav.electives', path: '/electives' },
  { labelKey: 'nav.surveys', path: '/surveys' },
  { labelKey: 'nav.news', path: '/news' },
];

/**
 * Menu for the remaining roles: order 1:1 with the current Layout.tsx; only the roles changed (no student).
 * `nav.academicTerms` (plan 01) and `nav.scheduleGroups` (plan 02) are moved to their actual
 * positions: the Task 4 brief didn't include them (it predated plan 01) or placed scheduleGroups in a
 * different position (after /references) than in the current Layout.tsx (before /references) — here the
 * actual current order is preserved.
 */
export const STAFF_NAV_ITEMS: readonly RoleNavItem[] = [
  { labelKey: 'nav.profile', path: '/profile', roles: NON_STUDENT_ROLES },
  { labelKey: 'nav.dashboard', path: '/dashboard', roles: NON_STUDENT_ROLES },
  { labelKey: 'nav.news', path: '/news', roles: NON_STUDENT_ROLES },
  { labelKey: 'nav.schedule', path: '/schedule', roles: NON_STUDENT_ROLES },
  { labelKey: 'nav.scheduleSession', path: '/schedule/session', roles: [Role.TEACHER] },
  { labelKey: 'nav.courses', path: '/courses', roles: [Role.TEACHER] },
  { labelKey: 'nav.catalog', path: '/courses/catalog', roles: [Role.DEPARTMENT_HEAD, Role.DEAN, Role.ADMIN] },
  { labelKey: 'nav.surveys', path: '/surveys', roles: [Role.TEACHER] },
  { labelKey: 'nav.surveyAdmin', path: '/surveys/admin', roles: [Role.ADMIN, Role.DEAN, Role.RECTOR, Role.PRESIDENT] },
  { labelKey: 'nav.electiveAdmin', path: '/electives/admin', roles: [Role.ADMIN, Role.DEPARTMENT_HEAD, Role.DEAN] },
  { labelKey: 'nav.reports', path: '/reports', roles: [Role.DEPARTMENT_HEAD, Role.DEAN, Role.RECTOR, Role.PRESIDENT, Role.ADMIN] },
  { labelKey: 'nav.users', path: '/users', roles: [Role.ADMIN, Role.RECTOR, Role.PRESIDENT] },
  { labelKey: 'nav.auditLog', path: '/audit-log', roles: [Role.ADMIN] },
  // added by plan 01 (academic terms); the Task 4 brief didn't include this item — added at its current position
  { labelKey: 'nav.academicTerms', path: '/admin/academic-terms', roles: [Role.ADMIN] },
  // added by plan 02 (Task 9); plan 03 just moves the item here
  { labelKey: 'nav.scheduleGroups', path: '/admin/schedule/groups', roles: [Role.ADMIN] },
  { labelKey: 'nav.references', path: '/references', roles: NON_STUDENT_ROLES },
];

export function getNavItemsForRole(role: Role): NavItem[] {
  if (role === Role.STUDENT) {
    return [...STUDENT_NAV_ITEMS];
  }
  return STAFF_NAV_ITEMS.filter((item) => item.roles.includes(role)).map(({ labelKey, path }) => ({ labelKey, path }));
}

const PREFIX_TITLES: ReadonlyArray<[string, string]> = [
  ['/surveys/admin', 'nav.surveyAdmin'],
  ['/surveys', 'nav.surveys'],
  ['/electives/admin', 'nav.electiveAdmin'],
  ['/electives', 'nav.electives'],
  ['/admin/schedule/groups', 'nav.scheduleGroups'],
  ['/schedule/session', 'nav.scheduleSession'],
  ['/schedule', 'nav.schedule'],
  // /courses/catalog has its own title and must come BEFORE /courses:
  // getPageTitleKey takes the first matching prefix, and '/courses/catalog'.startsWith('/courses/')
  // is also true, so the entry in EXACT_TITLES would never be reached without this order (the same
  // pattern as /schedule/session before /schedule, /surveys/admin before /surveys).
  ['/courses/catalog', 'nav.catalog'],
  ['/courses', 'nav.courses'],
];

const EXACT_TITLES: Record<string, string> = {
  '/dashboard': 'nav.dashboard',
  '/profile': 'nav.profile',
  '/finance': 'nav.finance',
  '/gradebook': 'nav.gradebook',
  '/resources': 'nav.resources',
  '/users': 'nav.users',
  '/notifications': 'nav.notifications',
  '/news': 'nav.news',
  '/audit-log': 'nav.auditLog',
  '/admin/academic-terms': 'nav.academicTerms',
  '/reports': 'nav.reports',
  '/references': 'nav.references',
};

export function getPageTitleKey(pathname: string): string {
  const prefixed = PREFIX_TITLES.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (prefixed) return prefixed[1];
  return EXACT_TITLES[pathname] ?? 'app.title';
}
