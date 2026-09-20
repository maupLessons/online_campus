import { describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { renderStatic } from '../../test/renderStatic';

const state = vi.hoisted(() => ({
  user: null as User | null,
  results: [] as unknown[],
}));

vi.mock('../../store/authStore', () => ({ useAuthStore: () => ({ user: state.user }) }));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueries: () => state.results,
}));

const { default: DashboardPage } = await import('./DashboardPage');

const idle = { data: undefined, isPending: false, isError: false };

const setUser = (role: string) => {
  state.user = {
    id: 'u1', login: 'u', role, email: 'u@maup.com.ua',
    firstName: 'Іван', lastName: 'Іваненко', status: 'active',
    studentProfiles: role === 'student'
      ? [{ id: 'p1', group: { id: 'g1', code: 'КН-21' }, recordBookNumber: 'RB1', year: 3, specialty: '122 КН', status: 'active' }]
      : [],
    activeStudentProfileId: role === 'student' ? 'p1' : undefined,
    teacherProfile: role === 'teacher' ? { department: 'd1', position: 'Доцент' } : undefined,
  } as unknown as User;
  state.results = [
    { ...idle, data: { date: '2026-09-18', lessons: [], session: [], meta: { stale: false } } },
    { ...idle, data: [] },
    { ...idle, data: [] },
    { ...idle, data: [] },
    { ...idle, data: { items: [], unavailable: false } },
  ];
};

describe('DashboardPage', () => {
  it('renders all seven student widgets', async () => {
    setUser('student');
    const html = await renderStatic(<DashboardPage />);
    for (const text of [
      'Іваненко',                    // 1 student card
      'Короткий профіль',            // 2
      'Розклад на сьогодні',         // 3
      'Активні опитування',          // 4
      'Вибір дисциплін',             // 5
      'Важливі сповіщення',          // 6
      'Новини МАУП',                 // 7
    ]) {
      expect(html).toContain(text);
    }
  });
  it('hides the elective widget for a teacher and shows the position', async () => {
    setUser('teacher');
    const html = await renderStatic(<DashboardPage />);
    expect(html).toContain('Доцент');
    expect(html).toContain('Розклад на сьогодні');
    expect(html).not.toContain('Активного періоду вибору немає');
    expect(html).not.toContain('Вибір дисциплін');
  });
  it('hides schedule, surveys and electives for an admin', async () => {
    setUser('admin');
    const html = await renderStatic(<DashboardPage />);
    expect(html).not.toContain('Розклад на сьогодні');
    expect(html).not.toContain('Активні опитування');
    expect(html).not.toContain('Вибір дисциплін');
    expect(html).toContain('Важливі сповіщення');
  });
  it('shows the schedule reason text instead of an error', async () => {
    setUser('student');
    state.results[0] = { ...idle, data: { date: '2026-09-18', lessons: [], session: [], meta: { stale: false, reason: 'no_current_term' } } };
    const html = await renderStatic(<DashboardPage />);
    expect(html).toContain('Навчальний період не налаштовано');
  });
});
