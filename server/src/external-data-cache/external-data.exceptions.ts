import { ServiceUnavailableException } from '@nestjs/common';

export class ExternalDataUnavailableException extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'maup_unavailable',
      message: 'Дані МАУП тимчасово недоступні',
    });
  }
}

export class ExternalDataDisabledException extends ServiceUnavailableException {
  constructor() {
    super({
      code: 'maup_disabled',
      message: 'Інтеграцію з МАУП вимкнено в цьому середовищі',
    });
  }
}
