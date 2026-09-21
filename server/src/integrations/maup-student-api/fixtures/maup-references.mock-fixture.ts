import { MaupWireArray } from '../maup-student-api.types';

export const MAUP_MOCK_REFERENCES: Readonly<Record<string, MaupWireArray>> = {
  paytype: [
    { pay_type_id: 1, pay_type: 'контракт' },
    { pay_type_id: 2, pay_type: 'бюджет' },
  ],
  payperiod: [
    { pay_period_id: 1, pay_period: 'рік' },
    { pay_period_id: 2, pay_period: 'семестр' },
  ],
  marktypes: [
    {
      marktype_id: 1,
      marktype: 'Відмітка про залік',
      details: 'зараховано / незараховано',
    },
    { marktype_id: 2, marktype: 'Оцінка', details: 'традиційна шкала 2..5' },
    { marktype_id: 3, marktype: 'Бали', details: '100-бальна шкала з ECTS' },
  ],
  testtypes: [
    { testtype_id: 1, title: 'екзамен', title_short: 'екз' },
    { testtype_id: 2, title: 'залік', title_short: 'зал' },
    { testtype_id: 3, title: 'курсова робота', title_short: 'кур' },
  ],
  groups: [
    { group_id: 'seed-grp-1', group_name: 'КН-11' },
    { group_id: 'seed-grp-2', group_name: 'ПІ-21' },
  ],
  institutes: [
    {
      institute_id: 'seed-inst-1',
      institute_name: 'Інститут комп’ютерно-інформаційних технологій',
    },
  ],
  formlearn: [
    { form_learn_id: 1, form_learn_name: 'денна' },
    { form_learn_id: 2, form_learn_name: 'заочна' },
  ],
  levellearn: [
    { level_learn_id: 1, level_learn_name: 'бакалавр' },
    { level_learn_id: 2, level_learn_name: 'магістр' },
  ],
};
