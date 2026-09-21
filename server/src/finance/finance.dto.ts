import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExternalDataMetaDto } from '../external-data-cache/external-data-meta.dto';

export class PaymentDto {
  @ApiProperty({ example: '2026-09-01' }) date: string;
  @ApiProperty() amount: number;
  @ApiPropertyOptional() purpose?: string;
}

export class TuitionDto {
  // ASSUMED (спека 04 §11.1, С1): борг подається відʼємним saldo як є з MAUP
  // API; додатний/відʼємний → зелений/червоний — рішення клієнта, сервер лише
  // передає число і знак без інтерпретації.
  @ApiProperty() balance: number;
  // ASSUMED (спека 04 §11.1): жоден підтверджений endpoint не віддає валюту
  // окремим полем; MAUP працює лише в гривні.
  @ApiProperty({ enum: ['UAH'] }) currency: 'UAH';
  @ApiPropertyOptional() currentCost?: number;
  @ApiPropertyOptional() currentPeriod?: string;
  @ApiProperty({ type: [PaymentDto] }) payments: PaymentDto[];
}

export class DormitoryDto {
  // ASSUMED (спека 04 §11.1, С2): `saldo` стосується лише навчання — MAUP не
  // віддає окремого балансу гуртожитку жодним підтвердженим endpoint-ом. Поле
  // балансу тут навмисно відсутнє (не null, не вигадане число).
  @ApiProperty({ type: [PaymentDto] }) payments: PaymentDto[];
}

export class FinanceDto {
  @ApiProperty({ type: TuitionDto }) tuition: TuitionDto;
  @ApiProperty({ type: DormitoryDto }) dormitory: DormitoryDto;
  @ApiProperty({ type: ExternalDataMetaDto }) meta: ExternalDataMetaDto;
}

export type FinancePayload = Pick<FinanceDto, 'tuition' | 'dormitory'>;

/**
 * Fix round 1 (рев'ю батчу 3): раніше це був експортований `const`-обʼєкт,
 * розшарений (shallow-copy через spread) між усіма відповідями
 * `no_active_profile` — усі вони ділили ті самі масиви `payments`. Ніхто їх
 * не мутував, але пастка була залишена. Тепер це фабрика — кожен виклик
 * повертає нову структуру, як `emptyExternalDataMeta()` для meta.
 */
export function emptyFinancePayload(): FinancePayload {
  return {
    tuition: { balance: 0, currency: 'UAH', payments: [] },
    dormitory: { payments: [] },
  };
}
