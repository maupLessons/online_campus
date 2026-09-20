const KYIV = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' });

export function todayKyivIso(now: Date = new Date()): string {
  return KYIV.format(now);
}

export function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeekIso(date: string): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDaysIso(date, -offset);
}

export function rangeFor(view: 'day' | 'week', anchor: string): { from: string; to: string } {
  if (view === 'day') return { from: anchor, to: anchor };
  const from = startOfWeekIso(anchor);
  return { from, to: addDaysIso(from, 6) };
}

export function shiftAnchor(view: 'day' | 'week', anchor: string, direction: -1 | 1): string {
  return addDaysIso(anchor, direction * (view === 'week' ? 7 : 1));
}

export function groupByDate<T extends { date: string }>(entries: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const e of entries) map.set(e.date, [...(map.get(e.date) ?? []), e]);
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}
