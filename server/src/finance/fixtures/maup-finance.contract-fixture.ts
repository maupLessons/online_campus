// Контракт полів підтверджено документацією https://api.maup.com.ua/api
// (звірено 2026-09-21) і формою моків
// `integrations/maup-student-api/fixtures/maup-finance.mock-fixture.ts` та
// `maup-studentinfo.mock-fixture.ts`:
// - `saldo` — масив `{ student_id, saldo }`. Одне число, нічого більше
//   (жодних `cost`/`payperiod`, як в ASSUMED-фікстурі брифа Task 5).
// - `payments` — масив-обгортка по студенту
//   `{ student_id, payments: [{ date, operation_name, document_type,
//   payment_value }] }`. Поля `paytype_id` немає.
// - поточна вартість навчання і період оплати — не з `saldo`, а зі
//   `studentinfo` (`price`, `price_pay_period`, `price_pay_period_id`).
import { MaupWireArray } from '../../integrations/maup-student-api/maup-student-api.types';

export const MAUP_SALDO_FIXTURE: MaupWireArray = [
  { student_id: '1001', saldo: -1500.5 },
];

export const MAUP_PAYMENTS_FIXTURE: MaupWireArray = [
  {
    student_id: '1001',
    payments: [
      {
        date: '2026-09-01',
        operation_name: 'Оплата за навчання',
        document_type: 'Квитанція',
        payment_value: 6000,
      },
      // Регістр і апостроф не мають значення для розпізнавання гуртожитку
      // (С3); сума рядком з комою — перевіряє нормалізацію числа.
      {
        date: '2026-08-15',
        operation_name: 'ОПЛАТА ЗА ГУРТОЖИТОК',
        document_type: 'Квитанція',
        payment_value: '1500,00',
      },
      // Немає operation_name — за С3 усе без ознаки гуртожитку йде в tuition,
      // а payment.purpose лишається відсутнім.
      {
        date: '2026-02-01',
        operation_name: null,
        document_type: 'Квитанція',
        payment_value: 6000,
      },
      // Побитий рядок: недійсна дата — відкидається цілком.
      {
        date: 'bad-date',
        operation_name: 'Оплата за навчання',
        payment_value: 10,
      },
      // Побитий рядок: сума не парситься — відкидається цілком.
      {
        date: '2026-01-01',
        operation_name: 'Оплата за навчання',
        payment_value: 'n/a',
      },
    ],
  },
];

export const MAUP_STUDENTINFO_FIXTURE: MaupWireArray = [
  {
    student_id: '1001',
    price: 12000,
    price_pay_period: 'семестр',
    price_pay_period_id: 2,
    price_pay_type: 'контракт',
    price_pay_type_id: 1,
  },
];

// Значення довідника тут — уже нормалізована Map (як повертає
// `MaupReferenceCacheService.getMap('payperiod')`), а не сира форма
// відповіді MAUP API (`{ pay_period_id, pay_period }`).
export const MAUP_PAY_PERIODS_FIXTURE = new Map<string, string>([
  ['1', 'рік'],
  ['2', 'семестр'],
]);
