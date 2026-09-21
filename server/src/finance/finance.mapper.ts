import {
  MaupWireArray,
  MaupWireObject,
  MaupWireValue,
} from '../integrations/maup-student-api/maup-student-api.types';
import {
  isWireObject,
  wireIsoDate,
  wireLookup,
  wireMatchesId,
  wireNumber,
  wireString,
} from '../integrations/maup-student-api/maup-wire.util';
import { FinancePayload, PaymentDto } from './finance.dto';

export type FinanceReferences = {
  payPeriods: Map<string, string>;
};

/**
 * Контракт підтверджено документацією https://api.maup.com.ua/api (звірено
 * 2026-09-21), а НЕ ASSUMED-фікстурою брифа Task 5 (там `saldo`/`payments`
 * мали плоскі поля `cost`/`payperiod_id`/`paytype_id`, яких у реальному API
 * немає — розбіжність зафіксована в batch-3-report.md):
 * - `saldo` → масив `{ student_id, saldo }`. Жодних `cost`/`payperiod` тут
 *   немає — поточна вартість навчання і період оплати беруться зі
 *   `studentinfo`.
 * - `payments` → масив-обгортка по студенту
 *   `{ student_id, payments: [{ date, operation_name, document_type,
 *   payment_value }] }`. Поля `paytype_id` немає: тип платежу
 *   (навчання/гуртожиток) визначається текстом `operation_name` (С3), а не
 *   довідником `paytype` (той описує форму фінансування контракт/бюджет, а
 *   не категорію платежу).
 * - `studentInfo` → масив по одному запису на студента; `price` — поточна
 *   вартість навчання, `price_pay_period`/`price_pay_period_id` — період, за
 *   який вона нарахована (семестр/рік).
 */
export function mapMaupFinance(
  input: {
    saldo: MaupWireArray;
    payments: MaupWireArray;
    studentInfo: MaupWireArray;
  },
  externalStudentId: string,
  refs: FinanceReferences,
): FinancePayload {
  // PII: беремо лише рядок запитаного студента, а не перший-ліпший — `saldo`/
  // `payments`/`studentinfo` теоретично можуть містити рядки інших студентів
  // (спека 04 §11.1 цього не виключає).
  const matchesStudent = (row: MaupWireValue): row is MaupWireObject =>
    isWireObject(row) && wireMatchesId(row.student_id, externalStudentId);

  const saldoRow = input.saldo.find(matchesStudent);
  const infoRow = input.studentInfo.find(matchesStudent);

  const tuitionPayments: PaymentDto[] = [];
  const dormitoryPayments: PaymentDto[] = [];

  for (const wrapper of input.payments) {
    if (!isWireObject(wrapper) || !Array.isArray(wrapper.payments)) continue;
    if (!wireMatchesId(wrapper.student_id, externalStudentId)) continue;

    for (const row of wrapper.payments) {
      if (!isWireObject(row)) continue;
      const date = wireIsoDate(row.date);
      const amount = wireNumber(row.payment_value);
      if (!date || amount === undefined) continue;

      const payment: PaymentDto = { date, amount };
      const purpose = wireString(row.operation_name);
      if (purpose) payment.purpose = purpose;

      (isDormitoryPayment(purpose) ? dormitoryPayments : tuitionPayments).push(
        payment,
      );
    }
  }

  const byDateDesc = (a: PaymentDto, b: PaymentDto) =>
    b.date.localeCompare(a.date);

  const tuition: FinancePayload['tuition'] = {
    balance: (saldoRow && wireNumber(saldoRow.saldo)) ?? 0,
    currency: 'UAH',
    payments: tuitionPayments.sort(byDateDesc),
  };

  // Поточна вартість навчання не приходить у `saldo` (реальний контракт її
  // там не має) — джерело `studentinfo.price`; період — текст
  // `price_pay_period`, з фолбеком на довідник `payperiod` за
  // `price_pay_period_id`, якщо текстового поля немає. `price_pay_type`/
  // `price_pay_type_id` (контракт/бюджет — форма фінансування) тут не
  // використовуються: жодне поле DTO їх не описує, а вигадувати нове поле
  // поза межами задачі не потрібно.
  const currentCost = infoRow ? wireNumber(infoRow.price) : undefined;
  const currentPeriod = infoRow
    ? (wireString(infoRow.price_pay_period) ??
      wireLookup(refs.payPeriods, infoRow.price_pay_period_id))
    : undefined;
  if (currentCost !== undefined) tuition.currentCost = currentCost;
  if (currentPeriod) tuition.currentPeriod = currentPeriod;

  return {
    tuition,
    dormitory: { payments: dormitoryPayments.sort(byDateDesc) },
  };
}

/**
 * ASSUMED (спека 04 §11.1, С3): платіж за гуртожиток визначається виключно
 * за текстом `operation_name`, що містить «гуртожит» (без урахування
 * регістру); усе інше — оплата за навчання. Правило ізольоване в цій функції
 * навмисно, щоб заміна на точний перелік значень `operation_name` (коли
 * замовник відповість) була правкою в одному місці.
 */
function isDormitoryPayment(operationName: string | undefined): boolean {
  return (operationName ?? '').toLowerCase().includes('гуртожит');
}
