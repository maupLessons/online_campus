import {
  MaupWireArray,
  MaupWireObject,
} from '../integrations/maup-student-api/maup-student-api.types';
import {
  isWireObject,
  wireInteger,
  wireIsoDate,
  wireLookup,
  wireMatchesId,
  wireNumber,
  wireString,
} from '../integrations/maup-student-api/maup-wire.util';
import {
  GradebookEntryDto,
  GradebookEntryStatus,
  GradebookSemesterDto,
} from './gradebook.dto';

export type GradebookReferences = {
  markTypes: Map<string, string>;
  testTypes: Map<string, string>;
};

export type CurrentTermMarker = {
  maupAcademicYear: number;
  maupSemester: number;
};

/**
 * Єдине місце, де номер семестру з MAUP зіставляється з поточним AcademicTerm.
 * `year`/`semester` тут — уже приведені виклику значення (рік початку
 * навчального року і номер семестру В МЕЖАХ року, 1|2), а не сирі поля з wire.
 */
export function matchesCurrentTerm(
  year: number,
  semester: number,
  current: CurrentTermMarker | null,
): boolean {
  if (current === null) return false;
  return current.maupAcademicYear === year && current.maupSemester === semester;
}

/**
 * `AcademicTerm.maupSemester` (спека 01 §4.1) — лише 1|2 у межах року, тоді
 * як `marks.semestr` — наскрізна нумерація освітньої програми 1..12
 * (підтверджено спекою 04 §4.1/§11.1a). ASSUMED (спека 04 §11.1): яким саме
 * є непарний/парний семестр (осінній/весняний) документація не уточнює —
 * так само як С4, це припущення, а не підтверджений факт; зіставлення з
 * `AcademicTerm` йде за залишком від ділення на 2, а не за сирим числом.
 */
function withinYearSemester(semester: number): 1 | 2 {
  return ((semester - 1) % 2) + 1 === 1 ? 1 : 2;
}

export function mapMaupMarks(
  rows: MaupWireArray,
  externalStudentId: string,
  refs: GradebookReferences,
  current: CurrentTermMarker | null,
): GradebookSemesterDto[] {
  const buckets = new Map<
    string,
    {
      academicYearStart: number;
      semester: number;
      entries: GradebookEntryDto[];
    }
  >();

  for (const studentRow of rows) {
    if (!isWireObject(studentRow) || !Array.isArray(studentRow.marks)) continue;
    // PII: беремо лише рядок запитаного студента — `rows` теоретично може
    // містити блоки інших студентів (спека 04 §11.1a цього не виключає).
    if (!wireMatchesId(studentRow.student_id, externalStudentId)) continue;

    for (const block of studentRow.marks) {
      if (!isWireObject(block)) continue;
      const semester = wireInteger(block.semestr);
      if (semester === undefined) continue; // §11.1a: блок без семестру не піддається групуванню

      const subjects = (Array.isArray(block.subjects) ? block.subjects : [])
        .filter(isWireObject)
        // subjkind_id: 20 — рядок середньої оцінки семестру, не дисципліна.
        .filter((subject) => wireInteger(subject.subjkind_id) !== 20);

      const deduped = dedupeRetakes(subjects);

      // Рік визначається один раз на весь блок (найрання дата контролю
      // сесії серед дисциплін блоку): API групує сам за `semestr`,
      // дублювати групування за роком не потрібно, і одна назва семестру не
      // повинна розпадатись на дві через рідкісний запис, датований по
      // інший бік вересневої межі (напр. осіння ліквідація заборгованості
      // у вересні для семестру, чия основна сесія була навесні).
      // ASSUMED: `academicYear` — не поле API, MAUP документація не називає
      // окремого поля року для `marks` (спека 04 §11.1a перелічує підтверджені
      // поля без року). Рік виведено з календарної дати контролю за
      // вереснем-межею навчального року. Якщо в блоці немає жодної дати
      // (типово — поточний семестр до сесії: жодна дисципліна ще не має
      // mark_date/mark_act_date), рік береться з поточного AcademicTerm
      // (параметр `current`) — саме цей блок і є найімовірніше поточним
      // семестром; якщо активного терму теж немає, блок відкидається (немає
      // жодного джерела року).
      const academicYearStart =
        deriveAcademicYearStart(deduped) ?? current?.maupAcademicYear;
      if (academicYearStart === undefined) continue;

      const key = String(semester);
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { academicYearStart, semester, entries: [] };
        buckets.set(key, bucket);
      }

      for (const subject of deduped) {
        const subjectName = wireString(subject.title);
        if (!subjectName) continue; // пошкоджений рядок без назви дисципліни
        bucket.entries.push(mapEntry(subject, subjectName, refs));
      }
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      academicYear: `${bucket.academicYearStart}/${bucket.academicYearStart + 1}`,
      semester: bucket.semester,
      isCurrent: matchesCurrentTerm(
        bucket.academicYearStart,
        withinYearSemester(bucket.semester),
        current,
      ),
      entries: bucket.entries,
    }))
    .sort(
      (a, b) =>
        b.academicYear.localeCompare(a.academicYear) || b.semester - a.semester,
    );
}

/**
 * ASSUMED (спека 04 §11.1, С4): перескладання відрізняється від первинної
 * оцінки записом із максимальним `mark_act_date` у межах `subject_id`
 * (у контексті одного блоку `semestr`, бо `subject_id` сам по собі не
 * унікальний на весь навчальний план).
 */
