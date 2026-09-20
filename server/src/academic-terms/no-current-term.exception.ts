import { NotFoundException } from '@nestjs/common';

export const NO_CURRENT_TERM_CODE = 'no_current_term' as const;

export class NoCurrentTermException extends NotFoundException {
  constructor() {
    super({
      code: NO_CURRENT_TERM_CODE,
      message: 'Поточний навчальний період не налаштовано',
    });
  }
}
