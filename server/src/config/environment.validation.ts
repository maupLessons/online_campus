type Environment = Record<string, unknown>;

const PLACEHOLDER_FRAGMENTS = [
  'change-in-production',
  'your_secure_password',
  'replace-with',
  'campus-secret',
  'campus-csrf-secret',
];

export function validateEnvironment(input: Environment): Environment {
  const env = { ...input };
  const errors: string[] = [];
  const nodeEnv = readEnum(
    env,
    'NODE_ENV',
    ['development', 'test', 'production'],
    'development',
    errors,
  );
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';
  const deploymentEnv = readEnum(
    env,
    'DEPLOYMENT_ENV',
    ['development', 'staging', 'production'],
    isProduction ? 'production' : 'development',
    errors,
  );
  const isProductionDeployment = deploymentEnv === 'production';

  env.NODE_ENV = nodeEnv;
  env.DEPLOYMENT_ENV = deploymentEnv;
  env.PORT = String(readInteger(env, 'PORT', 3000, 1, 65535, errors));
  env.CLIENT_URL = readClientUrl(
    env,
    isProduction ? undefined : 'http://localhost:5173',
    isProduction,
    errors,
  );
  env.SWAGGER_ENABLED = String(
    readBoolean(env, 'SWAGGER_ENABLED', !isProduction, errors),
  );
  env.AUTH_COOKIE_SECURE = String(
    readBoolean(env, 'AUTH_COOKIE_SECURE', isProduction, errors),
  );
  env.PASSWORD_RESET_EXPOSE_TOKEN = String(
    readBoolean(env, 'PASSWORD_RESET_EXPOSE_TOKEN', !isProduction, errors),
  );
  env.PASSWORD_RESET_EMAIL_ENABLED = String(
    readBoolean(
      env,
      'PASSWORD_RESET_EMAIL_ENABLED',
      isProductionDeployment,
      errors,
    ),
  );
  env.SEED_DEMO_DATA = String(
    readBoolean(env, 'SEED_DEMO_DATA', false, errors),
  );
  env.SEED_DEMO_DATA_IN_PRODUCTION = String(
    readBoolean(env, 'SEED_DEMO_DATA_IN_PRODUCTION', false, errors),
  );
  env.AUDIT_TRANSACTIONAL_OUTBOX = String(
    readBoolean(env, 'AUDIT_TRANSACTIONAL_OUTBOX', !isTest, errors),
  );
  env.DB_MIGRATIONS_ENABLED = String(
    readBoolean(env, 'DB_MIGRATIONS_ENABLED', !isTest, errors),
  );

  const jwtSecret = readSecret(
    env,
    'JWT_SECRET',
    isTest ? 'test-jwt-secret-with-sufficient-entropy' : undefined,
    isProduction ? 48 : 16,
    isProduction,
    errors,
  );
  const csrfSecret = readSecret(
    env,
    'AUTH_CSRF_SECRET',
    isTest ? 'test-csrf-secret-with-sufficient-entropy' : jwtSecret,
    isProduction ? 48 : 16,
    isProduction,
    errors,
  );
  env.JWT_SECRET = jwtSecret;
  env.AUTH_CSRF_SECRET = csrfSecret;

  if (isProduction && jwtSecret === csrfSecret) {
    errors.push('AUTH_CSRF_SECRET must differ from JWT_SECRET in production');
  }

  env.JWT_EXPIRES_IN = readDuration(env, 'JWT_EXPIRES_IN', '15m', errors);
  env.JWT_REFRESH_EXPIRES_IN = readDuration(
    env,
    'JWT_REFRESH_EXPIRES_IN',
    '7d',
    errors,
  );
  env.PASSWORD_RESET_TTL_MINUTES = String(
    readInteger(env, 'PASSWORD_RESET_TTL_MINUTES', 30, 5, 1440, errors),
  );
  env.AUTH_COOKIE_SAMESITE = readEnum(
    env,
    'AUTH_COOKIE_SAMESITE',
    ['strict', 'lax'],
    'strict',
    errors,
  );

  setDefaultString(env, 'AUTH_ACCESS_COOKIE_NAME', 'campus_access_token');
  setDefaultString(env, 'AUTH_REFRESH_COOKIE_NAME', 'campus_refresh_token');
  setDefaultString(env, 'AUTH_CSRF_COOKIE_NAME', 'campus_csrf_token');
  setDefaultString(env, 'AUTH_CSRF_BINDING_COOKIE_NAME', 'campus_csrf_binding');
  setDefaultString(env, 'AUTH_CSRF_HEADER_NAME', 'x-csrf-token');
  setCookiePath(env, 'AUTH_ACCESS_COOKIE_PATH', '/api', errors);
  setCookiePath(env, 'AUTH_REFRESH_COOKIE_PATH', '/api/auth', errors);
  setCookiePath(env, 'AUTH_CSRF_COOKIE_PATH', '/', errors);
  setCookiePath(env, 'AUTH_CSRF_BINDING_COOKIE_PATH', '/api', errors);

  if (isProductionDeployment && !isProduction) {
    errors.push(
      'NODE_ENV must be production when DEPLOYMENT_ENV is production',
    );
  }

  if (isProduction) {
    assertProductionBoolean(env, 'SWAGGER_ENABLED', false, errors);
    assertProductionBoolean(env, 'AUTH_COOKIE_SECURE', true, errors);
    assertProductionBoolean(env, 'SEED_DEMO_DATA', false, errors);
    assertProductionBoolean(env, 'SEED_DEMO_DATA_IN_PRODUCTION', false, errors);
    assertProductionBoolean(env, 'DB_MIGRATIONS_ENABLED', true, errors);
  }

  if (isProductionDeployment) {
    assertProductionBoolean(env, 'PASSWORD_RESET_EXPOSE_TOKEN', false, errors);
    assertProductionBoolean(env, 'PASSWORD_RESET_EMAIL_ENABLED', true, errors);
  }

  validateMongoConfiguration(env, isProduction, isTest, errors);
  validateEmailDelivery(env, isProductionDeployment, errors);
  validatePositiveTuning(env, errors);

  if (errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${errors
        .map((error) => `- ${error}`)
        .join('\n')}`,
    );
  }

  return env;
}

function validateEmailDelivery(
  env: Environment,
  isProductionDeployment: boolean,
  errors: string[],
): void {
  const smtpPort = readInteger(env, 'SMTP_PORT', 587, 1, 65535, errors);
  env.SMTP_PORT = String(smtpPort);
  env.SMTP_SECURE = String(
    readBoolean(env, 'SMTP_SECURE', smtpPort === 465, errors),
  );

  if (env.PASSWORD_RESET_EMAIL_ENABLED !== 'true') {
    return;
  }

  requireString(env, 'SMTP_HOST', errors);
  const emailFrom = requireString(env, 'EMAIL_FROM', errors);
  if (emailFrom && !/^\S+@\S+\.\S+$/.test(emailFrom)) {
    errors.push('EMAIL_FROM must be an email address');
  }

  const user = readOptionalString(env, 'SMTP_USER');
  const password = readOptionalString(env, 'SMTP_PASSWORD');
  if (Boolean(user) !== Boolean(password)) {
    errors.push('SMTP_USER and SMTP_PASSWORD must be configured together');
  }
  if (isProductionDeployment && (!user || !password)) {
    errors.push('Authenticated SMTP is required in production');
  }

  env.SMTP_USER = user ?? '';
  env.SMTP_PASSWORD = password ?? '';
}

function validateMongoConfiguration(
  env: Environment,
  isProduction: boolean,
  isTest: boolean,
  errors: string[],
): void {
  const mongoUri = readOptionalString(env, 'MONGODB_URI');
  if (mongoUri) {
    validateMongoUri(env, mongoUri, isProduction, errors);
    env.MONGODB_URI = mongoUri;
    return;
  }

  if (isTest) {
    return;
  }

  requireString(env, 'MONGO_ROOT_USERNAME', errors);
  const mongoPassword = readSecret(
    env,
    'MONGO_ROOT_PASSWORD',
    undefined,
    isProduction ? 16 : 8,
    isProduction,
    errors,
  );
  env.MONGO_ROOT_PASSWORD = mongoPassword;
  requireString(env, 'MONGO_DATABASE', errors);
  requireString(env, 'MONGO_HOST', errors);
  env.MONGO_PORT = String(
    readInteger(env, 'MONGO_PORT', 27017, 1, 65535, errors),
  );

  const transactionalOutbox = env.AUDIT_TRANSACTIONAL_OUTBOX === 'true';
  if (transactionalOutbox) {
    requireString(env, 'MONGO_REPLICA_SET_NAME', errors);
  }

  if (isProduction) {
    readSecret(env, 'MONGO_REPLICA_SET_KEY', undefined, 32, true, errors);
  }
}

function validateMongoUri(
  env: Environment,
  mongoUri: string,
  isProduction: boolean,
  errors: string[],
): void {
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    errors.push('MONGODB_URI must use mongodb:// or mongodb+srv://');
    return;
  }

  try {
    const uri = new URL(mongoUri);
    const databaseName = uri.pathname.replace(/^\/+/, '');

    if (!databaseName) {
      errors.push('MONGODB_URI must include a database name');
    }

    if (isProduction && (!uri.username || !uri.password)) {
      errors.push('MONGODB_URI must include credentials in production');
    }

    if (
      env.AUDIT_TRANSACTIONAL_OUTBOX === 'true' &&
      uri.protocol === 'mongodb:' &&
      !uri.searchParams.get('replicaSet') &&
      !readOptionalString(env, 'MONGO_REPLICA_SET_NAME')
    ) {
      errors.push(
        'MONGODB_URI or MONGO_REPLICA_SET_NAME must configure a replica set when AUDIT_TRANSACTIONAL_OUTBOX is enabled',
      );
    }
  } catch {
    errors.push('MONGODB_URI must be a valid MongoDB connection URI');
  }
}

function validatePositiveTuning(env: Environment, errors: string[]): void {
  const definitions: Array<[string, number, number, number]> = [
    ['MONGO_RETRY_ATTEMPTS', 20, 1, 100],
    ['MONGO_RETRY_DELAY_MS', 3000, 100, 60_000],
    ['MONGO_SERVER_SELECTION_TIMEOUT_MS', 5000, 500, 120_000],
    ['AUDIT_OUTBOX_POLL_INTERVAL_MS', 500, 100, 60_000],
    ['AUDIT_OUTBOX_LOCK_TIMEOUT_MS', 30_000, 1000, 600_000],
    ['AUDIT_OUTBOX_MAX_ATTEMPTS', 10, 1, 100],
    ['DB_MIGRATION_LOCK_TTL_MS', 300_000, 5_000, 3_600_000],
    ['DB_MIGRATION_WAIT_TIMEOUT_MS', 60_000, 1_000, 600_000],
    ['DB_MIGRATION_POLL_INTERVAL_MS', 1_000, 100, 10_000],
    ['SMTP_CONNECTION_TIMEOUT_MS', 10_000, 1_000, 120_000],
  ];

  for (const [key, fallback, min, max] of definitions) {
    env[key] = String(readInteger(env, key, fallback, min, max, errors));
  }
}

function readClientUrl(
  env: Environment,
  fallback: string | undefined,
  isProduction: boolean,
  errors: string[],
): string {
  const value = readOptionalString(env, 'CLIENT_URL') ?? fallback ?? '';

  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash) {
      errors.push('CLIENT_URL must be a clean application origin');
    }
    if (url.pathname !== '/' && url.pathname !== '') {
      errors.push('CLIENT_URL must not contain a path');
    }
    if (isProduction && url.protocol !== 'https:') {
      errors.push('CLIENT_URL must use HTTPS in production');
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push('CLIENT_URL must use HTTP or HTTPS');
    }
    return url.origin;
  } catch {
    errors.push('CLIENT_URL must be a valid absolute URL');
    return value;
  }
}

function readSecret(
  env: Environment,
  key: string,
  fallback: string | undefined,
  minLength: number,
  rejectPlaceholders: boolean,
  errors: string[],
): string {
  const value = readOptionalString(env, key) ?? fallback ?? '';

  if (value.length < minLength) {
    errors.push(`${key} must contain at least ${minLength} characters`);
  }
  if (/[\r\n]/.test(value)) {
    errors.push(`${key} must not contain line breaks`);
  }
  if (
    rejectPlaceholders &&
    PLACEHOLDER_FRAGMENTS.some((fragment) =>
      value.toLowerCase().includes(fragment),
    )
  ) {
    errors.push(`${key} contains a known placeholder value`);
  }

  return value;
}

function readDuration(
  env: Environment,
  key: string,
  fallback: string,
  errors: string[],
): string {
  const value = readOptionalString(env, key) ?? fallback;
  if (!/^[1-9]\d*(ms|s|m|h|d)$/.test(value)) {
    errors.push(`${key} must be a positive duration such as 15m or 7d`);
  }
  return value;
}

function readBoolean(
  env: Environment,
  key: string,
  fallback: boolean,
  errors: string[],
): boolean {
  const value = readOptionalString(env, key);
  if (value === undefined) {
    return fallback;
  }
  if (value === 'true' || value === '1') {
    return true;
  }
  if (value === 'false' || value === '0') {
    return false;
  }

  errors.push(`${key} must be true or false`);
  return fallback;
}

function readInteger(
  env: Environment,
  key: string,
  fallback: number,
  min: number,
  max: number,
  errors: string[],
): number {
  const value = readOptionalString(env, key);
  if (value === undefined) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    errors.push(`${key} must be an integer between ${min} and ${max}`);
    return fallback;
  }
  return parsed;
}

function readEnum<T extends string>(
  env: Environment,
  key: string,
  allowed: readonly T[],
  fallback: T,
  errors: string[],
): T {
  const value = readOptionalString(env, key);
  if (value === undefined) {
    return fallback;
  }
  if (allowed.includes(value as T)) {
    return value as T;
  }

  errors.push(`${key} must be one of: ${allowed.join(', ')}`);
  return fallback;
}

function requireString(
  env: Environment,
  key: string,
  errors: string[],
): string {
  const value = readOptionalString(env, key) ?? '';
  if (!value) {
    errors.push(`${key} is required`);
  }
  env[key] = value;
  return value;
}

function readOptionalString(env: Environment, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (
    typeof raw !== 'string' &&
    typeof raw !== 'number' &&
    typeof raw !== 'boolean'
  ) {
    return undefined;
  }
  const value = String(raw).trim();
  return value || undefined;
}

function setDefaultString(
  env: Environment,
  key: string,
  fallback: string,
): void {
  env[key] = readOptionalString(env, key) ?? fallback;
}

function setCookiePath(
  env: Environment,
  key: string,
  fallback: string,
  errors: string[],
): void {
  const value = readOptionalString(env, key) ?? fallback;
  if (!value.startsWith('/') || value.includes('\\')) {
    errors.push(`${key} must be an absolute cookie path`);
  }
  env[key] = value;
}

function assertProductionBoolean(
  env: Environment,
  key: string,
  expected: boolean,
  errors: string[],
): void {
  if (env[key] !== String(expected)) {
    errors.push(`${key} must be ${expected} in production`);
  }
}
