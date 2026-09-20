import { emptyPaginated } from './empty-paginated';

describe('emptyPaginated', () => {
  it('returns an empty page with meta.reason', () => {
    const page = emptyPaginated<{ id: string }>(
      { page: 2, limit: 25 },
      'no_current_term',
    );
    expect(page).toEqual({
      docs: [],
      totalDocs: 0,
      limit: 25,
      page: 2,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
      meta: { reason: 'no_current_term' },
    });
  });

  it('defaults page=1 limit=10', () => {
    expect(emptyPaginated({}, 'no_current_term')).toMatchObject({
      page: 1,
      limit: 10,
    });
  });

  it('omits meta when no reason is given', () => {
    expect(emptyPaginated({ page: 1, limit: 10 })).not.toHaveProperty('meta');
  });
});
