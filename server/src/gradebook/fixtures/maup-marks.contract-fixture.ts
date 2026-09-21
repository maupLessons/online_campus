// Контракт полів підтверджено документацією https://api.maup.com.ua/api
// (спека 04 §9, §11.1a, звірено 2026-09-21) і формою мока
// `integrations/maup-student-api/fixtures/maup-marks.mock-fixture.ts`:
// відповідь `marks` — масив по одному елементу на студента
// `{ student_id, marks: [{ semestr, subjects: [...] }] }`, семестр наскрізний
// (1..12), рядок середньої оцінки має `subjkind_id: 20` і не є дисципліною.
// Розбіжність із фікстурою з брифа Task 3 (плаский масив рядків з `year_navch`,
// `mark_type_id`) задокументована в batch-2-report.md.
import { MaupWireArray } from '../../integrations/maup-student-api/maup-student-api.types';

export const MAUP_MARKS_FIXTURE: MaupWireArray = [
  {
    student_id: '1001',
    marks: [
      {
        // Наскрізний семестр 1 (1-й курс, 1-й семестр); дати грудня-січня →
        // навчальний рік 2025/2026 (вересень — межа навчального року).
        semestr: 1,
        subjects: [
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Вища математика',
            subject_id: 101,
            testtype: 'екзамен',
            testtype_id: 1,
            marktype: 'Бали',
            marktype_id: 3,
            mark: '85',
            mark_classic: '4',
            mark_ects: 'B',
            mark_id: 910101,
            mark_date: '2026-01-15',
            mark_act_date: '2026-01-15',
            prepod_name: 'Іваненко І. І.',
          },
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Філософія',
            subject_id: 102,
            testtype: 'залік',
            testtype_id: 2,
            marktype: 'Бали',
            marktype_id: 3,
            mark: '55',
            mark_classic: '3',
            mark_ects: 'FX',
            mark_id: 910102,
            mark_date: '2026-01-20',
            mark_act_date: '2026-01-20',
            prepod_name: 'Петренко П. П.',
          },
          // Перескладання (С4): два записи з тим самим subject_id, різний
          // mark_act_date. Первинна спроба — незадовільна, друга — успішна.
          // ASSUMED (спека 04 §11.1, С4): вибираємо запис із максимальним
          // mark_act_date у межах subject_id + semestr.
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Економіка',
            subject_id: 103,
            testtype: 'екзамен',
            testtype_id: 1,
            marktype: 'Бали',
            marktype_id: 3,
            mark: '40',
            mark_ects: 'F',
            mark_id: 910103,
            mark_date: '2026-01-10',
            mark_act_date: '2026-01-10',
            prepod_name: 'Коваль К. К.',
          },
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Економіка',
            subject_id: 103,
            testtype: 'екзамен',
            testtype_id: 1,
            marktype: 'Бали',
            marktype_id: 3,
            mark: '65',
            mark_ects: 'D',
            mark_id: 910104,
            mark_date: '2026-01-25',
            mark_act_date: '2026-01-25',
            prepod_name: 'Коваль К. К.',
          },
          // Рядок без назви дисципліни — вважається пошкодженим і відкидається.
          { subjkind_id: 3, mark: '90' },
          // Середня оцінка семестру — не дисципліна, відкидається завжди.
          {
            subjkind: 'Середня оцінка',
            subjkind_id: 20,
            avrmark: '3.5',
            avrmarkB: '70',
          },
        ],
      },
      {
        // Наскрізний семестр 2 (1-й курс, 2-й семестр); дата червня → той
        // самий навчальний рік 2025/2026.
        semestr: 2,
        subjects: [
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Історія України',
            subject_id: 104,
            // testtype відсутній навмисно — перевіряє резолюцію за testtype_id
            // через довідник testtypes.
            testtype_id: 1,
            marktype: 'Бали',
            marktype_id: 3,
            mark: 'не зʼявився',
            mark_id: 910105,
            mark_date: '2026-06-10',
            mark_act_date: '2026-06-10',
            prepod_name: 'Сидоренко С. С.',
          },
          // GRADE-003 (рев'ю фінального батчу): залік за шкалою «Відмітка
          // про залік» — mark текстом «зараховано», score немає взагалі
          // (не 0). Перевіряє, що status 'graded' коректно означає
          // «результат складено», навіть без числового балу.
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Бази даних',
            subject_id: 107,
            testtype: 'залік',
            testtype_id: 2,
            marktype: 'Відмітка про залік',
            marktype_id: 1,
            mark: 'зараховано',
            mark_id: 910107,
            mark_date: '2026-06-15',
            mark_act_date: '2026-06-15',
            prepod_name: 'Захарченко З. З.',
          },
          {
            subjkind: 'Середня оцінка',
            subjkind_id: 20,
            avrmark: null,
            avrmarkB: null,
          },
        ],
      },
      {
        // Наскрізний семестр 3 (2-й курс, 1-й семестр); дата січня →
        // навчальний рік 2026/2027.
        semestr: 3,
        subjects: [
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Програмування',
            subject_id: 105,
            testtype: 'екзамен',
            testtype_id: 1,
            marktype: 'Бали',
            marktype_id: 3,
            // Контроль ще не відбувся: немає mark і дат.
            mark: null,
            mark_id: null,
            prepod_name: 'Мельник В. О.',
          },
          {
            subjkind: 'Оцінка',
            subjkind_id: 3,
            title: 'Архітектура програмного забезпечення',
            subject_id: 106,
            testtype: 'екзамен',
            testtype_id: 1,
            marktype: 'Бали',
            marktype_id: 3,
            mark: 'не допущений',
            mark_id: 910106,
            mark_date: '2027-01-20',
            mark_act_date: '2027-01-20',
            prepod_name: 'Мельник В. О.',
          },
          {
            subjkind: 'Середня оцінка',
            subjkind_id: 20,
            avrmark: null,
            avrmarkB: null,
          },
        ],
      },
      // Блок без `semestr` — не з'ясувати, до якого семестру належить,
      // відкидається цілком.
      {
        subjects: [{ title: 'Без семестру', mark: '90' }],
      },
    ],
  },
];

// Значення довідників тут — уже нормалізовані Map (як повертає
// `MaupReferenceCacheService.getMap`), а не сира форма відповіді MAUP API.
export const MAUP_MARK_TYPES_FIXTURE = new Map<string, string>([
  ['1', 'Відмітка про залік'],
  ['2', 'Оцінка'],
  ['3', 'Бали'],
]);

export const MAUP_TEST_TYPES_FIXTURE = new Map<string, string>([
  ['1', 'Екзамен'],
  ['2', 'Залік'],
  ['3', 'Курсова робота'],
]);
