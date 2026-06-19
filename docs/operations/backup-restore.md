# MongoDB і файли: backup/restore runbook

## Цілі

- Базова ціль: RPO не більше 24 годин, RTO не більше 4 годин.
- Для production з високою активністю рекомендовано managed MongoDB із PITR; цей runbook описує portable dump/restore для поточного Docker deployment.
- Backup вважається успішним лише після пробного відновлення та перевірки `/api/health/ready`.

## Що резервувати

1. MongoDB database з `MONGO_DATABASE`.
2. `server/uploads` до переходу на private object storage.
3. Production `.env` і GitHub secrets — в окремому secret manager, а не в backup-архіві застосунку.

## Створення backup

Запускати на production host із `/opt/online_campus` під окремим системним користувачем. Каталог призначення має бути на зашифрованому диску поза project checkout.

```bash
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "/var/backups/online-campus/$timestamp"

docker compose exec -T mongodb sh -lc \
  'mongodump --host localhost --port 27017 --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --db "$MONGO_INITDB_DATABASE" --archive --gzip' \
  > "/var/backups/online-campus/$timestamp/mongodb.archive.gz"

tar -C /opt/online_campus/server -czf \
  "/var/backups/online-campus/$timestamp/uploads.tar.gz" uploads

sha256sum "/var/backups/online-campus/$timestamp/"* \
  > "/var/backups/online-campus/$timestamp/SHA256SUMS"
```

Після створення архіви треба копіювати до private off-site storage з encryption-at-rest та object lock. Рекомендована ротація: 7 daily, 5 weekly, 12 monthly.

## Перевірка відновлення

Не перевіряти restore поверх production. Відновлювати в окрему тимчасову БД або середовище:

```bash
sha256sum -c SHA256SUMS

docker compose exec -T mongodb sh -lc \
  'mongorestore --host localhost --port 27017 --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --archive --gzip --nsFrom="campus_db.*" --nsTo="campus_restore_validation.*"' \
  < mongodb.archive.gz
```

Перевірити кількість документів у ключових колекціях (`users`, `courseassignments`, `scheduleentries`, `auditlogs`) та відсутність помилок MongoDB. Після перевірки видалити лише тимчасову БД.

## Аварійне відновлення

1. Оголосити maintenance window та зупинити `client`/`server`, залишивши MongoDB запущеною.
2. Перевірити checksum і дату backup.
3. Зробити аварійний dump поточного стану, якщо MongoDB доступна.
4. Виконати `mongorestore --drop --archive --gzip` у цільову БД.
5. Відновити `uploads` зі збереженням власника та прав контейнера.
6. Запустити server; автоматичні versioned migrations мають завершитися до readiness.
7. Перевірити `/api/health/ready`, вхід тестового адміністратора, розклад, завантаження файла й audit outbox.
8. Зафіксувати incident ID, backup timestamp, фактичні RPO/RTO та результати smoke-перевірок.

## Обов'язкові alerts

- backup старший за 26 годин;
- checksum/restore drill завершився помилкою;
- `/api/health/ready` повертає не-2xx три перевірки поспіль;
- контейнер server перезапускається частіше ніж 3 рази за 15 хвилин;
- MongoDB disk usage перевищує 80%;
- audit outbox має безперервно зростальну чергу або записи з вичерпаною кількістю спроб;
- SMTP delivery failures наявні в audit log (`auth.password_reset.request`, `details.delivery=failed`).

Restore drill виконувати щонайменше раз на квартал та після зміни MongoDB topology, схеми storage або політики encryption.
