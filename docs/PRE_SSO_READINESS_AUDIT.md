# Ревізія проєкту перед інтеграціями та SSO

Дата ревізії: 2026-06-19. Джерела: актуалізоване ТЗ `ТЗ Кампус МАУП.docx`, код backend/frontend, конфігурація тестів, Docker і GitHub Actions.

## Підсумок

Проєкт уже вийшов зі стадії MVP: object-level academic scope, HttpOnly auth, CSRF, refresh rotation, transactional audit outbox, розклад, журнал, вибіркові дисципліни й aggregate reports реалізовано значно глибше за початкове ТЗ. Основний ризик перед SSO міститься не в UI входу, а в експлуатаційному контурі: файли, backup/restore, identity mapping, cross-instance realtime та observability.

Поточна оцінка готовності:

| Контур | Стан | Рішення |
| --- | --- | --- |
| Auth/password reset | готово до staging | Додано SMTP-доставку; production startup вимагає SMTP configuration, token не розкривається |
| Users lifecycle | готово | Блокування відкликає refresh sessions і reset token; hard delete навмисно відсутній |
| Schedule | готово, крім approval | Conflicts/workflows/templates/export закрито; немає формального dean approval workflow із FR-45 |
| Courses/journal | готово | Пара відкривається з розкладу безпосередньо на вкладці журналу; schedule query обмежено course assignment |
| Surveys | готово з UX-gap | Lifecycle/results/export є; немає archive та окремої abandonment analytics |
| Electives | готово | Lifecycle/finalization сильні; каталог ведуть admin/dean/department_head без доступу rector/president до мутацій |
| References | готово | Import має dry-run preview, row errors, transaction та export; mutation audit використовує global fallback |
| Notifications | готово для одного instance | Додано authenticated SSE, heartbeat і серверні/UI-фільтри; для horizontal scaling потрібен Redis/NATS pub/sub |
| Audit | готово до compliance review | Append-only/outbox, redaction, domain presets, CSV/XLSX export із лімітом 10k |
| Reports | функціонально готово | Scoped aggregate/export є; snapshots, scheduling і period comparison відсутні |
| Files | production blocker | Local private-by-controller disk, extension/MIME check; немає magic-byte/AV scan/quarantine/object storage |
| Infra | staging-ready | CI, replica set, migrations, readiness endpoint і runbook є; metrics/central alerts не під'єднано |

## Зіставлення з ТЗ

### Auth і RBAC (FR-1—FR-4, NFR-5—NFR-7)

Закрито: login/password, актуальні ролі ТЗ, explicit-role RBAC без неявного успадкування, generic auth errors, change/reset password, HttpOnly cookies, CSRF binding, refresh rotation/revocation, blocked account checks, security audit і throttling. Password reset тепер доставляється через SMTP, а помилки доставки не дають змоги визначити наявність облікового запису.

Перед SSO обов'язково визначити identity contract: `issuer`, immutable external `subject`, verified email, provider, linkedAt, lastSyncAt, source-of-truth та правила unlink/recovery. Не можна використовувати email як єдиний зовнішній ключ: він змінюється і може бути використаний повторно. Також потрібне рішення щодо JIT provisioning або попередньої синхронізації та mapping зовнішніх груп у локальні ролі/scope.

### Users (FR-15, FR-40, FR-47)

CRUD, scoped reads, role transition, пошук і блокування є. Блокування фактично є безпечною деактивацією: воно заборонене для самого себе або останнього active admin, відкликає refresh sessions і password reset. Hard delete перед інтеграцією додавати не рекомендовано через посилальну цілісність та audit retention.

Gap: немає явних полів `identityProvider/externalSubject` і state machine синхронізації. Profile contact fields існують; avatar зберігається як URL без окремого media workflow.

### Schedule (FR-30—FR-35)

Закрито: CRUD, teacher/group/classroom conflicts, bulk create/cancel, templates, cancel/reschedule/substitution, notifications, scoped visibility, CSV/XLSX. Додано server-side `courseAssignmentId` filter і перехід «пара → журнал».

Gap: FR-45 вимагає approve/reject розкладу кафедр деканом. Поточні статуси стосуються окремої пари, але немає version/publication/approval сутностей розкладу. Усі мутації розкладу тепер дозволені тільки адміністратору.

### Courses і journal (FR-11—FR-13, FR-20—FR-25)

Матеріали, завдання, submissions, grades, файли/HTTPS resources, attendance та lesson topics реалізовано з academic object scope. Journal може бути пов'язаний із `ScheduleEntry`.

Gap: FR-25 обіцяє викладачеві export для власної групи/дисципліни, тоді як ReportsModule доступний управлінським ролям, а окремого teacher journal export немає. Це функціональний P1, якщо Moodle не перебирає звітність на себе.

