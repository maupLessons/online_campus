import { describe, expect, it } from 'vitest';
import { sortActiveSurveys } from './surveySections';
import type { Survey } from '../../types';

const s = (id: string, endDate?: string) => ({ id, endDate, questions: [] }) as unknown as Survey;

describe('sortActiveSurveys', () => {
  it('sorts by deadline ascending, missing deadlines last', () => {
    const out = sortActiveSurveys([s('b', '2026-10-05'), s('c'), s('a', '2026-10-01')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});
