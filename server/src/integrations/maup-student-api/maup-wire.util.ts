import { MaupWireObject, MaupWireValue } from './maup-student-api.types';

/**
 * Спільні хелпери розбору «сирої» відповіді MAUP API, винесені з
 * `gradebook.mapper.ts` і `finance.mapper.ts` (Task 7, план 04). Локальні
 * копії розходились лише в `wireNumber`: `gradebook.mapper.ts` не прибирав
 * пробіли перед заміною коми на крапку, тож числа з пробілом-розділювачем
 * тисяч (звичайний запис великих сум і, зрідка, нерозривний пробіл
 * `U+00A0`, який JS-регекс `\s` теж покриває) не розпізнавались і мовчки
 * ставали `undefined`. Тут узято поведінку `finance.mapper.ts` (з
 * `.replace(/\s/g, '')`) як коректнішу для реальних сум MAUP.
 */

export function isWireObject(value: MaupWireValue): value is MaupWireObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function wireString(
  value: MaupWireValue | undefined,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function wireNumber(
  value: MaupWireValue | undefined,
): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function wireInteger(
  value: MaupWireValue | undefined,
): number | undefined {
  const parsed = wireNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

export function wireIsoDate(
  value: MaupWireValue | undefined,
): string | undefined {
  const text = wireString(value);
  return text && /^\d{4}-\d{2}-\d{2}/.test(text)
    ? text.slice(0, 10)
    : undefined;
}

export function wireLookup(
  map: Map<string, string>,
  id: MaupWireValue | undefined,
) {
  if (typeof id === 'number' || (typeof id === 'string' && id.trim())) {
    return map.get(String(id));
  }
  return undefined;
}

/**
 * Порівнює сирий `student_id` рядка відповіді з очікуваним externalStudentId
 * викликача. Без цього маппер брав би перший-ліпший рядок (finance) або всі
 * рядки без розбору (gradebook) — сьогодні безпечно лише тому, що MAUP API
 * сам фільтрує за студентом, а не тому, що це перевірено в коді.
 */
export function wireMatchesId(
  value: MaupWireValue | undefined,
  expected: string,
): boolean {
  if (typeof value === 'string') return value.trim() === expected;
  if (typeof value === 'number') return String(value) === expected;
  return false;
}
