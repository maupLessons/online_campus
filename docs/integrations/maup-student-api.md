# Інтеграція зі студентським API МАУП

## Поточний статус

У сервері підготовлено ізольований клієнт зовнішнього API. Інтеграція вимкнена за замовчуванням. Після ввімкнення `MAUP_API_ENABLED=true` студентський `/schedule/my` і schedule export читають розклад із MAUP API через backend-only read-through і нормалізують відповідь до внутрішнього `ScheduleEntryDto`.

До отримання тестового доступу клієнт не можна вмикати у спільному середовищі. Надана специфікація не визначає однозначний HTTP-метод, тому метод запиту залишається параметром конфігурації.

Для експлуатаційного контролю додано admin-only endpoint `GET /integrations/maup-student-api/diagnostics`. Він повертає тільки feature flag, circuit state, counters і timestamps останнього успіху/помилки. URL, username, password, Basic token або upstream response body не повертаються.

## Безпекові обмеження

- Basic credentials використовуються виключно сервером.
- Клієнтський застосунок не отримує логін, пароль або заголовок `Authorization`.
- Для розкладу сервер використовує `studentProfile.externalStudentId` як `student_id`; якщо він ще не прив'язаний, дозволено fallback на `studentProfile.recordBookNumber` як `nsb`, бо це прямо підтримано контрактом `/schedule`.
- Пошук за ІПН, телефоном, ПІБ або шаблонами не реалізовано.
- Тіло помилки зовнішнього сервісу не потрапляє до повідомлення помилки або діагностики.
- Профільний mapper не копіює ІПН та фінансові поля.
- У production дозволено лише HTTPS та host, заданий захищеною конфігурацією.

## Конфігурація

```dotenv
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
```

Облікові дані потрібно передавати через secret manager або захищені змінні середовища. Їх не можна додавати до `.env.example`, журналів, задач або pull request.

## Підготовлені операції

- загальна інформація студента;
- основний і сесійний розклад — підключено до студентського `/schedule/my` і schedule export через feature flag; вкладену відповідь `/schedule[].schedule[]` зафіксовано contract fixture у `src/integrations/maup-student-api/fixtures/`;
- сальдо та платежі;
- накази;
- оцінки;
- навчальний план;
- календарний графік;
- знижки;
- документовані довідники.

Кожна операція має timeout, обмежені повторні спроби, circuit breaker, обмеження розміру відповіді та нормалізацію кодів помилок `E-01` — `E-99`.

## Умови ввімкнення

Перед увімкненням необхідно:

1. Отримати тестові або read-only credentials через захищений канал.
2. Підтвердити HTTP-метод і формат запиту.
3. Зберегти обезособлені fixtures реальних відповідей.
4. Оновити обезособлені fixtures реальними відповідями тестового API та перевірити contract-тести для всіх потрібних операцій, особливо вкладену структуру `/schedule[].schedule[]`.
5. Погодити джерела істини, правила кешування та строки зберігання.
6. Погодити зв'язок SSO subject із зовнішнім `student_id`.

До виконання цих умов модуль залишається технічно підготовленим, але функціонально не підключеним.
