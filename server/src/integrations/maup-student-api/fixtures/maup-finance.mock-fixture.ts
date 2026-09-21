import { MaupWireArray } from '../maup-student-api.types';

// ASSUMED (спека 08 §11, П1): борг подається відʼємним saldo.
// ASSUMED (спека 08 §11, П2): saldo стосується лише навчання, гуртожиток окремо не приходить.
export const MAUP_MOCK_SALDO: MaupWireArray = [
  { student_id: 'seed-1001', saldo: 0 },
  { student_id: 'seed-1002', saldo: -16000 },
  { student_id: 'seed-1003', saldo: 4500 },
  { student_id: 'seed-1004', saldo: 0 },
];

// ASSUMED (спека 08 §11, П3): платіж за гуртожиток визначається за operation_name.
export const MAUP_MOCK_PAYMENTS: MaupWireArray = [
  {
    student_id: 'seed-1001',
    payments: [
      {
        date: '2026-09-05',
        operation_name: 'Оплата за навчання',
        document_type: 'Квитанція',
        payment_value: 16000,
      },
      {
        date: '2026-02-10',
        operation_name: 'Оплата за навчання',
        document_type: 'Квитанція',
        payment_value: 16000,
      },
    ],
  },
  {
    student_id: 'seed-1002',
    payments: [
      {
        date: '2026-02-12',
        operation_name: 'Оплата за навчання',
        document_type: 'Квитанція',
        payment_value: 16000,
      },
    ],
  },
  {
    student_id: 'seed-1003',
    payments: [
      {
        date: '2026-09-03',
        operation_name: 'Оплата за навчання',
        document_type: 'Квитанція',
        payment_value: 17000,
      },
      {
        date: '2026-09-03',
        operation_name: 'Оплата за гуртожиток',
        document_type: 'Квитанція',
        payment_value: 3200,
      },
      {
        date: '2026-03-01',
        operation_name: 'Оплата за гуртожиток',
        document_type: 'Квитанція',
        payment_value: 3200,
      },
    ],
  },
  { student_id: 'seed-1004', payments: [] },
];
