import { AxiosError, AxiosHeaders, type AxiosResponse } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import type { AcademicTerm } from '../types';

const { get, post, patch, remove } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('./api', () => ({
  default: { get, post, patch, delete: remove },
}));

import { academicTermsApi } from './academicTermsApi';

const term: AcademicTerm = {
  id: 'term-1',
  academicYear: '2026/2027',
  termNumber: 1,
  startsAt: '2026-09-01T00:00:00.000Z',
  endsAt: '2027-01-31T00:00:00.000Z',
  status: 'current',
  maupAcademicYear: 2026,
  maupSemester: 1,
  activatedAt: '2026-08-30T00:00:00.000Z',
  closedAt: null,
};

function httpError(status: number, data: unknown): AxiosError {
  const response = {
    status,
    statusText: 'Error',
    data,
    headers: new AxiosHeaders(),
    config: { headers: new AxiosHeaders() },
  } as AxiosResponse;

  return new AxiosError(
    'Request failed',
    'ERR_BAD_REQUEST',
    undefined,
    undefined,
    response,
  );
}

describe('academicTermsApi.getCurrent', () => {
  it('returns the current term', async () => {
    get.mockResolvedValue({ data: term });
    await expect(academicTermsApi.getCurrent()).resolves.toEqual(term);
    expect(get).toHaveBeenCalledWith('/academic-terms/current');
  });

  it('turns 404 no_current_term into null instead of throwing', async () => {
    get.mockRejectedValue(httpError(404, { code: 'no_current_term' }));
    await expect(academicTermsApi.getCurrent()).resolves.toBeNull();
  });

  it('rethrows every other failure', async () => {
    const failure = httpError(503, { message: 'upstream' });
    get.mockRejectedValue(failure);
    await expect(academicTermsApi.getCurrent()).rejects.toBe(failure);
  });

  it('rethrows a cancelled request', async () => {
    const cancelled = new AxiosError('canceled', 'ERR_CANCELED');
    get.mockRejectedValue(cancelled);
    await expect(academicTermsApi.getCurrent()).rejects.toBe(cancelled);
  });
});

describe('academicTermsApi admin routes', () => {
  it('lists, creates, updates, activates and removes terms', async () => {
    get.mockResolvedValue({ data: [term] });
    post.mockResolvedValue({ data: term });
    patch.mockResolvedValue({ data: term });
    remove.mockResolvedValue({ data: { deleted: true } });

    await expect(academicTermsApi.list()).resolves.toEqual([term]);
    expect(get).toHaveBeenCalledWith('/academic-terms');

    const input = {
      academicYear: '2026/2027',
      termNumber: 1 as const,
      startsAt: '2026-09-01',
      endsAt: '2027-01-31',
    };
    await academicTermsApi.create(input);
    expect(post).toHaveBeenCalledWith('/academic-terms', input);

    await academicTermsApi.update('term-1', { endsAt: '2027-02-10' });
    expect(patch).toHaveBeenCalledWith('/academic-terms/term-1', {
      endsAt: '2027-02-10',
    });

    await academicTermsApi.activate('term-1');
    expect(post).toHaveBeenCalledWith('/academic-terms/term-1/activate');

    await expect(academicTermsApi.remove('term-1')).resolves.toEqual({
      deleted: true,
    });
    expect(remove).toHaveBeenCalledWith('/academic-terms/term-1');
  });
});
