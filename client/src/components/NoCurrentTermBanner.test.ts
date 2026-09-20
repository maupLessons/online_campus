import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { AcademicTerm } from '../types';
import type { CurrentTermState } from '../hooks/useCurrentTerm';

const { useCurrentTermMock, authState } = vi.hoisted(() => ({
  useCurrentTermMock: vi.fn(),
  authState: { user: null as { role: string } | null },
}));

vi.mock('../hooks/useCurrentTerm', () => ({
  useCurrentTerm: useCurrentTermMock,
}));

vi.mock('../store/authStore', () => ({
  useAuthStore: <T,>(selector: (state: typeof authState) => T) =>
    selector(authState),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import NoCurrentTermBanner from './NoCurrentTermBanner';

const term = {
  id: 'term-1',
  academicYear: '2026/2027',
  termNumber: 1,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2027-01-31T00:00:00.000Z',
  status: 'current',
  maupAcademicYear: 2026,
  maupSemester: 1,
  activatedAt: null,
  closedAt: null,
} satisfies AcademicTerm;

function render(state: CurrentTermState, role: string | null): string {
  useCurrentTermMock.mockReturnValue(state);
  authState.user = role ? { role } : null;

  return renderToStaticMarkup(
    createElement(MemoryRouter, null, createElement(NoCurrentTermBanner)),
  );
}

describe('NoCurrentTermBanner', () => {
  it('renders nothing while the current term is loading', () => {
    expect(render({ term: null, isLoading: true, isError: false }, 'student'))
      .toBe('');
  });

  it('renders nothing when a current term exists', () => {
    expect(render({ term, isLoading: false, isError: false }, 'student')).toBe(
      '',
    );
  });

  it('renders nothing when the request failed (do not scare users on a network blip)', () => {
    expect(render({ term: null, isLoading: false, isError: true }, 'student'))
      .toBe('');
  });

  it('warns any role when there is no current term', () => {
    const html = render(
      { term: null, isLoading: false, isError: false },
      'student',
    );
    expect(html).toContain('noCurrentTerm.title');
    expect(html).toContain('noCurrentTerm.description');
    expect(html).not.toContain('/admin/academic-terms');
  });

  it('offers the admin a link to the terms page', () => {
    const html = render(
      { term: null, isLoading: false, isError: false },
      'admin',
    );
    expect(html).toContain('href="/admin/academic-terms"');
    expect(html).toContain('noCurrentTerm.adminAction');
  });
});
