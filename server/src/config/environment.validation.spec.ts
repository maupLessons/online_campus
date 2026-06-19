import { validateEnvironment } from './environment.validation';

function productionEnvironment(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    DEPLOYMENT_ENV: 'production',
    PORT: '3000',
    CLIENT_URL: 'https://campus.example.edu',
    JWT_SECRET: 'j'.repeat(64),
    AUTH_CSRF_SECRET: 'c'.repeat(64),
    AUTH_COOKIE_SECURE: 'true',
    AUTH_COOKIE_SAMESITE: 'strict',
    SWAGGER_ENABLED: 'false',
    PASSWORD_RESET_EXPOSE_TOKEN: 'false',
    PASSWORD_RESET_EMAIL_ENABLED: 'true',
    EMAIL_FROM: 'campus@example.edu',
    SMTP_HOST: 'smtp.example.edu',
    SMTP_PORT: '587',
    SMTP_SECURE: 'false',
    SMTP_USER: 'campus',
    SMTP_PASSWORD: 'smtp-app-password',
    MONGO_ROOT_USERNAME: 'campus',
    MONGO_ROOT_PASSWORD: 'm'.repeat(32),
    MONGO_DATABASE: 'campus',
    MONGO_HOST: 'mongodb',
    MONGO_PORT: '27017',
    MONGO_REPLICA_SET_NAME: 'rs0',
    MONGO_REPLICA_SET_KEY: 'r'.repeat(64),
    AUDIT_TRANSACTIONAL_OUTBOX: 'true',
    SEED_DEMO_DATA: 'false',
    SEED_DEMO_DATA_IN_PRODUCTION: 'false',
    DB_MIGRATIONS_ENABLED: 'true',
  };
}

describe('validateEnvironment', () => {
  it('accepts a hardened production configuration', () => {
    const result = validateEnvironment(productionEnvironment());

    expect(result.CLIENT_URL).toBe('https://campus.example.edu');
    expect(result.AUTH_COOKIE_SECURE).toBe('true');
    expect(result.SWAGGER_ENABLED).toBe('false');
  });

  it('rejects insecure production authentication settings', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        CLIENT_URL: 'http://campus.example.edu',
        JWT_SECRET: 'short',
        AUTH_CSRF_SECRET: 'short',
        AUTH_COOKIE_SECURE: 'false',
        SWAGGER_ENABLED: 'true',
        PASSWORD_RESET_EXPOSE_TOKEN: 'true',
      }),
    ).toThrow(/Environment validation failed/);
  });

  it('rejects shared JWT and CSRF secrets in production', () => {
    const sharedSecret = 's'.repeat(64);

    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        JWT_SECRET: sharedSecret,
        AUTH_CSRF_SECRET: sharedSecret,
      }),
    ).toThrow(/AUTH_CSRF_SECRET must differ from JWT_SECRET/);
  });

  it('provides deterministic safe defaults for tests', () => {
    const result = validateEnvironment({
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/campus-test',
    });

    expect(result.JWT_SECRET).toBe('test-jwt-secret-with-sufficient-entropy');
    expect(result.AUTH_COOKIE_SECURE).toBe('false');
    expect(result.PASSWORD_RESET_EXPOSE_TOKEN).toBe('true');
    expect(result.AUDIT_TRANSACTIONAL_OUTBOX).toBe('false');
    expect(result.DB_MIGRATIONS_ENABLED).toBe('false');
    expect(result.PASSWORD_RESET_EMAIL_ENABLED).toBe('false');
  });

  it('requires an authenticated password-reset email transport in production', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        SMTP_HOST: '',
        SMTP_USER: '',
        SMTP_PASSWORD: '',
      }),
    ).toThrow(/SMTP_HOST is required/);
  });

  it('allows a production runtime to disable SMTP on a development deployment', () => {
    const environment = {
      ...productionEnvironment(),
      DEPLOYMENT_ENV: 'development',
      PASSWORD_RESET_EMAIL_ENABLED: 'false',
      PASSWORD_RESET_EXPOSE_TOKEN: 'false',
      EMAIL_FROM: '',
      SMTP_HOST: '',
      SMTP_USER: '',
      SMTP_PASSWORD: '',
    };

    const result = validateEnvironment(environment);

    expect(result.NODE_ENV).toBe('production');
    expect(result.DEPLOYMENT_ENV).toBe('development');
    expect(result.PASSWORD_RESET_EMAIL_ENABLED).toBe('false');
  });

  it('does not allow a production deployment to disable SMTP', () => {
    expect(() =>
      validateEnvironment({
        ...productionEnvironment(),
        PASSWORD_RESET_EMAIL_ENABLED: 'false',
      }),
    ).toThrow(/PASSWORD_RESET_EMAIL_ENABLED must be true in production/);
  });

  it('rejects an unauthenticated standalone MongoDB URI in production', () => {
    const environment = productionEnvironment();
    delete environment.MONGO_ROOT_USERNAME;
    delete environment.MONGO_ROOT_PASSWORD;
    delete environment.MONGO_DATABASE;
    delete environment.MONGO_HOST;
    delete environment.MONGO_PORT;
    environment.MONGODB_URI =
      'mongodb://mongodb:27017/campus?directConnection=true';
    delete environment.MONGO_REPLICA_SET_NAME;

    expect(() => validateEnvironment(environment)).toThrow(
      /MONGODB_URI must include credentials in production/,
    );
    expect(() => validateEnvironment(environment)).toThrow(
      /must configure a replica set/,
    );
  });

  it('accepts an authenticated production MongoDB URI with a replica set', () => {
    const environment = productionEnvironment();
    delete environment.MONGO_ROOT_USERNAME;
    delete environment.MONGO_ROOT_PASSWORD;
    delete environment.MONGO_DATABASE;
    delete environment.MONGO_HOST;
    delete environment.MONGO_PORT;
    delete environment.MONGO_REPLICA_SET_NAME;
    environment.MONGODB_URI =
      'mongodb://campus:strong-password@mongodb:27017/campus?replicaSet=rs0';

    expect(validateEnvironment(environment).MONGODB_URI).toBe(
      environment.MONGODB_URI,
    );
  });
});
