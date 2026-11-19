import { pluralizeDisciplines } from './pluralize-disciplines';

describe('pluralizeDisciplines', () => {
  it.each([
    [0, 'дисциплін'],
    [1, 'дисципліну'],
    [2, 'дисципліни'],
    [4, 'дисципліни'],
    [5, 'дисциплін'],
    [6, 'дисциплін'],
    [10, 'дисциплін'],
    [11, 'дисциплін'],
    [12, 'дисциплін'],
    [21, 'дисципліну'],
    [22, 'дисципліни'],
    [25, 'дисциплін'],
  ])('uses the right form for %i', (count, expected) => {
    expect(pluralizeDisciplines(count)).toBe(expected);
  });
});
