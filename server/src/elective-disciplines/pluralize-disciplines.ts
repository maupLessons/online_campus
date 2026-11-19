/** Accusative form of «дисципліна» for a count: 1 дисципліну, 2 дисципліни, 5 дисциплін. */
export function pluralizeDisciplines(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) {
    return 'дисциплін';
  }
  if (last === 1) {
    return 'дисципліну';
  }
  if (last >= 2 && last <= 4) {
    return 'дисципліни';
  }
  return 'дисциплін';
}