function dedupeRetakes(subjects: MaupWireObject[]): MaupWireObject[] {
  const bySubjectId = new Map<string, MaupWireObject>();
  const withoutSubjectId: MaupWireObject[] = [];

  for (const subject of subjects) {
    const subjectId = subject.subject_id;
    if (typeof subjectId !== 'number' && typeof subjectId !== 'string') {
      withoutSubjectId.push(subject);
      continue;
    }
    const key = String(subjectId);
    const existing = bySubjectId.get(key);
    if (!existing || attemptTimestamp(subject) > attemptTimestamp(existing)) {
      bySubjectId.set(key, subject);
    }
  }

  return [...withoutSubjectId, ...bySubjectId.values()];
}

function attemptTimestamp(subject: MaupWireObject): number {
  const raw =
    wireIsoDate(subject.mark_act_date) ?? wireIsoDate(subject.mark_date);
  const parsed = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

function deriveAcademicYearStart(
  subjects: MaupWireObject[],
): number | undefined {
  // Найрання дата в блоці, а не перша-ліпша: порядок рядків у відповіді API
  // (і результат dedupeRetakes) не гарантований, а пізніша дата в блоці може
  // належати перескладанню, зданому вже в наступному навчальному році
  // (напр. осіння ліквідація заборгованості), що не повинно зсувати
  // academicYear усього блоку вперед.
  let earliest: string | undefined;
  for (const subject of subjects) {
    const date =
      wireIsoDate(subject.mark_date) ?? wireIsoDate(subject.mark_act_date);
    if (date && (earliest === undefined || date < earliest)) {
      earliest = date;
    }
  }
  return earliest === undefined
    ? undefined
    : academicYearStartFromDate(earliest);
}

function academicYearStartFromDate(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  // Навчальний рік у МАУП починається у вересні: контроль до вересня
  // належить року, що почався попереднього календарного року.
  return month >= 9 ? year : year - 1;
}

function mapEntry(
  subject: MaupWireObject,
  subjectName: string,
  refs: GradebookReferences,
): GradebookEntryDto {
  const score = wireNumber(subject.mark);
  const markText = wireString(subject.mark);
  const controlType =
    wireString(subject.testtype) ??
    wireLookup(refs.testTypes, subject.testtype_id) ??
    '—';

  const entry: GradebookEntryDto = {
    subject: subjectName,
    controlType,
    status: resolveStatus(score, markText),
  };
  const teacher = wireString(subject.prepod_name);
  const ects = wireString(subject.mark_ects);
  const date = wireIsoDate(subject.mark_date);
  if (teacher) entry.teacher = teacher;
  if (score !== undefined) entry.score = score;
  if (ects) entry.ects = ects.toUpperCase();
  if (date) entry.date = date;
  return entry;
}

/**
 * Спека 04 §11.1a (підтверджено документацією): статуси приходять текстом
 * просто в полі `mark` ("не допущений", "не зʼявився", "не склав",
 * "незараховано"), а не через окремий код у довіднику `marktypes` —
 * `marktype`/`marktype_id` описують шкалу оцінювання (Бали/Оцінка/Відмітка
 * про залік), а не результат, тому `refs.markTypes` тут не використовується.
 */
function resolveStatus(
  score: number | undefined,
  markText: string | undefined,
): GradebookEntryStatus {
  if (score !== undefined) return 'graded';
  if (!markText) return 'pending';
  // Прибираємо всі варіанти апострофа (U+0027, U+2019, U+02BC), якими могло
  // бути набрано «не з'явився» / «не з’явився» / «не зʼявився».
  const normalized = markText.toLowerCase().replace(/['’ʼ]/g, '');
  // Основи, а не повні форми: MAUP може віддати будь-який рід/число
  // («не допущена», «не склала», «не зʼявилась»), тому шаблони підрізані до
  // спільної частини слова — «допущ» покриває «допущений/-а/-і», «склав»
  // (закінчення на «-в», чол. рід) не покриває «склала/склали» («-л» перед
  // закінченням), тому поруч додано основу «склал»; так само «зявив»
  // (чол. рід) не покриває «зявилась/зявились», тому поруч — «зявил».
  if (normalized.includes('не допущ')) return 'not_admitted';
  if (normalized.includes('не зявив') || normalized.includes('не зявил')) {
    return 'absent';
  }
  if (
    normalized.includes('не склав') ||
    normalized.includes('не склал') ||
    normalized.includes('незарахован') ||
    normalized.includes('не зарахован')
  ) {
    return 'not_passed';
  }
  // ASSUMED (спека 04 §11.1): лише явний позитивний текст без заперечення
  // "не" на початку трактується як складений результат без числового балу
  // (напр. "зараховано" для заліку за шкалою "Відмітка про залік",
  // "атестований"). Будь-який інший нерозпізнаний текст ("не атестований",
  // "академічна заборгованість", "-" тощо) — `pending`, а не `graded`:
  // помилка розпізнавання має схилятися в бік "результату ще немає", а не
  // видавати незадовільний запис за складений.
  const isExplicitPass =
    !normalized.startsWith('не') &&
    (normalized.includes('зарахован') || normalized.includes('атестован'));
  return isExplicitPass ? 'graded' : 'pending';
}
