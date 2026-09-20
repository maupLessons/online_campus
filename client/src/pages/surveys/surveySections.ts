import type { Survey } from '../../types';

export function sortActiveSurveys(surveys: Survey[]): Survey[] {
  return [...surveys].sort((a, b) => {
    const aEnd = a.endDate ? Date.parse(a.endDate) : Number.POSITIVE_INFINITY;
    const bEnd = b.endDate ? Date.parse(b.endDate) : Number.POSITIVE_INFINITY;
    return aEnd - bEnd;
  });
}
