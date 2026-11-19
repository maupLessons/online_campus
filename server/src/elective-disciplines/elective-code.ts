import { ConflictException } from '@nestjs/common';

export const GENERATED_ELECTIVE_CODE = /^EL-\d{4}-[12]-(\d{3,})$/;
export const MAX_CODE_ATTEMPTS = 5;

const DUPLICATE_KEY_ERROR_CODE = 11000;

export function formatElectiveCode(
  academicYear: string,
  termNumber: 1 | 2,
  sequence: number,
): string {
  return `EL-${academicYear.slice(0, 4)}-${termNumber}-${String(sequence).padStart(3, '0')}`;
}

export function nextElectiveCodeSequence(
  existingCodes: readonly string[],
): number {
  let max = 0;
  for (const code of existingCodes) {
    const match = GENERATED_ELECTIVE_CODE.exec(code);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export async function insertWithGeneratedCode<T>(params: {
  academicYear: string;
  termNumber: 1 | 2;
  loadCodes: () => Promise<string[]>;
  insert: (code: string) => Promise<T>;
}): Promise<T> {
  let sequence = nextElectiveCodeSequence(await params.loadCodes());
  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt += 1) {
    try {
      return await params.insert(
        formatElectiveCode(params.academicYear, params.termNumber, sequence),
      );
    } catch (error) {
      if ((error as { code?: number }).code !== DUPLICATE_KEY_ERROR_CODE) {
        throw error;
      }
      sequence += 1;
    }
  }
  throw new ConflictException({
    code: 'elective_code_generation_failed',
    message: 'Не вдалося присвоїти код дисципліни. Спробуйте ще раз',
  });
}