### Surveys

Audience scope, progress/completion, response validation, results та export реалізовано. Delete доступний admin. Не закрито soft archive тестових survey і cohort analytics незавершених проходжень.

### Electives (FR-16, FR-35)

Draft → active → closed → finalized, унікальність вибору, quotas, cancellation, results/export і створення course assignments реалізовано. Окрему роль керування розкладом вилучено; потрібен лише UI preview фіналізації до commit.

### References та інтеграційні imports (FR-41, FR-43)

CRUD, scoped catalog, CSV/XLSX export, safe parser, formula rejection, dry-run preview і row-level errors є. Перед зовнішньою синхронізацією треба додати import batch entity з checksum/source/status та ідемпотентний external key; поточний upsert орієнтовано на ручні файли.

### Notifications (FR-14)

In-app targeting/read/dismiss/admin lifecycle закрито. Додано пошук і фільтри за станом прочитання, типом, важливістю та аудиторією. SSE не передає текст сповіщення, а лише сигнал повторно прочитати scoped API, тому не розширює доступ. Nginx buffering для stream вимкнено.

Обмеження: Subject зберігається в пам'яті процесу. Для одного server container це коректно; перед кількома replicas потрібен спільний event bus. Email/push delivery для звичайних notifications поки відсутній.

### Audit (FR-42, NFR-7)

Transactional outbox, idempotent processor, append-only schema, sensitive-field redaction, request ID і domain audit наявні. Додано domain presets та filtered CSV/XLSX export; export обмежено 10 000 рядків і захищено від spreadsheet formula injection.

До compliance sign-off треба визначити retention, legal hold, доступ аудиторів, off-site immutable archive та alert для outbox backlog. HTTP fallback фіксує всі mutations, але важливим доменам варто поступово надавати стабільні semantic action names.

### Reports (FR-44—FR-47)

Department/faculty/institution scope, privacy-preserving aggregates, pagination та export реалізовано. Відсутні scheduled immutable snapshots, порівняння періодів та approval/session statements із FR-45.

### Files

Є auth, ownership/academic scope, random storage names, size limit, allow-list extension+declared MIME та audit. Це не content inspection: MIME контролює клієнт, а DOCX/ZIP можуть містити небезпечний вміст. До production потрібен ланцюжок quarantine → magic-byte/container validation → antivirus → clean/private object storage → signed або controller-mediated download. Local volume ускладнює replicas і disaster recovery.

### Infra та NFR

CI виконує dependency audit, lint, build, unit/smoke/database e2e. MongoDB replica set потрібен transactional outbox. Versioned migration ledger має checksum, global lock, TTL heartbeat та fail-fast для невідомої або зміненої migration. `/api/health/live` відокремлено від `/api/health/ready`; readiness перевіряє MongoDB. Runbook: `docs/operations/backup-restore.md`.

NFR-1 не містить конкретного N, тому performance acceptance неможливий. До go-live замовник має зафіксувати concurrency, p95 latency, розмір даних, RPO/RTO; потім потрібні k6/artillery scenario та dashboard для latency/error rate/Mongo pool/outbox/SMTP/SSE connections.

Responsive UI візуально використовує breakpoints, але automated browser coverage відсутній. Потрібен Playwright matrix щонайменше 390×844, 768×1024, 1440×900 для login, schedule, course journal, surveys, electives, references та audit export.

## Пріоритет до SSO

1. P0 — antivirus/quarantine + private S3-compatible storage і migration наявних upload metadata.
2. P0 — identity linking model, provider allow-list, account-link/recovery policy та role/scope source-of-truth.
3. P0 — автоматичний off-site backup, quarterly restore drill, metrics/alerts і centralized logs.
4. P1 — schedule publication/dean approval.
5. P1 — distributed realtime event bus, якщо заплановано більш ніж один backend replica.
6. P1 — teacher journal/report export; scheduled report snapshots і period comparison.
7. P1 — Playwright responsive/accessibility smoke suite.
8. P2 — survey archive/abandonment analytics та elective finalization wizard.

## Acceptance gates перед production

- Production boot проходить лише з валідними Mongo, CSRF/JWT, SMTP і migration settings.
- Reset email справді доставлено до test mailbox; SMTP failure створює спостережуваний audit signal.
- Restore drill зі свіжого backup проходить в ізольованому середовищі.
- EICAR та polyglot/mismatched MIME upload блокуються до публікації файла.
- Заблокований або від'єднаний SSO user втрачає refresh sessions і не отримує новий access token.
- Усі integrations використовують immutable external IDs та ідемпотентні batches.
- P95 типових запитів менший за 3 секунди за погодженого N; error rate і outbox backlog мають alerts.
- Mobile/tablet/desktop browser matrix проходить для core pages.
