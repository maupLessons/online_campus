import { describe, expect, it } from 'vitest';
import { Role } from '../types';
import { getNavItemsForRole, getPageTitleKey } from './navItems';

describe('getNavItemsForRole', () => {
  it('gives the student exactly 11 items in the approved order', () => {
    expect(getNavItemsForRole(Role.STUDENT).map((i) => i.path)).toEqual([
      '/dashboard', '/profile', '/schedule', '/schedule/session', '/courses',
      '/finance', '/gradebook', '/resources', '/electives', '/surveys', '/news',
    ]);
  });
  it('keeps notifications out of the menu array (separate block in Layout)', () => {
    for (const role of Object.values(Role)) {
      expect(getNavItemsForRole(role).some((i) => i.path === '/notifications')).toBe(false);
    }
  });
  it('hides references from the student but keeps them for admin', () => {
    expect(getNavItemsForRole(Role.STUDENT).some((i) => i.path === '/references')).toBe(false);
    expect(getNavItemsForRole(Role.ADMIN).some((i) => i.path === '/references')).toBe(true);
  });
  it('shows resources to the student only', () => {
    expect(getNavItemsForRole(Role.STUDENT).some((i) => i.path === '/resources')).toBe(true);
    for (const role of Object.values(Role).filter((r) => r !== Role.STUDENT)) {
      expect(getNavItemsForRole(role).some((i) => i.path === '/resources')).toBe(false);
    }
  });
  it('keeps the current order for admin', () => {
    // /admin/academic-terms (plan 01) and /admin/schedule/groups (plan 02) — at their actual
    // positions in the current Layout.tsx (the Task 4 brief predated plan 01 and didn't include the first
    // item; the second one was placed after /references, whereas it's actually placed before it).
    expect(getNavItemsForRole(Role.ADMIN).map((i) => i.path)).toEqual([
      '/profile', '/dashboard', '/news', '/schedule', '/courses/catalog', '/surveys/admin',
      '/electives/admin', '/reports', '/users', '/audit-log', '/admin/academic-terms',
      '/admin/schedule/groups', '/references',
    ]);
  });
  it('keeps the current order for dean', () => {
    expect(getNavItemsForRole(Role.DEAN).map((i) => i.path)).toEqual([
      '/profile', '/dashboard', '/news', '/schedule', '/courses/catalog', '/surveys/admin',
      '/electives/admin', '/reports', '/references',
    ]);
  });
  it('adds the catalog for department_head, right after schedule', () => {
    expect(getNavItemsForRole(Role.DEPARTMENT_HEAD).map((i) => i.path)).toEqual([
      '/profile', '/dashboard', '/news', '/schedule', '/courses/catalog',
      '/electives/admin', '/reports', '/references',
    ]);
  });
  it('gives rector access to survey admin (audience restricted client-side) but not electives admin', () => {
    expect(getNavItemsForRole(Role.RECTOR).map((i) => i.path)).toEqual([
      '/profile', '/dashboard', '/news', '/schedule', '/surveys/admin',
      '/reports', '/users', '/references',
    ]);
  });
  it('adds only the session schedule for teacher, right after the schedule', () => {
    expect(getNavItemsForRole(Role.TEACHER).map((i) => i.path)).toEqual([
      '/profile', '/dashboard', '/news', '/schedule', '/schedule/session', '/courses',
      '/surveys', '/references',
    ]);
  });
});

describe('getPageTitleKey', () => {
  it.each([
    ['/dashboard', 'nav.dashboard'],
    ['/schedule/session', 'nav.scheduleSession'],
    ['/schedule', 'nav.schedule'],
    ['/finance', 'nav.finance'],
    ['/gradebook', 'nav.gradebook'],
    ['/resources', 'nav.resources'],
    ['/notifications', 'nav.notifications'],
    ['/admin/schedule/groups', 'nav.scheduleGroups'],
    ['/admin/academic-terms', 'nav.academicTerms'],
    ['/surveys/admin/1/results', 'nav.surveyAdmin'],
    ['/electives', 'nav.electives'],
    ['/courses/catalog', 'nav.catalog'],
    ['/courses/671fabc123abc123abc123ab', 'nav.courses'],
    ['/unknown', 'app.title'],
    ['/schedules', 'app.title'],
  ])('%s -> %s', (path, key) => {
    expect(getPageTitleKey(path)).toBe(key);
  });
});
