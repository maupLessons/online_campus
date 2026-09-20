import { describe, expect, it } from 'vitest';
import type { Survey } from '../../types';
import { renderStatic } from '../../test/renderStatic';
import ActiveSurveysCard from './ActiveSurveysCard';

const survey = (over: Partial<Survey>): Survey =>
  ({ id: 's', title: 'Опитування', status: 'active', anonymous: false, targetType: 'all', targetIds: [],
     createdBy: 'a', startDate: '2026-09-01T00:00:00Z', endDate: '2026-09-30T00:00:00Z', questions: [], ...over }) as Survey;

describe('ActiveSurveysCard', () => {
  it('lists up to three not-completed surveys sorted by deadline with links', async () => {
    const html = await renderStatic(
      <ActiveSurveysCard isLoading={false} surveys={[
        survey({ id: 'late', title: 'Пізнє', endDate: '2026-10-05T00:00:00Z' }),
        survey({ id: 'done', title: 'Пройдене', completed: true }),
        survey({ id: 'soon', title: 'Скоро', endDate: '2026-09-20T00:00:00Z', anonymous: true, estimatedMinutes: 5 }),
        survey({ id: 'x1', title: 'Ще одне', endDate: '2026-09-25T00:00:00Z' }),
        survey({ id: 'x2', title: 'Четверте', endDate: '2026-10-10T00:00:00Z' }),
      ]} />,
    );
    expect(html).not.toContain('Пройдене');
    expect(html).not.toContain('Четверте');
    expect(html.indexOf('Скоро')).toBeLessThan(html.indexOf('Ще одне'));
    expect(html.indexOf('Ще одне')).toBeLessThan(html.indexOf('Пізнє'));
    expect(html).toContain('href="/surveys/soon"');
    expect(html).toContain('Анонімно');
    expect(html).toContain('≈ 5 хв');
  });
  it('sorts a survey with a missing/invalid endDate last and skips its deadline', async () => {
    const html = await renderStatic(
      <ActiveSurveysCard isLoading={false} surveys={[
        survey({ id: 'bad', title: 'Без дедлайну', endDate: undefined as unknown as string }),
        survey({ id: 'soon', title: 'Скоро', endDate: '2026-09-20T00:00:00Z' }),
      ]} />,
    );
    expect(html.indexOf('Скоро')).toBeLessThan(html.indexOf('Без дедлайну'));
    expect(html).not.toContain('Invalid Date');
  });
  it('renders empty state when every survey is completed', async () => {
    const html = await renderStatic(<ActiveSurveysCard isLoading={false} surveys={[survey({ completed: true })]} />);
    expect(html).toContain('Наразі активних опитувань немає');
  });
});
