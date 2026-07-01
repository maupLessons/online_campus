# Електронний Кампус МАУП — Технічна документація

> Версія документа: 3.3
> Статус: актуальний

---

## Зміст

1. [Огляд проєкту](#1-огляд-проєкту)
2. [Архітектура системи](#2-архітектура-системи)
3. [Технологічний стек](#3-технологічний-стек)
4. [Модулі бекенду](#4-модулі-бекенду)
5. [Компоненти фронтенду](#5-компоненти-фронтенду)
6. [Модель даних](#6-модель-даних)
7. [API — повний опис ендпоінтів](#7-api--повний-опис-ендпоінтів)
8. [Рольова модель доступу (RBAC)](#8-рольова-модель-доступу-rbac)
9. [Безпека](#9-безпека)
10. [Принципи розширюваності](#10-принципи-розширюваності)
11. [Фази розробки](#11-фази-розробки)
12. [Структура проєкту](#12-структура-проєкту)
13. [Запуск та розгортання](#13-запуск-та-розгортання)
14. [CI/CD](#14-cicd)
15. [Тестові дані](#15-тестові-дані)

---

## 1. Огляд проєкту

**Електронний кампус МАУП** — самостійна корпоративна веб-платформа Міжрегіональної Академії Управління Персоналом (МАУП), що об'єднує всіх учасників навчального процесу в єдиному інтерфейсі.

### Призначення

Система є **самостійним порталом** з власною базою даних і власними критичними процесами: кабінети користувачів, розклад, дисципліни, додаткові матеріали, опитування, вибіркові дисципліни, сповіщення, новини МАУП, довідники та аудит. Moodle не інтегрується і не вбудовується в портал: завдання, здача робіт та офіційне оцінювання живуть окремо в Moodle за посиланням `https://dist.maup.com.ua/`. Кампус може показувати зовнішній перехід у Moodle та зберігати HTTPS-посилання як додаткові матеріали дисципліни або посилання на онлайн-пари.

```
┌─────────────────────────────────────────────────────────┐
│              Студенти / Викладачі / Адміністрація        │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTPS / REST API
                           ▼
┌─────────────────────────────────────────────────────────┐
│                    Кампус — єдина система                │
│  Auth · Users · Schedule · Courses · Surveys            │
│  Notifications · News · References · AuditLog           │
│  Elective disciplines                                   │
│                 Власна БД (MongoDB)                      │
└─────────────────────────────────────────────────────────┘
                           │ external link only
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Moodle — зовнішня LMS, не частина порталу   │
└─────────────────────────────────────────────────────────┘
```

### Ключові можливості

- Особисті кабінети для **7 ролей** з різними наборами функцій
- Перегляд розкладу (день / тиждень) з перевіркою конфліктів
- Перегляд дисциплін поточного навчального контексту, додаткових матеріалів і зовнішніх HTTPS-посилань
- Перехід до Moodle для завдань, здачі робіт та офіційного оцінювання
- **Система опитувань** — створення, проходження студентами та викладачами, аналіз результатів
- **Вибіркові дисципліни** — критичний модуль: вибір студентом із запропонованого переліку та фіксація результату в кабінеті
- Система сповіщень: зміни розкладу, опитування, оголошення
- Новини МАУП з офіційної RSS-стрічки через backend proxy з cache/fallback
- Відновлення пароля через одноразовий reset token без розкриття існування акаунта
- Повний RBAC з явною матрицею дозволів без успадкування ролей та аудит-логом дій

---

## 2. Архітектура системи

### Загальна схема

```
┌─────────────────────────────────────────────────────────┐
│                    КЛІЄНТ (браузер)                      │
│   React 19 + Vite + TypeScript + Tailwind CSS + Zustand  │
│   Port: 5173 (dev) / 80 (prod via Nginx)                 │
└──────────────────────────┬──────────────────────────────┘
                           │  HTTPS / REST API
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   БЕКЕНД (NestJS)                        │
│   Port: 3000 | Global prefix: /api                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              CORE MODULES                         │   │
│  │  AuthModule · UsersModule · ScheduleModule        │   │
│  │  CoursesModule · SurveysModule                    │   │
│  │  NotificationsModule · NewsModule                  │   │
│  │  ReferencesModule · ElectiveDisciplinesModule      │   │
│  │  ReportsModule · AuditLogModule · FilesModule      │   │
│  │  DatabaseMigrationsModule · MaupStudentApiModule   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                 DATA LAYER                        │   │
│  │  MongoDB 7 + Mongoose ODM                         │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Шари застосунку

| Шар              | Відповідальність                                        |
| ---------------- | ------------------------------------------------------- |
| **Presentation** | React-компоненти, сторінки, форми                       |
| **State**        | Zustand stores: auth, notifications                     |
| **API Client**   | Axios-інстанс з cookie-based session interceptors       |
| **Controller**   | NestJS controllers — прийом HTTP-запитів, валідація DTO |
| **Service**      | Бізнес-логіка, оркестрація модулів                      |
| **Data**         | MongoDB collections через Mongoose ODM                  |

---

## 3. Технологічний стек

### Бекенд

| Технологія      | Версія | Призначення                           |
| --------------- | ------ | ------------------------------------- |
| Node.js         | 24.17  | Runtime                               |
| npm             | 11.13  | Package manager                       |
| NestJS          | 11     | Framework (модулі, DI, guards, pipes) |
| TypeScript      | 5      | Типізація                             |
| Passport.js     | —      | Стратегія JWT-аутентифікації          |
| `@nestjs/jwt`   | —      | JWT access/refresh tokens             |
| bcryptjs        | —      | Хешування паролів                     |
| class-validator | —      | Валідація DTO                         |
| Helmet          | —      | HTTP security headers                 |
| Mongoose        | 9      | ODM для MongoDB                       |
| MongoDB         | 7      | База даних                            |

### Фронтенд

| Технологія          | Версія | Призначення                       |
| ------------------- | ------ | --------------------------------- |
| React               | 19     | UI framework                      |
| TypeScript          | 5      | Типізація                         |
| Vite                | 8      | Bundler / dev-сервер              |
| Tailwind CSS        | 4      | Утилітарні стилі                  |
| Zustand             | 5      | State management (auth, UI state) |
| Axios               | —      | HTTP-клієнт з interceptors        |
| React Router        | 7      | Клієнтський роутинг               |
| React Hook Form     | 7      | Form state management             |
| Zod                 | 4      | Schema validation                 |
| @hookform/resolvers | —      | React Hook Form + Zod integration |
| Lucide React        | —      | Icon library                      |

### Інфраструктура

| Технологія     | Призначення                                         |
| -------------- | --------------------------------------------------- |
| Docker         | Контейнеризація                                     |
| Docker Compose | Оркестрація dev-середовища                          |
| Nginx          | Веб-сервер для prod (серверинг SPA + reverse proxy) |
| GitHub Actions | CI/CD pipeline                                      |

---

## 4. Модулі бекенду

### 4.1 AuthModule

**Файли:** `src/auth/`

**Відповідальність:** аутентифікація, видача та оновлення JWT-сесій через захищені cookies, перевірка статусу акаунту, зміна та відновлення пароля.

**Компоненти:**

| Файл                 | Опис                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------ |
| `auth.controller.ts` | HTTP-ендпоінти: POST /login, POST /refresh, GET /profile, password reset, встановлення/очищення auth cookies |
| `auth.service.ts`    | Валідація пароля (bcrypt), генерація access/refresh токенів, одноразові reset tokens |
| `jwt.strategy.ts`    | Passport JWT стратегія — читає access token з HttpOnly cookie або Bearer fallback, додає user до request |
| `jwt-auth.guard.ts`  | Guard — перевіряє наявність та валідність access token                               |
| `roles.guard.ts`     | Guard — перевіряє точний перелік ролей, явно заданий декоратором `@Roles()`           |

**Логіка токенів:**

- `accessToken` — дія 15 хв (налаштовується через env), видається в `HttpOnly` cookie
- `refreshToken` — дія 7 днів, видається в окремій `HttpOnly` cookie з вужчим path `/api/auth`
- Payload: `{ sub: userId, login, role }`
- Browser clients не отримують токени в JSON і не зберігають їх у `localStorage`
- Для unsafe HTTP-методів frontend додає signed CSRF token з cookie `campus_csrf_token` у header `X-CSRF-Token`; підпис прив'язаний до окремої HttpOnly binding cookie
- При невірних даних — відповідь без деталей
- Заблокований акаунт — відмова до перевірки пароля
- Password reset token генерується криптографічно безпечно, зберігається тільки як SHA-256 hash, має TTL і стає недійсним після використання
- У production reset token не повертається в API-відповіді; reset link доставляється через обов'язковий authenticated SMTP transport
- SMTP failure не змінює generic API-відповідь і не розкриває наявність акаунта; результат delivery фіксується в audit details

---

### 4.2 UsersModule

**Файли:** `src/users/`

**Відповідальність:** управління обліковими записами, серверна пагінація, пошук за кількома частинами ПІБ, фільтрація за роллю та статусом, скидання фільтрів і перегляд профілів. Ректор і президент мають глобальний read-only доступ до каталогу; мутації доступні лише адміністратору.

**Ендпоінти та доступ:**

| Метод | Шлях                       | Доступ                         |
| ----- | -------------------------- | ------------------------------ |
| GET   | `/users?page=&limit=&role=&status=&search=` | admin, rector, president; глобальний read-only для rector/president |
| GET   | `/users/search?q=&role=`   | admin, rector, president, dean, department_head; scoped для dean/department_head |
| GET   | `/users/:id`               | admin, rector, president, dean; scoped для dean |
| GET   | `/users/group/:groupId`    | teacher+                       |
| GET   | `/users/department/:depId` | department_head+               |
| POST  | `/users`                   | admin                          |
| PATCH | `/users/:id`               | admin (часткове оновлення)     |
| PATCH | `/users/:id/block`         | admin                          |
| PATCH | `/users/:id/role`          | admin                          |

`GET /users` повертає стандартний `PaginatedDto<UserDto>`. Дозволені розміри сторінки — від 1 до 100; frontend пропонує 10, 25, 50 або 100 записів. Пошук обмежено 100 символами, він нечутливий до регістру та підтримує до трьох частин ПІБ у довільному порядку. Фільтр `status` приймає `active` або `blocked`.

---

### 4.3 ScheduleModule

**Файли:** `src/schedule/`

**Відповідальність:** зберігання та відображення розкладу; перевірка конфліктів
(накладання по викладачу, аудиторії та групі); рольове й об'єктне обмеження
видимості; адміністративні workflow для скасування, перенесення та заміни занять;
шаблони й масові операції; CSV/XLSX-експорт; персональні сповіщення про зміни.

**Ендпоінти та доступ:**

| Метод  | Шлях                                                              | Доступ                                               |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/schedule?date=&startDate=&endDate=&groupId=&teacherId=&status=` | авторизовані; результат обмежується академічним scope |
| GET    | `/schedule/my`                                                    | авторизовані; особистий видимий розклад              |
| GET    | `/schedule/export?format=csv\|xlsx&locale=uk\|en`                 | авторизовані; CSV/XLSX у межах видимого scope        |
| GET    | `/schedule/:id`                                                   | авторизовані; з object-level перевіркою доступу       |
| POST   | `/schedule`                                                       | admin                                                |
| PUT    | `/schedule/:id`                                                   | admin                                                |
| POST   | `/schedule/:id/cancel`                                            | admin; обов'язкова причина                           |
| POST   | `/schedule/:id/reschedule`                                        | admin; новий час/аудиторія + причина                 |
| POST   | `/schedule/:id/substitution`                                      | admin; заміна дисципліни/аудиторії/часу              |
| POST   | `/schedule/bulk`                                                  | admin; dry-run/skipConflicts                         |
| POST   | `/schedule/bulk/cancel`                                           | admin; масове скасування з причиною                  |
| GET    | `/schedule/templates`                                             | admin                                                |
| POST   | `/schedule/templates`                                             | admin                                                |
| PUT    | `/schedule/templates/:id`                                         | admin                                                |
| DELETE | `/schedule/templates/:id`                                         | admin; архівація шаблону                             |
| POST   | `/schedule/templates/:id/apply`                                   | admin; генерація розкладу за шаблоном                |
| DELETE | `/schedule/:id`                                                   | admin                                                |

**Перевірка конфліктів:** при створенні, редагуванні, перенесенні, заміні,
масовому створенні та застосуванні шаблонів перевіряється зайнятість
викладача, аудиторії та групи. Скасовані записи не блокують часовий слот.

**Безпека й scope:** звичайні користувачі бачать лише свій академічний scope;
фільтри поза дозволеним scope відхиляються. Для вибіркових дисциплін доступ,
розклад і сповіщення використовують фактичне enrollment scope, а не лише
належність до групи. Експорт обмежений 5000 записами, не кешується і проходить
через спільну spreadsheet-sanitization інфраструктуру.

**Frontend:** сторінка `SchedulePage` підтримує перегляд день/тиждень, статуси
`scheduled`/`cancelled`/`rescheduled`/`substituted`, CSV/XLSX-експорт і
повноцінну адміністративну UI для створення, редагування, видалення, скасування,
перенесення, замін, шаблонів та масового скасування. Для очних і дистанційних
занять підтримується окреме HTTPS-посилання `onlineUrl`; воно проходить
валідацію, аудит, шаблони та CSV/XLSX-експорт і відображається як кнопка
«Відкрити онлайн-пару».

> **Погоджений напрямок:** офіційний основний і сесійний розклад має надходити
> з API МАУП. Для студентського `/schedule/my` і schedule export підключено
> backend-only read-through до MAUP API: якщо `MAUP_API_ENABLED=true` і профіль
> студента має `externalStudentId` або `recordBookNumber`, сервер читає
> `/schedule` МАУП, нормалізує відповідь до `ScheduleEntryDto` і не передає
> credentials у browser. Якщо інтеграція вимкнена або student lookup відсутній,
> використовується поточний локальний scoped schedule.

---

### 4.4 CoursesModule

**Файли:** `src/courses/`

**Відповідальність:** дисципліни, детальна інформація про дисципліну, студенти групи, додаткові матеріали, HTTPS-посилання на зовнішні навчальні ресурси та електронний журнал занять у межах порталу. Викладач бачить закріплені дисципліни, студентів групи, веде теми занять і відвідування. Завдання, здача робіт і офіційне оцінювання не дублюються в кампусі та ведуться в Moodle окремо за посиланням `https://dist.maup.com.ua/`.

> **Поточний стан коду:** legacy API для локальних assignments/submissions/grades
> збережено для сумісності даних, історії та звітів, але основний frontend-сценарій
> приховує локальні вкладки завдань/оцінок і показує користувачам Moodle як
> офіційний навчальний контур. Фізичне видалення legacy API потребує окремого
> погодженого плану міграції даних і звітності.

**Ендпоінти та доступ:**

| Метод  | Шлях                              | Доступ                                                  |
| ------ | --------------------------------- | ------------------------------------------------------- |
| GET    | `/courses`                        | всі авторизовані                                        |
| GET    | `/courses/my`                     | student (свій семестр), teacher (закріплені дисципліни) |
| GET    | `/courses/course-assignments/:id` | авторизовані (деталі призначення)                       |
| GET    | `/courses/course-assignments/:id/students` | teacher+ (студенти групи або фіналізованого elective) |
| GET    | `/courses/:caId/materials`        | авторизовані                                            |
| POST   | `/courses/:caId/materials`        | teacher+                                                |
| PUT    | `/courses/:caId/materials/:id`    | teacher+                                                |
| DELETE | `/courses/:caId/materials/:id`    | teacher+                                                |
| GET    | `/courses/:caId/assignments`      | legacy/internal; не основний frontend-сценарій          |
| POST   | `/courses/:caId/assignments`      | teacher+                                                |
| PUT    | `/courses/:caId/assignments/:id`  | teacher+                                                |
| GET    | `/courses/:caId/grades`           | legacy/internal; не основний frontend-сценарій          |
| GET    | `/courses/:caId/journal`          | teacher+                                                |
| POST   | `/courses/:caId/journal`          | teacher+                                                |
| PATCH  | `/courses/journal/:id`            | teacher+                                                |
| DELETE | `/courses/journal/:id`            | teacher+                                                |
| GET    | `/courses/assignments/my`         | legacy/internal; student route redirects to Moodle      |
| GET    | `/courses/assignments/:id/submissions` | teacher+                                           |
| GET    | `/courses/grades/my`              | legacy/internal; student route redirects to Moodle      |
| POST   | `/courses/assignments/:id/submit` | student                                                 |
| DELETE | `/courses/assignments/:id/submit` | student (лише неоцінена робота до дедлайну)             |
| PATCH  | `/courses/submissions/:id/return` | teacher+ (повернення на доопрацювання до дедлайну)      |
| POST   | `/courses/submissions/:id/grade`  | teacher                                                 |

Життєвий цикл студентської роботи: `submitted → returned → submitted → graded`.
Оцінка за повернену роботу архівується без фізичного видалення, а повторна
здача створює нову спробу в межах того самого запису роботи.

---

### 4.5 SurveysModule

**Файли:** `src/surveys/`

**Відповідальність:** створення опитувань, проходження студентами та викладачами, перегляд результатів. Опитування можуть бути спрямовані на всіх студентів, всіх викладачів, студентів і викладачів разом, конкретні групи або студентів курсів.

**Сутності:**

```typescript
interface Survey {
  id: string;
  title: string;
  description?: string;
  createdBy: string;
  targetType:
    | "all"
    | "teachers"
    | "students_teachers"
    | "groups"
    | "course";
  targetIds: string[]; // group ids для groups, course/course assignment ids для course, порожній масив для all/teachers/students_teachers
  status: "draft" | "active" | "closed";
  anonymous: boolean; // якщо true — відповіді без userId
  startDate: string;
  endDate: string;
  publishedAt?: string;
  closedAt?: string;
  expectedRecipients?: number; // знімок розміру аудиторії на момент публікації
  createdAt: string;
  updatedAt: string;
}

interface SurveyQuestion {
  id: string;
  surveyId: string;
  order: number;
  text: string;
  type: "single" | "multiple" | "text" | "rating";
  required: boolean;
  options: string[]; // для single/multiple
}

interface SurveyResponse {
  id: string;
  surveyId: string;
  userId: string | null; // null якщо isAnonymous
  submittedAt: string;
  answers: {
    questionId: string;
    value: string | string[] | number; // string[] для multiple, number 1..5 для rating
  }[];
}
```

**Ендпоінти:**

| Метод  | Шлях                          | Доступ                          | Опис                                         |
| ------ | ----------------------------- | ------------------------------- | -------------------------------------------- |
| POST   | `/surveys`                    | admin, dean                     | Створити опитування                          |
| GET    | `/surveys`                    | admin, dean, rector, president  | Список; rector/president працюють read-only  |
| GET    | `/surveys/active`             | student, teacher                | Активні опитування для поточного користувача |
| GET    | `/surveys/:id`                | авторизовані                    | Деталі опитування з питаннями                |
| PUT    | `/surveys/:id`                | admin, dean (автор)             | Редагування (тільки в статусі draft)         |
| PATCH  | `/surveys/:id/publish`        | admin, dean (автор)             | Публікація (draft → active)                  |
| PATCH  | `/surveys/:id/close`          | admin, dean (автор)             | Закрити активне опитування (active → closed) |
| DELETE | `/surveys/:id`                | admin                           | Видалити (тільки draft)                      |
| POST   | `/surveys/:id/respond`        | student, teacher                | Надіслати відповіді                          |
| GET    | `/surveys/:id/my-response`    | student, teacher                | Перевірити — чи вже пройшов                  |
| GET    | `/surveys/:id/results`        | admin, dean (автор), rector, president | Агреговані результати                 |
| GET    | `/surveys/:id/results/export?format=csv` | admin, dean (автор), rector, president | Структурований UTF-8 CSV-звіт після закриття |
| GET    | `/surveys/:id/results/export?format=xlsx` | admin, dean (автор), rector, president | Форматований XLSX-звіт після закриття |

**Логіка:**

- Студент або викладач може проходити доступне йому опитування **лише один раз**
- Дата початку та дата завершення є обов’язковими; без повного коректного періоду чернетку не можна створити або опублікувати
- Аудиторія `all` означає всіх студентів; для викладачів використовуються окремі аудиторії `teachers` і `students_teachers`
- При `isAnonymous: true` — userId не зберігається у відповіді, але факт проходження фіксується окремо (щоб не дати пройти двічі)
- Публікація з майбутнім `startDate` зберігає запланований старт; опитування видиме за прямим посиланням, але пройти його можна лише після старту
- Опитування з `endDate` у минулому автоматично переводяться в статус `closed` під час запитів
- Під час публікації фіксується кількість активних отримувачів; історичний відсоток проходження не змінюється через подальші зміни груп, курсів або статусів користувачів
- Живі агреговані результати доступні для активного опитування, але фінальний XLSX/CSV-експорт дозволений лише після переходу в статус `closed`
- Результати показують: очікувану аудиторію, кількість проходжень, відсоток проходження, кількість відповідей на кожен варіант, середнє для rating, текстові відповіді списком
- CSV використовує UTF-8 BOM, Excel-сумісний роздільник `;`, CRLF та українські заголовки
- XLSX містить окремі аркуші зведення, розподілу відповідей і текстових відповідей, автофільтри, закріплені рядки та числові формати
- XLSX/CSV-експорт екранує формули (`=`, `+`, `-`, `@`) для захисту від spreadsheet injection та повертається з `Cache-Control: private, no-store`
- Для модуля є окремий MongoDB E2E quality gate: `npm run test:e2e:db -- surveys.e2e-spec.ts`

---

### 4.6 ElectiveDisciplinesModule

**Файли:** `src/elective-disciplines/`

**Відповідальність:** вибір студентами вибіркових дисциплін із запропонованого переліку та фіксація результатів у кабінеті. Це окремий критичний портал-процес, який має зберігатися у MongoDB і не залежати від Moodle.

**Сутності:**

```typescript
interface ElectiveDiscipline {
  id: string;
  code: string;
  title: string;
  description?: string;
  department: { id: string; name?: string };
  teacher?: { id: string; name?: string } | null;
  semester: number;
  credits: number;
  capacity: number;
  enrolledCount: number;
  availableSeats: number;
  status: "draft" | "active" | "archived";
}

interface ElectiveSelectionPeriod {
  id: string;
  title: string;
  academicYear: string;
  semester: number;
  startsAt: string;
  endsAt: string;
  status: "draft" | "active" | "closed" | "finalized";
  targetGroups: Array<{ id: string; code?: string }>;
  requiredChoices: number;
  finalizedAt?: string;
}

interface ElectiveSelection {
  id: string;
  periodId: string;
  discipline: ElectiveDiscipline;
  student: { id: string; name?: string };
  group: { id: string; code?: string };
  selectedAt: string;
  courseAssignmentId?: string;
  finalizedAt?: string;
}
```

**Ендпоінти:**

| Метод | Шлях | Доступ | Опис |
| ----- | ---- | ------ | ---- |
| GET | `/electives/active` | student | Доступні періоди та дисципліни для поточного студента |
| GET | `/electives/my` | student | Мій поточний/історичний вибір |
| POST | `/electives/periods/:periodId/select` | student | Зафіксувати вибір дисципліни |
| DELETE | `/electives/periods/:periodId/selections/:selectionId` | student | Скасувати свій вибір у відкритому періоді |
| GET | `/electives/disciplines` | admin, department_head, dean | Список дисциплін |
| POST | `/electives/disciplines` | admin, department_head, dean | Створити дисципліну-чернетку |
| PUT | `/electives/disciplines/:id` | admin, department_head, dean | Оновити дисципліну |
| PATCH | `/electives/disciplines/:id/status` | admin, department_head, dean | Активувати або архівувати дисципліну |
| GET | `/electives/periods` | admin, dean | Список періодів вибору |
| POST | `/electives/periods` | admin, dean | Створити період вибору |
| PUT | `/electives/periods/:id` | admin, dean | Оновити чернетку періоду |
| PATCH | `/electives/periods/:id/status` | admin, dean | Виконати дозволений перехід `draft → active` або `active → closed` |
| POST | `/electives/periods/:id/finalize` | admin, dean | Фіналізувати закритий період, створити навчальні курси та додати їх у `Мої дисципліни` вибраних студентів |
| GET | `/electives/periods/:id/results` | admin, dean | Результати закритого або фіналізованого періоду |
| GET | `/electives/periods/:id/results/export?format=csv` | admin, dean | Структурований UTF-8 CSV-звіт |
| GET | `/electives/periods/:id/results/export?format=xlsx` | admin, dean | Форматований XLSX-звіт |

**Frontend routes:**

| Шлях | Доступ | Опис |
| ---- | ------ | ---- |
| `/electives` | student | Активні періоди, доступні дисципліни, вибір/скасування |
| `/electives/admin` | admin, department_head, dean | Каталог дисциплін; періоди та XLSX/CSV export доступні admin/dean |

**Бізнес-правила:**

- життєвий цикл періоду є послідовним і незворотним: `draft → active → closed → finalized`;
- чернетку можна редагувати або відкрити; закриття, результати та експорт для чернетки заборонені на UI та API;
- активний період можна тільки закрити; проміжні результати та експорт недоступні, щоб не впливати на вибір студентів;
- закритий період дозволяє перегляд результатів, XLSX/CSV-експорт і фіналізацію;
- фіналізований період є незмінним, а його результати залишаються доступними для звітності;
- студент може обирати дисципліни тільки в активний період і тільки для своєї групи;
- кількість виборів обмежується `requiredChoices`;
- одна дисципліна не може бути вибрана двічі одним студентом у межах періоду;
- ліміт місць контролюється атомарно на рівні MongoDB, щоб уникнути race condition;
- керівник кафедри може керувати дисциплінами тільки своєї кафедри;
- викладач дисципліни має бути активним користувачем і належати до кафедри цієї дисципліни;
- після відкриття періоду студентам цільових груп створюються групові сповіщення;
- після закриття періоду адміністратор або декан фіналізує результати окремою дією;
- фіналізація створює або оновлює `Course` та `CourseAssignment` з `source: "elective"` і `enrolledStudents`, тому вибіркова дисципліна зʼявляється у `Мої дисципліни` тільки у студентів, які її реально обрали;
- для фіналізації кожна вибрана дисципліна повинна мати призначеного активного викладача;
- після фіналізації студентам надсилаються персональні сповіщення з переходом у `/courses`;
- кожен вибір і адміністративна дія проходить через захищені API та глобальний audit interceptor;
- після закриття періоду результати та XLSX/CSV-експорт доступні декану та адміністратору;
- CSV використовує UTF-8 BOM, Excel-сумісний роздільник, CRLF, українські заголовки, зведення та деталізацію виборів;
- XLSX містить окремі аркуші зведення і виборів студентів, стилізовані заголовки, автофільтри, закріплені рядки, формати дат і відсотків;
- обидва формати нейтралізують значення, що можуть бути інтерпретовані табличним редактором як формули;
- критичні сценарії модуля перевіряються окремим MongoDB E2E-набором `npm run test:e2e:db -- electives.e2e-spec.ts`: RBAC, lifecycle, кафедральна ізоляція, конкурентний вибір останнього місця, ліміт виборів, безпечне скасування, фіналізація, інтеграція з курсами, аудит і захищений XLSX/CSV-експорт.

---

### 4.7 ReferencesModule

**Файли:** `src/references/`

**Відповідальність:** довідники системи — групи, аудиторії, кафедри,
факультети, спеціальності. Усі авторизовані ролі мають read-only доступ до
сторінки `/references`, але backend повертає лише записи в межах академічних
повноважень користувача. Повне CRUD-керування, імпорт та експорт доступні
тільки адміністратору.

**Ендпоінти:**

| Метод           | Шлях                          | Опис                                         |
| --------------- | ----------------------------- | -------------------------------------------- |
| GET             | `/references/groups`          | Список груп (+ фільтр за курсом)              |
| GET             | `/references/groups/:id`      | Деталі групи                                 |
| GET             | `/references/classrooms`      | Список аудиторій (+ фільтр по типу, корпусу) |
| GET             | `/references/departments`     | Список кафедр                                |
| GET             | `/references/departments/:id` | Деталі кафедри                               |
| GET             | `/references/faculties`       | Список факультетів                           |
| GET             | `/references/specialties`     | Список спеціальностей                        |
| GET             | `/references/catalog/:type`   | Пошук і пагінація у межах академічного scope |
| POST/PUT/DELETE | `/references/*`               | admin                                        |
| GET             | `/references/admin/:type`     | admin — пошук і пагінація                    |
| GET             | `/references/admin/:type/export?format=csv\|xlsx` | admin — безпечний експорт |
| POST            | `/references/admin/:type/import` | admin — CSV/XLSX dry-run та імпорт         |

**Поточний стан:** модуль закритий end-to-end. Реалізовано:

- спільну React-сторінку `/references` з п'ятьма вкладками, пошуком і
  пагінацією; для більшості ролей вона працює в режимі read-only, а admin
  додатково отримує створення, редагування, імпорт, експорт і захищене
  видалення;
- централізований `ReferencesAccessService`, який застосовує object-level
  authorization до списків і окремих записів на основі профілю користувача,
  призначень курсів, зарахування на вибіркові дисципліни та розкладу;
- глобальний read scope для admin, rector і president; керований
  scope для dean і department_head; власні кафедри, групи та аудиторії для
  teacher; власний академічний контекст для student;
- fail-closed поведінку та `404 Not Found` для чужих об'єктів без розкриття
  факту їх існування;
- сувору DTO-валідацію, нормалізацію кодів і перетворення duplicate key у
  контрольований `409 Conflict`;
- перевірку активного статусу й допустимої ролі декана, завідувача кафедри та
  куратора;
- integrity checks для users, courses, assignments, schedule, surveys,
  ElectiveDisciplinesModule і групових notifications;
- локалізований CSV/XLSX-експорт із заголовками мовою інтерфейсу,
  єдиним для проєкту UTF-8 BOM CSV та нейтралізацією spreadsheet formulas;
- CSV/XLSX-імпорт до 2 МБ / 1000 рядків із підтримкою CSV у UTF-8
  (та UTF-16LE для зворотної сумісності),
  локалізованих заголовків, перевіркою сигнатури, забороною формул, пошуком
  дубльованих рядків, dry-run і транзакційним застосуванням;
- окремий MongoDB E2E-набір:
  `npm run test:e2e:db -- references.e2e-spec.ts`.

---

### 4.8 NotificationsModule

**Файли:** `src/notifications/`

**Відповідальність:** генерація, зберігання та доставка сповіщень для конкретних користувачів або груп.

**Ендпоінти:**

| Метод | Шлях                          | Опис                             |
| ----- | ----------------------------- | -------------------------------- |
| GET   | `/notifications?search=&type=&readState=&important=&targetType=&dateFrom=&dateTo=` | Мої сповіщення з фільтрами |
| GET   | `/notifications/unread-count` | Кількість непрочитаних           |
| GET   | `/notifications/stream`       | Authenticated SSE stream         |
| PATCH | `/notifications/:id/read`     | Позначити прочитаним             |
| PATCH | `/notifications/read-all`     | Позначити всі прочитаними        |
| POST  | `/notifications/broadcast`    | admin — надіслати всім або групі |

SSE передає тільки сигнал про зміну, після якого frontend перечитує scoped API;
текст сповіщення в event stream не дублюється. Nginx buffering для stream
вимкнений. Поточний event bus працює в одному backend process; для кількох
replicas потрібен Redis/NATS adapter.

На сторінці сповіщень доступні debounced-пошук, фільтри за прочитаністю,
типом, важливістю та періодом створення; адміністратор додатково фільтрує за
аудиторією. Фільтри застосовуються на backend після перевірки видимого
користувачеві scope. Для `dateTo` дата без часу включає весь день до
`23:59:59.999Z`.

**Типи сповіщень:**

| Тип               | Коли генерується                         |
| ----------------- | ---------------------------------------- |
| `schedule_change` | Зміна / скасування / перенесення заняття |
| `new_assignment`  | Викладач опублікував нове завдання       |
| `grade`           | Виставлено нову оцінку студенту          |
| `new_survey`      | Опубліковано нове опитування             |
| `announcement`    | Адмін надіслав оголошення                |
| `system`          | Технічні повідомлення                    |

---

### 4.8.1 NewsModule

**Файли:** `src/news/`

**Відповідальність:** читання офіційної RSS/Atom-стрічки МАУП через backend,
нормалізація новин для інтерфейсу та безпечний fallback, якщо зовнішній сайт
тимчасово недоступний.

**Поточна реалізація:**

- `GET /news?limit=1..20` доступний авторизованим користувачам;
- source URL за замовчуванням — публічна RSS-стрічка
  `https://maup.com.ua/ua/feed.xml`;
- backend обмежує host через `MAUP_NEWS_FEED_ALLOWED_HOST`, перевіряє розмір
  відповіді, використовує timeout і короткий in-memory cache;
- якщо RSS недоступний, API повертає кешовані дані як `stale`, а без кешу —
  порожній список із `unavailable=true`, щоб dashboard не падав;
- frontend має сторінку `/news` і компактний блок новин на dashboard.

---

### 4.9 AuditLogModule

**Файли:** `src/audit-log/`

**Відповідальність:** ведення журналу всіх значущих дій. Необхідний для безпеки та розслідування інцидентів.

**Що логується:**

- Всі входи (успішні та невдалі) з IP та user-agent
- Зміни ролей та блокування акаунтів із попереднім/новим станом і ознакою відкликання сесій
- CRUD-операції над розкладом із компактними знімками `before`/`after`
- Виставлення та редагування оцінок із прив'язкою до студента, курсу, завдання та значення
- Публікація та закриття опитувань із назвою, аудиторією та переходом статусу
- Завантаження та видалення файлів із безпечними метаданими без внутрішнього шляху зберігання
- Публікація, закриття й фіналізація періодів вибіркових дисциплін, а також вибір і скасування вибору студентом

**Стабільні доменні назви подій:**

| Домен | Події |
|---|---|
| Користувачі | `user.role.change`, `user.status.change` |
| Розклад | `schedule.create`, `schedule.update`, `schedule.delete` |
| Оцінки | `grade.create`, `grade.update`, `grade.submission.grade` |
| Опитування | `survey.publish`, `survey.close` |
| Файли | `file.upload`, `file.delete` |
| Вибіркові дисципліни | `elective.period.publish`, `elective.period.close`, `elective.period.finalize`, `elective.selection.select`, `elective.selection.cancel` |
| Аналітичні звіти | `report.view`, `report.export` |

Глобальний interceptor зберігає резервний HTTP-аудит для непокритих
мутацій і помилок. Якщо сервіс уже записав доменну подію, дубль HTTP-події
не створюється. Для помилок зберігаються лише тип і HTTP-статус без тексту
винятку або тіла запиту.

**Transactional outbox і append-only sink:**

- усі HTTP-мутації за замовчуванням виконуються в MongoDB-транзакції;
- доменна операція та запис у `audit_outbox` комітяться або відкочуються
  разом, тому успішна зміна не може залишитися без журналу;
- фоновий processor атомарно захоплює події, переносить їх до append-only
  колекції `auditlogs` і використовує унікальний `eventId` для ідемпотентності;
- startup readiness check зупиняє застосунок, якщо транзакційний режим
  увімкнений на MongoDB без replica set;
- тимчасові помилки обробляються exponential backoff, завислі lock-и
  відновлюються, а вичерпані події переходять у стан `dead`;
- записи фінального журналу незмінні на рівні Mongoose schema; update,
  replace і delete операції відхиляються;
- оброблені outbox-події зберігаються 7 днів для діагностики, після чого
  видаляються TTL-індексом; фінальний аудит не має TTL.
- admin UI має domain presets і filtered CSV/XLSX export; один export
  обмежений 10 000 записами.

Транзакційний режим потребує MongoDB replica set. Локальний
`docker-compose.yml` запускає single-node `rs0` із keyfile-аутентифікацією та
ідемпотентним init-контейнером. Для кожного середовища потрібно один раз
створити окремий секрет:

```bash
openssl rand -hex 48
```

Значення зберігається як `MONGO_REPLICA_SET_KEY` у локальному `.env` або
GitHub Actions secret. Воно не повинно потрапляти до Git.

Автоматичне закриття прострочених опитувань і періодів вибору фіксується
системною агрегованою подією (`userLogin: system`) із кількістю закритих
сутностей, граничним часом і переходом статусу.

`details` проходить централізовану санітизацію: секрети й токени
редагуються, небезпечні ключі прототипу відкидаються, а глибина, довжина
рядків, кількість ключів, елементів і загальний обсяг структури обмежуються.
Коментарі до оцінок, паролі, cookie, JWT і внутрішні шляхи файлів до журналу
не потрапляють.

**Структура запису:**

```typescript
interface AuditLogEntry {
  id: string;
  eventId: string;
  timestamp: Date;
  userId: string | null;
  userLogin: string;
  userRole: Role;
  action: string; // 'login', 'grade.create', 'schedule.delete', 'survey.publish'...
  targetEntity?: string;
  targetId?: string;
  details?: Record<string, unknown>;
  ipAddress: string;
  userAgent: string;
  result: "success" | "failure";
  requestId?: string;
}
```

---

### 4.10 ReportsModule

**Файли:** `src/reports/`

**Відповідальність:** формування управлінської аналітики успішності та
відвідуваності без передачі персональних даних студентів у браузер.

**Доступ і область даних:**

- `department_head` бачить лише дисципліни кафедр, де він призначений
  керівником;
- `dean` бачить лише кафедри факультетів, де він призначений деканом;
- `rector`, `president` і `admin` мають загальний академічний scope кампусу;
- `student` і `teacher` не мають доступу до модуля;
- ідентифікатори кафедри, групи або призначення дисципліни перевіряються
  повторно на backend; фільтр поза дозволеним scope завершується `403`.

**Метрики:**

- середній бал і кількість лише активних оцінок; відкликані оцінки
  виключаються;
- кількість занять і записів відвідування з електронного журналу;
- відвідуваність розраховується як
  `(present + late) / (present + late + absent) × 100`;
- `excused` показується окремо та не зменшує відсоток відвідуваності;
- тренд автоматично групується за днем, тижнем або місяцем залежно від
  тривалості вибраного періоду;
- зріз за дисциплінами повертається з серверною пагінацією.

**Безпека й продуктивність:**

- API повертає лише агрегати, назви академічних сутностей і технічні
  ідентифікатори призначень; ПІБ, логіни, email та інші дані студентів у
  відповіді відсутні;
- останній доступний навчальний рік обирається за замовчуванням, щоб не
  виконувати необмежену агрегацію всієї історії;
- довільний календарний період задається лише повною парою `from/to` і
  обмежений 366 днями;
- `ReportsService` є тонким orchestration facade; академічний scope,
  MongoDB-аналітика, складання export і форматування документів розділені між
  окремими сервісами;
- overview/KPI і paginated course breakdown виконуються незалежно: перехід
  між сторінками дисциплін більше не перераховує student count, KPI та тренди;
- одночасні overview/course запити з однаковим користувачем і фільтрами
  об'єднують лише in-flight scope lookup; довготривалий authorization cache не
  використовується, тому зміни повноважень не залишають stale-доступ;
- MongoDB aggregation pipelines і scope/count queries мають `maxTimeMS`,
  roster count підтримується складеним індексом
  `role + status + studentProfile.group`, а endpoint-и захищені окремими rate
  limits;
- синхронний export обмежений 5000 призначеннями дисциплін; більша вибірка
  відхиляється з `413` і потребує звуження фільтрів замість неконтрольованого
  використання пам'яті;
- CSV/XLSX використовують спільну інфраструктуру `common/export`:
  типізований artifact, безпечне ім'я файлу, єдині MIME/security headers,
  UTF-8 BOM, Excel-сумісний CSV і нейтралізацію spreadsheet formulas;
- export-відповіді мають `Cache-Control: private, no-store`, `Pragma:
  no-cache`, `Vary: Cookie, Authorization` і `X-Content-Type-Options:
  nosniff`;
- перегляд та експорт фіксуються в audit outbox як `report.view` і
  `report.export`; до аудиту потрапляють лише scope та безпечні фільтри.

**Ендпоінти:**

| Метод | Шлях | Доступ | Опис |
|---|---|---|---|
| GET | `/reports/overview` | department_head, dean, rector, president, admin | KPI, тренди, scope та безпечні filter options |
| GET | `/reports/courses?page=1&limit=10` | department_head, dean, rector, president, admin | Окремий paginated агрегований зріз за дисциплінами |
| GET | `/reports/export?format=csv\|xlsx&locale=uk\|en` | department_head, dean, rector, president, admin | Повний агрегований експорт поточної вибірки |

MongoDB E2E quality gate:
`npm run test:e2e:db -- reports.e2e-spec.ts`.

### 4.11 FilesModule

**Файли:** `src/files/`

**Поточний стан:** авторизоване завантаження й завантаження файлів із
перевіркою ownership/scope, випадковими storage names, обмеженням розміру та
allow-list розширень, declared MIME, сигнатури вмісту файла, базовою
container validation для ZIP/DOCX та безпечнішою нормалізацією оригінальної
назви. Файли зберігаються на приватному локальному volume і віддаються через
контрольований backend endpoint.

**Production gap:** базова magic-byte/container validation уже реалізована.
Перед production ще потрібні quarantine, antivirus scanning і private object
storage із контрольованою видачею файлів.

### 4.12 DatabaseMigrationsModule

**Файли:** `src/database-migrations/`

Автоматичні MongoDB migrations використовують версійний ledger, checksum,
distributed lock, heartbeat і fail-closed перевірку невідомих або змінених
migrations. У production `DB_MIGRATIONS_ENABLED=true` є обов'язковим.

### 4.13 MaupStudentApiModule

**Файли:** `src/integrations/maup-student-api/`

Підготовлено backend-only клієнт студентського API: Basic credentials не
передаються у browser, доступні timeout, обмежені retry, circuit breaker, ліміт
відповіді, нормалізація зовнішніх помилок і безпечний mapper без копіювання ІПН
та фінансових полів до профільної моделі.

Модуль залишається вимкненим за замовчуванням і не виконує зовнішніх запитів,
доки `MAUP_API_ENABLED=false`. Коли інтеграція ввімкнена, студентський
`/schedule/my` і schedule export можуть читати розклад із MAUP API за
`studentProfile.externalStudentId`; якщо він ще не прив'язаний, сервер
використовує `recordBookNumber` як `nsb` fallback, що підтримано офіційною
специфікацією API. URL та credentials не зберігаються в репозиторії. Умови
активації описані в
[`docs/integrations/maup-student-api.md`](docs/integrations/maup-student-api.md).

---

## 5. Компоненти фронтенду

### 5.1 Загальна структура

```
src/
├── App.tsx                  ← lazy routes, role guards, route error boundaries
├── main.tsx
├── index.css                ← Tailwind base styles
├── i18n.ts                  ← українська та англійська локалізація
├── types/index.ts           ← спільні frontend domain types
├── schemas/
│   └── authSchema.ts        ← Zod-схеми форм аутентифікації
├── services/
│   ├── api.ts               ← Axios instance, cookie session refresh/retry
│   ├── notificationsApi.ts
│   ├── surveysApi.ts
│   ├── electivesApi.ts
│   └── referencesApi.ts
├── store/
│   └── authStore.ts         ← Zustand: user, session state, login/logout
├── components/
│   ├── Layout.tsx           ← sidebar + header + role-based nav
│   ├── ProtectedRoute.tsx   ← route guard
│   ├── ErrorBoundary.tsx
│   ├── RouteErrorBoundary.tsx
│   ├── FileUploader.tsx
│   ├── CreateUserModal.tsx
│   ├── LanguageSwitcher.tsx
│   ├── dashboard/
│   ├── notifications/
│   └── references/
└── pages/                   ← role-based pages architecture
    ├── auth/                ← authentication pages
    │   ├── LoginPage.tsx
    │   └── ForgotPasswordPage.tsx
    ├── shared/              ← pages shared між декількома ролями
    │   ├── DashboardPage.tsx
    │   ├── SchedulePage.tsx
    │   ├── NotificationsPage.tsx
    │   ├── ProfilePage.tsx
    │   └── ReferencesPage.tsx
    ├── student/             ← student-specific pages
    │   ├── AssignmentsPage.tsx
    │   └── GradesPage.tsx
    ├── surveys/             ← SurveysModule frontend
    │   ├── SurveysPage.tsx
    │   ├── SurveyPlayerPage.tsx
    │   ├── SurveyAdminPage.tsx
    │   └── SurveyResultsPage.tsx
    ├── electives/           ← elective selection and administration
    │   ├── ElectivesPage.tsx
    │   └── ElectiveAdminPage.tsx
    ├── admin/               ← system administration pages
    │   ├── UsersPage.tsx
    │   └── AuditLogPage.tsx
    └── course/              ← course-related shared modules
        ├── CoursesPage.tsx
        └── CourseDetailPage.tsx
```

---

### 5.2 Layout — видимість меню за роллю

| Пункт | student | teacher | dept_head | dean | rector | president | admin |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Профіль, дашборд, сповіщення | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Розклад | read | read | scoped read | scoped read | read | read | read/write |
| Дисципліни | scoped | scoped | scoped | scoped | — | — | global read |
| Опитування | participate | participate | — | manage own | results | results | manage |
| Вибіркові дисципліни | select | — | manage scoped | manage | — | — | manage |
| Аналітичні звіти | — | — | scoped | scoped | global | global | global |
| Користувачі | — | — | scoped search | scoped search | global read-only | global read-only | manage |
| Аудит | — | — | — | — | — | — | read/export |
| Довідники | scoped read | scoped read | scoped read | scoped read | read | read | manage |

Повна нормативна матриця з object-level правилами наведена в
`docs/RBAC_MATRIX.md`.

---

### 5.3 Сторінки опитувань

#### SurveysPage _(student, teacher)_

- Список активних опитувань для поточного користувача
- Відображення: назва, дедлайн, кількість питань, статус "пройдено / ще ні"
- Кнопка "Пройти" для непройдених

#### SurveyPlayerPage

- Покрокове або все-на-одній-сторінці проходження
- Типи питань: single-choice (radio), multiple-choice (checkbox), text (textarea), rating (зірки / число)
- Прогрес-бар
- Підтвердження перед відправкою
- Після здачі — стан подяки та перегляд збережених відповідей для неанонімних опитувань

#### SurveyAdminPage _(admin, dean; rector/president — read-only)_

- Таблиця всіх опитувань з фільтром по статусу
- Форма створення: назва, опис, цільова аудиторія, анонімність, терміни
- Конструктор питань: керування порядком, додати/видалити питання, вибір типу
- Кнопки: Зберегти чернетку / Опублікувати / Закрити

#### SurveyResultsPage _(admin, dean-автор, rector, president)_

- Загальна статистика: кількість проходжень, збережених відповідей і питань
- По кожному питанню:
  - single/multiple_choice: горизонтальна гістограма з кількістю та відсотком
  - rating: середнє значення + розподіл
  - text: список відповідей із пагінацією
- Для активного опитування показуються живі результати без кнопок експорту
- Після закриття доступні кнопки "Експорт CSV" і "Експорт XLSX"

---

### 5.4 ReportsPage _(department_head, dean, rector, president, admin)_

- KPI успішності, відвідуваності, кількості студентів і заповнених занять
- фільтри за навчальним роком, семестром, кафедрою, групою, дисципліною та
  календарним періодом
- адаптивні графіки динаміки й структура статусів відвідування
- desktop-таблиця та mobile-картки зі зрізом за дисциплінами
- незалежна серверна пагінація дисциплін без повторного розрахунку KPI/трендів
- двомовний CSV/XLSX export через спільний frontend download helper
- стан без даних, помилки, progressive loading і збереження попереднього
  результату під час оновлення фільтрів

---

## 6. Модель даних

### 6.1 Власна БД кампусу

```
User
├── id, login, passwordHash, passwordResetTokenHash, passwordResetTokenExpiresAt
├── role, email, phone
├── firstName, lastName, middleName
├── avatarUrl, status: active|blocked, createdAt
│
├── StudentProfile
│   └── userId, groupId, recordBookNumber, year
│
└── TeacherProfile
    └── userId, departmentId, position

Group
└── id, code, specialty, course, curatorTeacherId

Faculty
└── id, name, deanUserId

Department
└── id, name, facultyId, headUserId

Course
└── id, name, code, departmentId, semester, credits

CourseAssignment
└── id, courseId, groupId, teacherId, academicYear, semester

Classroom
└── id, building, roomNumber, capacity, type: lecture|lab|seminar|online

ScheduleEntry
└── id, courseAssignmentId, classroomId, date, startTime, endTime
    type: lecture|seminar|lab|exam|consultation
    status: scheduled|cancelled|rescheduled|substituted
    onlineUrl?, changeReason?, changedBy?, cancelledAt?, rescheduledAt?, substitutedAt?
    changeHistory[]

ScheduleTemplate
└── id, title, courseAssignmentId, classroomId?, dayOfWeek, startTime, endTime
    type: lecture|seminar|lab|exam|consultation
    onlineUrl?, status: active|archived

Material
└── id, courseAssignmentId, title, description, category
    files[], resourceLinks[], publishDate

Assignment
└── id, courseAssignmentId, title, description, criteria
    files[], resourceLinks[], dueDate, maxScore

Submission
└── id, assignmentId, studentId, submittedAt, fileLink
    score, comment, status: submitted|graded|returned

Grade
└── id, studentId, courseAssignmentId, date
    lessonJournalEntryId?, type: current|module|exam|final, value, comment

LessonJournalEntry
└── id, courseAssignmentId, scheduleEntryId?, teacherId, date
    startTime?, endTime?, type, topic, description
    attendance[{ studentId, status: present|absent|late|excused, comment }]
    grades are stored as Grade records linked by lessonJournalEntryId

Survey
└── id, title, description, createdByUserId
    targetAudience: all_students|all_teachers|students_teachers|group|course
    targetGroupIds[], targetCourseIds[]
    status: draft|active|closed
    isAnonymous, startDate, endDate, createdAt

SurveyQuestion
└── id, surveyId, order, text
    type: single_choice|multiple_choice|text|rating
    required, options: [{id, text}], ratingMax

SurveyResponse
└── id, surveyId, userId (null if anonymous), submittedAt
    answers: [{questionId, value: string|string[]}]

SurveyCompletion             ← окремо від response, для анонімних
└── id, surveyId, userId, completedAt

Notification
└── id, userId, type, title, message, createdAt, readFlag

AuditLogEntry
└── id, timestamp, userId, userLogin, userRole, action
    targetEntity, targetId, details, ipAddress, userAgent, result
```

---

## 7. API — повний опис ендпоінтів

Всі ендпоінти доступні за префіксом `/api`. Всі захищені JwtAuthGuard, крім `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout` та password reset ендпоінтів.

### Аутентифікація `/api/auth`

| Метод | Шлях                           | Тіло                           | Відповідь                                            | Доступ        |
| ----- | ------------------------------ | ------------------------------ | ---------------------------------------------------- | ------------- |
| POST  | `/auth/login`                  | `{ login, password }`          | `{ user }` + `HttpOnly` auth cookies                 | Публічний     |
| POST  | `/auth/refresh`                | cookie або legacy `{ refreshToken }` | `{ success: true }` + оновлені cookies        | Публічний     |
| POST  | `/auth/password-reset/request` | `{ identifier }`               | `{ message }` + dev reset URL тільки поза production | Публічний     |
| POST  | `/auth/password-reset/confirm` | `{ token, newPassword }`       | `{ message }`                                        | Публічний     |
| GET   | `/auth/profile`                | —                              | User з профілями                                     | Авторизований |
| POST  | `/auth/change-password`        | `{ oldPassword, newPassword }` | 200                                                  | Авторизований |
| POST  | `/auth/logout`                 | cookie або legacy `{ refreshToken }` | `{ message }` + очищення cookies              | Публічний     |

### Користувачі `/api/users`

| Метод | Шлях                       | Доступ                         |
| ----- | -------------------------- | ------------------------------ |
| GET   | `/users?page=&limit=&role=&search=` | admin, rector, president; paginated read-only для rector/president |
| GET   | `/users/search?q=&role=`   | admin, rector, president, dean, department_head |
| GET   | `/users/:id`               | admin, rector, president, dean |
| POST  | `/users`                   | admin                          |
| PATCH | `/users/:id`               | admin                          |
| PATCH | `/users/:id/block`         | admin                          |
| PATCH | `/users/:id/role`          | admin                          |
| GET   | `/users/group/:groupId`    | teacher+                       |
| GET   | `/users/department/:depId` | department_head+               |

### Розклад `/api/schedule`

| Метод  | Шлях                                                              | Доступ                                               |
| ------ | ----------------------------------------------------------------- | ---------------------------------------------------- |
| GET    | `/schedule?date=&startDate=&endDate=&groupId=&teacherId=&status=` | авторизовані; scoped visibility                      |
| GET    | `/schedule/my`                                                    | авторизовані; scoped visibility                      |
| GET    | `/schedule/export?format=csv\|xlsx&locale=uk\|en`                 | авторизовані; CSV/XLSX у межах scoped visibility     |
| GET    | `/schedule/:id`                                                   | авторизовані; object-level authorization             |
| POST   | `/schedule`                                                       | admin                                                |
| PUT    | `/schedule/:id`                                                   | admin                                                |
| POST   | `/schedule/:id/cancel`                                            | admin; причина скасування                            |
| POST   | `/schedule/:id/reschedule`                                        | admin; новий слот + причина                          |
| POST   | `/schedule/:id/substitution`                                      | admin; заміна + причина                              |
| POST   | `/schedule/bulk`                                                  | admin; масове створення                              |
| POST   | `/schedule/bulk/cancel`                                           | admin; масове скасування                             |
| GET    | `/schedule/templates`                                             | admin                                                |
| POST   | `/schedule/templates`                                             | admin                                                |
| PUT    | `/schedule/templates/:id`                                         | admin                                                |
| DELETE | `/schedule/templates/:id`                                         | admin; архівація                                     |
| POST   | `/schedule/templates/:id/apply`                                   | admin; застосування шаблону                          |
| DELETE | `/schedule/:id`                                                   | admin                                                |

Стани `scheduled`, `cancelled`, `rescheduled` і `substituted` зберігаються в
MongoDB разом із причиною, actor-метаданими, HTTPS-посиланням `onlineUrl` для
онлайн-пари та останніми 50 записами історії змін. Спеціалізовані workflow
endpoints є основним шляхом для адміністративних операцій, а `PUT /schedule/:id`
використовується для звичайного редагування.

### Курси та навчання `/api/courses`

| Метод | Шлях                              | Доступ        |
| ----- | --------------------------------- | ------------- |
| GET   | `/courses/my`                     | Авторизований |
| GET   | `/courses/course-assignments/:id` | Авторизований |
| GET   | `/courses/course-assignments/:id/students` | teacher+ |
| GET   | `/courses/:caId/materials`        | Авторизований |
| POST  | `/courses/:caId/materials`        | teacher+      |
| GET   | `/courses/:caId/assignments`      | legacy/internal |
| POST  | `/courses/:caId/assignments`      | legacy/internal teacher+ |
| GET   | `/courses/:caId/journal`          | teacher+      |
| POST  | `/courses/:caId/journal`          | teacher+      |
| PATCH | `/courses/journal/:id`            | teacher+      |
| DELETE | `/courses/journal/:id`           | teacher+      |
| GET   | `/courses/assignments/my`         | legacy/internal; student UI redirects to Moodle |
| GET   | `/courses/assignments/:id/submissions` | legacy/internal teacher+ |
| POST  | `/courses/assignments/:id/submit` | legacy/internal student |
| DELETE | `/courses/assignments/:id/submit` | legacy/internal student |
| GET   | `/courses/grades/my`              | legacy/internal; student UI redirects to Moodle |
| PATCH | `/courses/submissions/:id/return` | legacy/internal teacher+ |
| POST  | `/courses/submissions/:id/grade`  | legacy/internal teacher |

### Опитування `/api/surveys`

| Метод  | Шлях                          | Доступ                          |
| ------ | ----------------------------- | ------------------------------- |
| POST   | `/surveys`                    | admin, dean                     |
| GET    | `/surveys`                    | admin, dean (власні), rector/president read-only |
| GET    | `/surveys/active`             | student, teacher                |
| GET    | `/surveys/:id`                | Авторизований                   |
| PUT    | `/surveys/:id`                | admin, dean (тільки draft)      |
| PATCH  | `/surveys/:id/publish`        | admin, dean                     |
| PATCH  | `/surveys/:id/close`          | admin, dean (автор)             |
| DELETE | `/surveys/:id`                | admin (тільки draft)            |
| POST   | `/surveys/:id/respond`        | student, teacher                |
| GET    | `/surveys/:id/my-response`    | student, teacher                |
| GET    | `/surveys/:id/results`        | admin, dean (автор), rector, president |
| GET    | `/surveys/:id/results/export?format=csv` | admin, dean (автор), rector, president |
| GET    | `/surveys/:id/results/export?format=xlsx` | admin, dean (автор), rector, president |

### Аналітичні звіти `/api/reports`

| Метод | Шлях | Доступ |
|---|---|---|
| GET | `/reports/overview` | department_head, dean, rector, president, admin |
| GET | `/reports/courses?page=1&limit=10` | department_head, dean, rector, president, admin |
| GET | `/reports/export?format=csv\|xlsx&locale=uk\|en` | department_head, dean, rector, president, admin |

### Сповіщення `/api/notifications`

| Метод | Шлях                          | Доступ        |
| ----- | ----------------------------- | ------------- |
| GET   | `/notifications`              | Авторизований |
| GET   | `/notifications/unread-count` | Авторизований |
| PATCH | `/notifications/:id/read`     | Авторизований |
| PATCH | `/notifications/read-all`     | Авторизований |
| POST  | `/notifications/broadcast`    | admin         |

### Новини `/api/news`

| Метод | Шлях               | Доступ        |
| ----- | ------------------ | ------------- |
| GET   | `/news?limit=1..20` | Авторизований |

### Довідники `/api/references`

| Метод           | Шлях                      | Доступ        |
| --------------- | ------------------------- | ------------- |
| GET             | `/references/groups`      | Авторизований |
| GET             | `/references/classrooms`  | Авторизований |
| GET             | `/references/departments` | Авторизований |
| GET             | `/references/faculties`   | Авторизований |
| GET             | `/references/catalog/:type` | Авторизований, scoped |
| POST/PUT/DELETE | `/references/*`           | admin         |
| GET             | `/references/admin/:type` | admin         |
| GET             | `/references/admin/:type/export` | admin |
| POST            | `/references/admin/:type/import` | admin |

---

## 8. Рольова модель доступу (RBAC)

### Незалежні дозволи ролей

Ролі не успадковують permissions одна від одної. `RolesGuard` приймає лише
прямий збіг явно зазначеної ролі, а `AcademicAccessService` додатково обмежує
дані на рівні користувача, групи, кафедри, факультету або призначення курсу.

### Матриця можливостей

Повна матриця можливостей підтримується в `docs/RBAC_MATRIX.md`. Критичні
інваріанти: лише `admin` змінює користувачів і розклад; `rector` та
`president` не мають операційних mutation permissions, але отримують глобальний
read-only каталог користувачів; управлінські ролі бачать звіти у своєму scope.
Regression tests додатково фіксують активну модель із семи ролей і не
допускають неузгодженого розширення RBAC без явного перегляду політик доступу.

---

## 9. Безпека

### Аутентифікація та токени

- **bcrypt** (cost factor 12) для хешування паролів
- **Access token** — короткоживучий (15 хв), мінімізує вікно компрометації
- **Refresh token** — зберігається тільки в `HttpOnly` cookie, недоступній для JavaScript
- **Cookie flags** — `HttpOnly`, `SameSite=Strict` за замовчуванням, `Secure=true` у production/HTTPS
- **Token rotation** — refresh endpoint перевипускає access/refresh cookies і відкликає використаний refresh token
- **CSRF** — signed double-submit token для unsafe методів (`POST`, `PUT`, `PATCH`, `DELETE`) з прив'язкою до HttpOnly binding cookie

### HTTP-безпека

- **HTTPS** обов'язково в production
- **Helmet** — заголовки: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`
- **CORS** — дозволені тільки домени фронтенду з `CLIENT_URL`, cookies передаються лише з `credentials: true`
- **Rate limiting** — `/auth/login` максимум 10 спроб за 15 хвилин з одного IP, password reset endpoints максимум 5 спроб за 15 хвилин
- **Input validation** — `class-validator` + `ValidationPipe` на всіх DTO
- **Environment validation** — backend завершує запуск до підключення модулів, якщо production secrets, HTTPS origin, cookie flags або MongoDB/replica-set configuration є відсутніми чи небезпечними

### Об'єктна авторизація

- `AcademicAccessService` централізує ABAC-політики для користувачів, курсів, призначень курсів, файлів і розкладу
- студент бачить стандартні дисципліни своєї групи, але вибіркові — лише за наявності у `enrolledStudents`
- викладач бачить власні призначення, завідувач — кафедральні, декан — лише дані факультету, до якого його призначено
- файли, розклад і сповіщення вибіркових дисциплін використовують один і той самий enrollment scope; належність до групи сама по собі не надає доступу
- security regression suite `npm run test:e2e:db -- academic-access.e2e-spec.ts` перевіряє ці правила через реальні HTTP endpoints і MongoDB

### Захист від типових вразливостей

| Вразливість             | Захист                                                   |
| ----------------------- | -------------------------------------------------------- |
| SQL Injection           | Parameterized queries через Mongoose ODM                 |
| XSS                     | `Content-Security-Policy`, React escaping                |
| CSRF                    | `SameSite=Strict` cookie, signed `X-CSRF-Token`, HttpOnly binding cookie, CORS обмеження |
| Brute Force             | Rate limiting на /auth/login та password reset endpoints |
| Path Traversal          | Валідація file paths, заборона `../`                     |
| Sensitive Data Exposure | Пароль ніколи не повертається в API-відповідях           |

---

## 10. Принципи розширюваності

### Нові ролі

1. Додати значення до `Role` enum
2. Додати `ROLE_LABELS` на фронтенді
3. Оновити `Layout.tsx` — пункти меню для нової ролі
4. Додати явні `@Roles()` декоратори на потрібних ендпоінтах
5. Оновити `docs/RBAC_MATRIX.md` і security regression tests

### База даних

- Phase 1: in-memory mock data — завершено як історичний MVP-етап
- Phase 2: MongoDB через Mongoose — завершено для runtime-модулів
- MongoDB запускається як single-node replica set для транзакцій і
  transactional audit outbox
- `server/src/common/mock-data` використовується тільки як fixture-source для контрольованих demo seeders, не як runtime data layer

### Нові типи сповіщень

Додати значення до `NotificationType` union та обробник у `NotificationsService.notify()`.

---

## 11. Фази розробки

### Фаза 1 — Базова платформа

| #   | Компонент                                                | Статус                                      |
| --- | -------------------------------------------------------- | ------------------------------------------- |
| 1   | NestJS + TypeScript ініціалізація                        | ✅ Реалізовано                              |
| 2   | MongoDB domain models і DTO                              | ✅ Реалізовано                              |
| 3   | Demo fixtures для локального seed                        | ✅ Реалізовано; не runtime data layer       |
| 4   | AuthModule (cookies, JWT rotation, CSRF, password reset) | ✅ Реалізовано                              |
| 5   | RBAC Guards та академічна object-level authorization     | ✅ Реалізовано                              |
| 6   | ScheduleModule backend/frontend workflows, conflicts, audit, CSV/XLSX | ✅ Закрито: admin-only UI, cancel/reschedule/substitution, templates, bulk; student `/schedule/my` може читати MAUP API |
| 7   | CoursesModule і викладацько-студентський контур          | ✅ Реалізовано                              |
| 8   | ReferencesModule                                        | ✅ CRUD, admin UI, integrity, import/export |
| 9   | NotificationsModule                                     | ✅ In-app сценарії, SSE і фільтри за датою реалізовано |
| 10  | UsersModule                                             | ✅ Paginated каталог, multi-part пошук, status/role filters, admin mutations, rector/president read-only |
| 11  | NewsModule                                              | ✅ MAUP RSS feed, backend cache/fallback, `/news` UI |
| 12  | React auth flow (Zustand, cookies, interceptors)         | ✅ Реалізовано                              |
| 13  | React layout, lazy routes, RBAC navigation, i18n         | ✅ Реалізовано                              |
| 14  | Role-based frontend pages                               | ✅ 21 page components                       |
| 15  | Docker Compose + MongoDB replica set                    | ✅ Реалізовано                              |

### Фаза 2 — База даних + File Upload + Опитування

| #   | Завдання                                            | Статус       |
| --- | --------------------------------------------------- | ------------ |
| 1   | MongoDB + Mongoose ODM замість runtime mock-даних        | ✅ Реалізовано |
| 2   | Автоматизована стратегія schema migrations               | ✅ Versioned ledger, checksum, distributed lock + heartbeat |
| 3   | FilesModule — завантаження файлів (матеріали, здачі)     | ✅ Реалізовано; додано MIME/signature validation |
| 4   | CRUD усіх довідників через окремий admin UI              | ✅ Реалізовано |
| 5   | **SurveysModule** — backend + frontend, результати/export | ✅ Реалізовано |
| 6   | **ElectiveDisciplinesModule** — повний цикл вибору        | ✅ Реалізовано |
| 7   | Відвідуваність і теми занять у електронному журналі      | ✅ Реалізовано у CoursesModule |

### ElectiveDisciplinesModule — реалізовано

Модуль **вибіркових дисциплін** закриває бізнес-критичний процес вибору дисциплін через кабінет:

- довідник запропонованих вибіркових дисциплін із кафедрою, семестром, кредитами, описом, викладачем і лімітом місць;
- періоди вибору з датами старту/завершення та незворотним lifecycle `draft → active → closed → finalized`;
- вибір студентом дисципліни через кабінет із перевіркою групи, дедлайнів, доступності та ліміту місць;
- фіксація вибору в MongoDB з audit trail і забороною дублювання;
- перегляд результатів для адміністратора, деканату та керівництва;
- захищений структурований експорт результатів у XLSX/CSV зі зведенням, групами та деталізацією вибору кожного студента.

### Фаза 3 — Production hardening

| #   | Завдання                                                   | Статус                                      |
| --- | ---------------------------------------------------------- | ------------------------------------------- |
| 1   | HTTPS, Helmet, CORS, rate limiting, CSRF                    | ✅ Реалізовано                              |
| 2   | CI/CD pipeline (GitHub Actions → VPS)                       | ✅ Реалізовано                              |
| 3   | Email/push/realtime delivery для сповіщень                   | 🟡 SSE реалізовано; email/push та distributed pub/sub далі  |
| 4   | AuditLogModule + transactional outbox                       | ✅ Реалізовано; доменні події розширюються  |
| 5   | Адаптивний дизайн                                           | 🟡 Основні сторінки адаптивні; потрібен QA  |
| 6   | XLSX/CSV export                                             | ✅ Спільна інфраструктура для reports, surveys, electives, references і schedule |
| 7   | i18n (українська + англійська)                              | ✅ Реалізовано                              |
| 8   | Production email delivery для password reset                | ✅ Authenticated SMTP + production env validation           |
| 9   | Antivirus/content scanning і private object storage файлів  | ⏳ Наступний етап                           |
| 10  | Backend-каркас студентського API МАУП                      | ✅ Підготовлено; student schedule read-through підключено за feature flag |

---

## 12. Структура проєкту

```
online_campus/
├── docker-compose.yml
├── README.md
├── .nvmrc                    # Node.js 24.17.0 LTS для локальної розробки та CI
├── .npmrc                    # npm policy: engine-strict, save-exact, lockfile
├── package.json              # root tooling: Husky Git hooks
├── package-lock.json
├── .husky/
│   └── pre-commit            # перевірки перед commit
├── scripts/
│   └── pre-commit.mjs
├── .github/
│   ├── dependabot.yml
│   └── workflows/
│       ├── ci.yml             ← Repository + Server + Client checks
│       └── deploy.yml         ← деплой на VPS після push у master
│
├── server/                    # NestJS Backend
│   ├── Dockerfile
│   ├── .npmrc
│   ├── nest-cli.json
│   ├── package.json
│   ├── package-lock.json
│   ├── tsconfig.json
│   ├── test/                  # e2e smoke + DB-backed specs
│   └── src/
│       ├── main.ts
│       ├── app.module.ts
│       │
│       ├── auth/              # JWT auth, refresh sessions, password change/reset
│       │   ├── dto/
│       │   │   ├── login.dto.ts
│       │   │   ├── refresh.dto.ts
│       │   │   ├── logout.dto.ts
│       │   │   ├── change-password.dto.ts
│       │   │   ├── request-password-reset.dto.ts
│       │   │   └── confirm-password-reset.dto.ts
│       │   ├── auth.module.ts
│       │   ├── auth.controller.ts
│       │   ├── auth.service.ts
│       │   ├── auth.service.spec.ts
│       │   ├── jwt.strategy.ts
│       │   ├── jwt-auth.guard.ts
│       │   └── roles.guard.ts
│       │
│       ├── users/             # users, profiles, role changes, account status
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── users.module.ts
│       │   ├── users.controller.ts
│       │   ├── users.service.ts
│       │   └── users.service.spec.ts
│       │
│       ├── schedule/          # timetable CRUD, conflict checks, export
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── schedule.module.ts
│       │   ├── schedule.controller.ts
│       │   ├── schedule.service.ts
│       │   └── schedule.service.spec.ts
│       │
│       ├── courses/           # courses domain split by bounded submodules
│       │   ├── courses.module.ts
│       │   ├── courses/       # course assignments and student course views
│       │   │   ├── dto/
│       │   │   ├── courses.controller.ts
│       │   │   └── courses.service.ts
│       │   ├── materials/
│       │   │   ├── dto/
│       │   │   ├── materials.controller.ts
│       │   │   └── materials.service.ts
│       │   ├── assignments/
│       │   │   ├── dto/
│       │   │   ├── assignments.controller.ts
│       │   │   └── assignments.service.ts
│       │   ├── submissions/
│       │   │   ├── dto/
│       │   │   ├── submissions.controller.ts
│       │   │   └── submissions.service.ts
│       │   ├── grades/
│       │   │   ├── dto/
│       │   │   ├── grades.controller.ts
│       │   │   └── grades.service.ts
│       │   ├── journal/
│       │   │   ├── dto/
│       │   │   ├── lesson-journal.controller.ts
│       │   │   └── lesson-journal.service.ts
│       │   └── schemas/
│       │
│       ├── surveys/           # survey lifecycle, responses, completions, results
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── surveys.module.ts
│       │   ├── surveys.controller.ts
│       │   ├── surveys.service.ts
│       │   └── surveys.service.spec.ts
│       │
│       ├── elective-disciplines/ # elective catalog, periods, selections, results
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── elective-disciplines.module.ts
│       │   ├── elective-disciplines.controller.ts
│       │   ├── elective-disciplines.service.ts
│       │   └── elective-disciplines.service.spec.ts
│       │
│       ├── references/        # faculties, departments, groups, specialties, classrooms
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── references.module.ts
│       │   ├── references.controller.ts
│       │   ├── references-access.service.ts
│       │   ├── references-admin.service.ts
│       │   ├── references-import.service.ts
│       │   ├── references-export.service.ts
│       │   ├── reference-integrity.service.ts
│       │   ├── reference-integrity.service.spec.ts
│       │   ├── reference-relations.service.ts
│       │   ├── reference-relations.service.spec.ts
│       │   ├── faculties.service.ts
│       │   ├── departments.service.ts
│       │   ├── groups.service.ts
│       │   ├── specialties.service.ts
│       │   └── classrooms.service.ts
│       │
│       ├── notifications/     # user and broadcast notifications
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── notifications.module.ts
│       │   ├── notifications.controller.ts
│       │   └── notifications.service.ts
│       │
│       ├── news/              # MAUP RSS/Atom feed proxy with cache/fallback
│       │   ├── dto/
│       │   ├── news.module.ts
│       │   ├── news.controller.ts
│       │   ├── news.service.ts
│       │   └── news.types.ts
│       │
│       ├── files/             # file upload/download/delete and metadata
│       │   ├── dto/
│       │   ├── file.schema.ts
│       │   ├── files.module.ts
│       │   ├── files.controller.ts
│       │   └── files.service.ts
│       │
│       ├── audit-log/         # transactional outbox, append-only audit, admin listing
│       │   ├── dto/
│       │   ├── schemas/
│       │   ├── audit-actions.ts
│       │   ├── audit-context.ts
│       │   ├── audit-outbox.processor.ts
│       │   ├── audit-log.module.ts
│       │   ├── audit-log.controller.ts
│       │   ├── audit-log.service.ts
│       │   ├── audit-log.service.spec.ts
│       │   ├── audit.interceptor.ts
│       │   ├── transaction.interceptor.ts
│       │   └── transaction-lifecycle.service.ts
│       │
│       ├── reports/           # scoped performance and attendance analytics
│       │   ├── dto/
│       │   ├── reports.types.ts
│       │   ├── reports-query.util.ts
│       │   ├── reports.module.ts
│       │   ├── reports.controller.ts
│       │   ├── reports.service.ts          # orchestration facade
│       │   ├── reports-scope.service.ts    # ABAC scope, filters, roster count
│       │   ├── reports-analytics.service.ts # bounded MongoDB aggregations
│       │   ├── reports-export.service.ts   # shared export artifact integration
│       │   ├── reports-exporter.ts
│       │   ├── reports.service.spec.ts
│       │   ├── reports-scope.service.spec.ts
│       │   ├── reports-analytics.service.spec.ts
│       │   └── reports-exporter.spec.ts
│       │
│       ├── database-migrations/ # versioned MongoDB migrations and distributed lock
│       │   ├── database-migrations.module.ts
│       │   ├── database-migrations.service.ts
│       │   ├── database-migrations.registry.ts
│       │   └── database-migration.types.ts
│       │
│       ├── integrations/
│       │   └── maup-student-api/ # disabled backend-only MAUP API client
│       │       ├── maup-student-api.module.ts
│       │       ├── maup-student-api.client.ts
│       │       ├── maup-student-api.mapper.ts
│       │       ├── maup-student-api.error.ts
│       │       └── maup-student-api.types.ts
│       │
│       ├── seed-data/         # optional demo data seeders for local fixtures
│       │   ├── seed.module.ts
│       │   ├── seed.service.ts
│       │   └── seeders/
│       │
│       ├── config/
│       │   └── environment.validation.ts # fail-fast environment schema
│       │
│       └── common/            # shared access policies, DTOs and infrastructure
│           ├── access/        # centralized academic ABAC
│           ├── dto/
│           ├── export/        # CSV/XLSX DTOs, artifacts, headers and document helpers
│           ├── guards/
│           ├── middleware/
│           ├── swagger/
│           ├── types/
│           ├── utils/
│           ├── validators/
│           └── mock-data/     # seed fixtures only; not used by runtime services
│
└── client/                    # React Frontend
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── vite.config.ts
    └── src/
        ├── main.tsx
        ├── index.css
        ├── App.tsx
        ├── i18n.ts
        ├── types/index.ts
        ├── schemas/
        │   └── authSchema.ts
        ├── services/
        │   ├── api.ts
        │   ├── notificationsApi.ts
        │   ├── newsApi.ts
        │   ├── surveysApi.ts
        │   ├── electivesApi.ts
        │   ├── reportsApi.ts
        │   ├── referencesApi.ts
        │   └── scheduleApi.ts
        ├── store/
        │   └── authStore.ts
        ├── components/
        │   ├── Layout.tsx
        │   ├── ProtectedRoute.tsx
        │   ├── ErrorBoundary.tsx
        │   ├── RouteErrorBoundary.tsx
        │   ├── FileUploader.tsx
        │   ├── CreateUserModal.tsx
        │   ├── LanguageSwitcher.tsx
        │   ├── dashboard/
        │   ├── notifications/
        │   └── references/
        └── pages/
            ├── auth/
            │   ├── LoginPage.tsx
            │   └── ForgotPasswordPage.tsx
            ├── shared/
            │   ├── DashboardPage.tsx
            │   ├── NewsPage.tsx
            │   ├── SchedulePage.tsx
            │   ├── NotificationsPage.tsx
            │   ├── ProfilePage.tsx
            │   ├── ReportsPage.tsx
            │   └── ReferencesPage.tsx
            ├── student/
            │   ├── AssignmentsPage.tsx
            │   └── GradesPage.tsx
            ├── surveys/
            │   ├── SurveysPage.tsx
            │   ├── SurveyPlayerPage.tsx
            │   ├── SurveyAdminPage.tsx
            │   └── SurveyResultsPage.tsx
            ├── electives/
            │   ├── ElectivesPage.tsx
            │   └── ElectiveAdminPage.tsx
            ├── admin/
            │   ├── UsersPage.tsx
            │   └── AuditLogPage.tsx
            └── course/
                ├── CoursesPage.tsx
                └── CourseDetailPage.tsx
```

---

## 13. Запуск та розгортання

### Docker (рекомендовано для розробки)

```bash
docker compose up --build
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3000/api

Для повністю нового локального clone з порожньою MongoDB створіть `.env` з
основного прикладу та увімкніть demo fixtures лише для disposable local DB:

```powershell
Copy-Item .env.example .env
# у локальному .env встановіть SEED_DEMO_DATA=true
docker compose up --build
```

`SEED_DEMO_DATA=true` створює тестових користувачів із розділу
[Тестові дані](#15-тестові-дані). Не вмикайте цей прапорець для shared dev,
staging або production: demo-користувачі мають відомий пароль.

Якщо контейнери вже підняті з порожньою БД і `SEED_DEMO_DATA=false`, login
поверне `401 Unauthorized`, бо в колекції `users` ще немає жодного акаунта.
Для локальної disposable БД можна виконати одноразовий seed без перескладання
контейнерів:

```bash
docker compose exec server npm run seed:demo
```

### Локально

```bash
# один раз після clone / pull
nvm use
npm --version # підтримується npm 11.13.x
npm ci
cd server && npm ci
cd ../client && npm ci

# Термінал 1 — бекенд
cd server && npm run start:dev

# Термінал 2 — фронтенд
cd client && npm run dev
```

Для локального запуску без Docker demo fixtures можна створити після підключення
MongoDB:

```bash
cd server
npm run seed:demo:dev
```

### Змінні середовища (server)

```env
# JWT
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
AUTH_ACCESS_COOKIE_NAME=campus_access_token
AUTH_REFRESH_COOKIE_NAME=campus_refresh_token
AUTH_ACCESS_COOKIE_PATH=/api
AUTH_REFRESH_COOKIE_PATH=/api/auth
AUTH_CSRF_SECRET=your-dedicated-csrf-secret-min-32-chars
AUTH_CSRF_COOKIE_NAME=campus_csrf_token
AUTH_CSRF_COOKIE_PATH=/
AUTH_CSRF_BINDING_COOKIE_NAME=campus_csrf_binding
AUTH_CSRF_BINDING_COOKIE_PATH=/api
AUTH_CSRF_HEADER_NAME=x-csrf-token
AUTH_COOKIE_SAMESITE=strict
AUTH_COOKIE_SECURE=true
PASSWORD_RESET_TTL_MINUTES=30
PASSWORD_RESET_EXPOSE_TOKEN=false
PASSWORD_RESET_EMAIL_ENABLED=true
EMAIL_FROM=campus@example.edu
SMTP_HOST=smtp.example.edu
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=campus
SMTP_PASSWORD=provider-app-password
SMTP_CONNECTION_TIMEOUT_MS=10000

# MAUP student API (backend only; keep disabled until credentials are configured)
MAUP_API_ENABLED=false
MAUP_API_BASE_URL=
MAUP_API_ALLOWED_HOST=
MAUP_API_REQUEST_METHOD=POST
MAUP_API_USERNAME=
MAUP_API_PASSWORD=
MAUP_API_TIMEOUT_MS=10000
MAUP_API_RETRY_ATTEMPTS=2
MAUP_API_CIRCUIT_FAILURE_THRESHOLD=5
MAUP_API_CIRCUIT_RESET_TIMEOUT_MS=30000
MAUP_API_MAX_RESPONSE_BYTES=5000000

# Public MAUP news RSS feed (no credentials)
MAUP_NEWS_FEED_URL=https://maup.com.ua/ua/feed.xml
MAUP_NEWS_FEED_ALLOWED_HOST=maup.com.ua
MAUP_NEWS_FEED_CACHE_TTL_MS=600000
MAUP_NEWS_FEED_TIMEOUT_MS=5000
MAUP_NEWS_FEED_MAX_ITEMS=12
MAUP_NEWS_FEED_MAX_RESPONSE_BYTES=1000000

SWAGGER_ENABLED=false

# MongoDB
MONGO_ROOT_USERNAME=admin
MONGO_ROOT_PASSWORD=your-strong-mongo-root-password
MONGO_DATABASE=campus_db
MONGO_HOST=mongodb
MONGO_PORT=27017
MONGO_REPLICA_SET_NAME=rs0
MONGO_REPLICA_SET_KEY=generate-with-openssl-rand-hex-48
MONGO_RETRY_ATTEMPTS=20
MONGO_RETRY_DELAY_MS=3000
MONGO_SERVER_SELECTION_TIMEOUT_MS=5000

# Versioned MongoDB migrations
DB_MIGRATIONS_ENABLED=true
DB_MIGRATION_LOCK_TTL_MS=300000
DB_MIGRATION_WAIT_TIMEOUT_MS=60000
DB_MIGRATION_POLL_INTERVAL_MS=1000

# Transactional audit outbox
AUDIT_TRANSACTIONAL_OUTBOX=true
AUDIT_OUTBOX_POLL_INTERVAL_MS=500
AUDIT_OUTBOX_LOCK_TIMEOUT_MS=30000
AUDIT_OUTBOX_MAX_ATTEMPTS=10

# Demo fixtures
SEED_DEMO_DATA=false
SEED_DEMO_DATA_IN_PRODUCTION=false

# Production
PORT=3000
NODE_ENV=production
DEPLOYMENT_ENV=production
```

Для dev-сервера без SMTP застосунок може залишатися у production runtime mode,
але повинен мати окремий профіль розгортання:

```env
NODE_ENV=production
DEPLOYMENT_ENV=development
PASSWORD_RESET_EMAIL_ENABLED=false
PASSWORD_RESET_EXPOSE_TOKEN=false
```

У цьому режимі SMTP-змінні не потрібні. Якщо на закритому dev-сервері потрібно
тестувати reset flow без пошти, `PASSWORD_RESET_EXPOSE_TOKEN=true` поверне token
у відповіді API. Для `DEPLOYMENT_ENV=production` це значення завжди заборонене,
а authenticated SMTP залишається обов'язковим.

Demo seeders копіюють fixture-дані з `server/src/common/mock-data` у MongoDB
лише коли `SEED_DEMO_DATA=true`. У production seeders заблоковані за
замовчуванням навіть із цим прапорцем; `SEED_DEMO_DATA_IN_PRODUCTION=true`
дозволено тільки для одноразових demo-баз, бо fixture-користувачі мають відомий
пароль.

Для локального disposable запуску можна тимчасово встановити
`SEED_DEMO_DATA=true` у власному `.env`. Для shared dev/prod залишайте
`SEED_DEMO_DATA=false` і створюйте реальних адміністраторів контрольованою
процедурою.

Поки інтеграція з API МАУП вимкнена, `MAUP_API_*` не потрібно додавати ані до
GitHub Secrets, ані до `.env` на Hetzner. Перед активацією потрібно окремо
перевірити автентифікований контракт, додати передачу змінних у deploy workflow
та безпечно налаштувати URL, allow-listed host і credentials у цільовому
середовищі. Після активації студентський `/schedule/my` і schedule export
читатимуть розклад із MAUP API за `externalStudentId` або `recordBookNumber`
як `nsb` fallback. Реальний endpoint і credentials у репозиторії не
зберігаються.

У локальному `docker-compose.yml` MongoDB доступна backend-контейнеру через
внутрішню Docker network (`mongodb:27017`) і не публікується на host-порт за
замовчуванням. Це прибирає конфлікти з локально встановленою MongoDB або іншими
проєктами, які вже займають `127.0.0.1:27017`.

### Production (VPS)

Поточне розгортання використовує репозиторний `docker-compose.yml`: один
backend-контейнер NestJS, один frontend-контейнер Nginx, MongoDB single-node
replica set та одноразовий `mongodb-init`. Окремого
`docker-compose.prod.yml` у проєкті немає.

Розмір VPS і допустиме навантаження ще не підтверджені benchmark або load test,
тому конфігурацію Hetzner потрібно обирати за результатами вимірювань на
production-like даних. Горизонтальне масштабування backend також потребує
винесення локального file storage у private object storage або інше спільне
сховище. Reverse proxy, TLS, backup/restore і monitoring мають бути частиною
окремого production runbook.

---

## 14. CI/CD

### Поточна схема

```
Developer → git push → GitHub → GitHub Actions
                                    │
                          ┌─────────┴──────────┐
                          ▼                    ▼
                    PR/branch              push master
                    [ci.yml]               [deploy.yml]
             audit + lint + test       git pull → docker compose up
```

### CI workflow (`.github/workflows/ci.yml`)

Запускається на кожен pull request у `master` і на push у `master`.
Workflow має три незалежні jobs: `Repository`, `Server` і `Client`.

```yaml
name: CI

on:
  pull_request:
    branches: [master]
  push:
    branches: [master]

jobs:
  repository:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: package-lock.json
      - run: npm ci --ignore-scripts

  server:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: server
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: server/package-lock.json
      - run: npm ci
      - run: npm audit --audit-level=moderate
      - run: npm run lint:check
      - run: npm run build
      - run: npm test
      - run: npm run test:e2e

  client:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: client
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version-file: .nvmrc
          cache: npm
          cache-dependency-path: client/package-lock.json
      - run: npm ci
      - run: npm audit --audit-level=moderate
      - run: npm run lint:check
      - run: npm run build
```

`npm ci` є обов'язковим для CI та deployment-перевірок: він встановлює залежності строго з `package-lock.json` і падає, якщо `package.json` та lockfile не синхронізовані. Root `package.json` використовується тільки для репозиторних інструментів, зокрема Husky.

Backend `npm run test:e2e` запускає швидкі smoke-перевірки без MongoDB, щоб CI мав детермінований e2e-сигнал. Повний DB-backed набір із Testcontainers запускається окремо командою `npm run test:e2e:db` у `server/` і потребує доступного Docker daemon.

CI окремо запускає `academic-access.e2e-spec.ts`, який блокує регресії
об'єктної авторизації для elective files/schedule/notifications та
факультетської ізоляції декана.

### Deploy workflow (`.github/workflows/deploy.yml`)

Запускається після push у `master`. Workflow підключається до VPS через SSH, виконує `git pull origin master`, записує `.env` із GitHub Secrets і запускає `docker compose up --build -d`.

Deploy workflow передає обов'язкові `MONGO_*`, `JWT_SECRET`, `PORT`,
`CLIENT_URL`, `AUTH_CSRF_SECRET` та optional `AUTH_*`, `AUDIT_*`, SMTP і
database migration settings.
`MONGO_REPLICA_SET_KEY` є обов'язковим і має бути окремим випадковим секретом
для кожного середовища. Порожні optional secrets не записуються в `.env`,
тому застосунок використовує кодові defaults; `AUTH_COOKIE_SECURE` та
`AUDIT_TRANSACTIONAL_OUTBOX` для deploy за замовчуванням записуються як
`true`. `DEPLOYMENT_ENV` за замовчуванням дорівнює `production`; SMTP secrets
вимагаються лише коли `PASSWORD_RESET_EMAIL_ENABLED=true`.

Повна логіка sanitization, required/optional values і defaults підтримується в
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). README навмисно
не дублює workflow, щоб документація не розходилася з кодом розгортання.

### Secrets для GitHub Actions

| Secret | Значення |
| ------ | -------- |
| `SSH_HOST` | IP або домен dev/prod сервера |
| `SSH_USER` | SSH-користувач |
| `SSH_PASSWORD` | пароль SSH-користувача |
| `SSH_PORT` | SSH-порт |
| `MONGO_ROOT_USERNAME` | root user MongoDB |
| `MONGO_ROOT_PASSWORD` | root password MongoDB |
| `MONGO_DATABASE` | назва MongoDB database |
| `MONGO_HOST` | hostname MongoDB у Docker network |
| `MONGO_PORT` | порт MongoDB |
| `MONGO_REPLICA_SET_NAME` | optional; назва replica set (`rs0` за замовчуванням) |
| `MONGO_REPLICA_SET_KEY` | обов'язковий keyfile secret; згенерувати `openssl rand -hex 48` |
| `JWT_SECRET` | секрет для JWT |
| `PORT` | порт backend |
| `CLIENT_URL` | URL frontend для CORS і reset links |
| `DEPLOYMENT_ENV` | `development` для dev-сервера без SMTP; `production` або unset для production |
| `AUTH_ACCESS_COOKIE_NAME` | назва HttpOnly cookie для access token |
| `AUTH_REFRESH_COOKIE_NAME` | назва HttpOnly cookie для refresh token |
| `AUTH_ACCESS_COOKIE_PATH` | path access cookie (`/api` за замовчуванням) |
| `AUTH_REFRESH_COOKIE_PATH` | path refresh cookie (`/api/auth` за замовчуванням) |
| `AUTH_COOKIE_SECURE` | `true` для HTTPS-середовищ, `false` лише для локального HTTP |
| `AUTH_COOKIE_SAMESITE` | політика cookies: `strict` за замовчуванням, `lax`/`none` лише за потреби |
| `AUTH_CSRF_SECRET` | окремий секрет для підпису CSRF token; обов'язковий у production |
| `AUTH_CSRF_COOKIE_NAME` | назва readable cookie з signed CSRF token |
| `AUTH_CSRF_COOKIE_PATH` | path readable CSRF cookie (`/` за замовчуванням) |
| `AUTH_CSRF_BINDING_COOKIE_NAME` | назва HttpOnly binding cookie, до якої прив'язано CSRF token |
| `AUTH_CSRF_BINDING_COOKIE_PATH` | path HttpOnly CSRF binding cookie (`/api` за замовчуванням) |
| `AUTH_CSRF_HEADER_NAME` | header, який frontend надсилає для unsafe методів (`x-csrf-token`) |
| `PASSWORD_RESET_EMAIL_ENABLED` | `false` або unset для dev-сервера без SMTP; у production обов'язково `true` |
| `PASSWORD_RESET_EXPOSE_TOKEN` | optional; `true` лише для закритого dev-сервера, у production заборонено |
| `EMAIL_FROM` | обов'язковий sender, коли SMTP увімкнений |
| `SMTP_HOST` | обов'язковий hostname, коли SMTP увімкнений |
| `SMTP_PORT` | optional; `587` за замовчуванням |
| `SMTP_SECURE` | optional; `true` для SMTPS/465, інакше `false` |
| `SMTP_USER` | обов'язковий у production, коли SMTP увімкнений |
| `SMTP_PASSWORD` | обов'язковий у production, коли SMTP увімкнений |
| `SMTP_CONNECTION_TIMEOUT_MS` | optional; timeout SMTP connection (`10000` за замовчуванням) |
| `AUDIT_TRANSACTIONAL_OUTBOX` | `true` для атомарного доменного запису та аудиту |
| `AUDIT_OUTBOX_POLL_INTERVAL_MS` | optional; інтервал доставки audit-подій |
| `AUDIT_OUTBOX_LOCK_TIMEOUT_MS` | optional; timeout відновлення завислого worker lock |
| `AUDIT_OUTBOX_MAX_ATTEMPTS` | optional; кількість спроб до dead-letter state |
| `DB_MIGRATIONS_ENABLED` | optional; deploy default `true`, у production має залишатися `true` |
| `DB_MIGRATION_LOCK_TTL_MS` | optional; TTL distributed migration lock (`300000` за замовчуванням) |
| `DB_MIGRATION_WAIT_TIMEOUT_MS` | optional; максимальне очікування migration lock (`60000`) |
| `DB_MIGRATION_POLL_INTERVAL_MS` | optional; інтервал перевірки migration lock (`1000`) |
| `SWAGGER_ENABLED` | `true` для dev, `false`/unset у production; Swagger вимкнений у production за замовчуванням |

`SEED_DEMO_DATA` і `SEED_DEMO_DATA_IN_PRODUCTION` не є GitHub Secrets:
workflow завжди записує для них `false`. `MONGODB_URI` також не передається
поточним workflow, який формує підключення з окремих `MONGO_*` значень.
`MAUP_API_*` не налаштовуються до окремого рішення про активацію інтеграції.

`ConfigModule` застосовує централізовану fail-fast схему. Для
`NODE_ENV=production` застосунок не запуститься зі слабкими або placeholder
JWT/CSRF/Mongo secrets, HTTP `CLIENT_URL`, `AUTH_COOKIE_SECURE=false`,
увімкненим Swagger, некоректними cookie paths чи MongoDB без автентифікації та
replica-set configuration. Додатково `DEPLOYMENT_ENV=production` забороняє
reset-token exposure та вимагає authenticated SMTP.

### Правила роботи із залежностями

- Рекомендована відтворювана версія з `.nvmrc`: Node.js `24.17.0` LTS із npm `11.13.0`.
- Підтримуваний діапазон: Node.js `>=24.17.0 <25` і npm `>=11.13.0 <12`; patch-релізи в межах Node.js 24 не блокуються.
- Якщо після `nvm use` npm застарілий, виконайте `npm install -g npm@11.13.0`.
- Для встановлення після `pull`, `rebase` або checkout гілки використовуйте тільки `npm ci` окремо в `server` і `client`.
- `npm install` використовуйте лише коли додаєте, видаляєте або оновлюєте залежність.
- Якщо змінюється `package.json`, у той самий commit має потрапити відповідний `package-lock.json`.
- Не запускайте `npm audit fix --force` без окремого review: він може підняти major versions із breaking changes.
- `.nvmrc` і Docker фіксують перевірений baseline, а `engines` задає підтримуваний безпечний діапазон без блокувального `devEngines`.
- Dependabot щотижня перевіряє залежності в `/`, `/server`, `/client` і GitHub Actions.
- У GitHub Settings для `master` потрібно увімкнути branch protection і зробити checks `Repository`, `Server` та `Client` обов'язковими перед merge.

### Husky hooks

Husky встановлюється з root `package.json` через `prepare` після `npm ci`.

Поточний `pre-commit` hook:

- не дозволяє commit, якщо staged `package.json` без відповідного `package-lock.json`;
- запускає `client` lint для staged змін у `client/src` або frontend config;
- запускає `server` lint у check-mode для staged змін у `server/src`, `server/test` або backend config.

Hook є локальним запобіжником. Обов'язковим джерелом істини залишаються GitHub Actions checks.

### Підготовка VPS

```bash
# 1. Встановити Docker + Docker Compose
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# 2. Створити директорію проєкту
mkdir -p /opt/online_campus && cd /opt/online_campus

# 3. Клонувати репозиторій і налаштувати GitHub Secrets для deploy workflow

# 4. Налаштувати SSL - Nginx + Let's Encrypt (certbot або Traefik)
```

### Альтернатива без VPS

Для швидкого старту або стейджингу:

| Платформа   | Плюси                                                   | Мінуси                        |
| ----------- | ------------------------------------------------------- | ----------------------------- |
| **Railway** | Deploy одним кліком, MongoDB включений, SSL автоматично | Дорожче при зростанні трафіку |
| **Render**  | Безкоштовний tier, простий деплой з Docker              | Cold start на free tier       |
| **Fly.io**  | Близька до production гнучкість, є Kyiv PoP             | Потребує CLI                  |

---

## 15. Тестові дані

### Користувачі (пароль для всіх: `password123`)

| Логін         | Роль               | ПІБ                             |
| ------------- | ------------------ | ------------------------------- |
| `student1`    | Студент            | Петренко Олександр Іванович     |
| `student2`    | Студент            | Коваленко Марія Сергіївна       |
| `teacher1`    | Викладач           | Мельник Віктор Олегович         |
| `teacher2`    | Викладач           | Кравченко Наталія Петрівна      |
| `head1`       | Завідувач кафедри  | Григоренко Петро Васильович     |
| `dean1`       | Декан факультету   | Козлов Михайло Андрійович       |
| `rector`      | Ректор             | Сидоренко Володимир Миколайович |
| `president`   | Президент академії | Головко Юрій Борисович          |
| `admin`       | Адміністратор      | Системний Адмін                 |

### Тестові опитування (mock)

| Назва                            | Статус | Аудиторія    | Анонімно |
| -------------------------------- | ------ | ------------ | -------- |
| "Якість викладання — весна 2026" | active | all_students | так      |
| "Оцінка роботи деканату"         | active | all_students | так      |
| "Побажання щодо розкладу"        | draft  | —            | ні       |

---

_Документ актуальний станом на червень 2026._
