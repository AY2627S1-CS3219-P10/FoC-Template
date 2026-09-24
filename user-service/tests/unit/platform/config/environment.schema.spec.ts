import { environmentSchema } from '../../../../src/platform/config/environment.schema.js';

const VALID_ENVIRONMENT = {
  DATABASE_URL:
    'postgresql://foc_user:foc_user_test@localhost:5433/foc_user_test?schema=public',
  EMAIL_VERIFICATION_CODE_SECRET:
    'test-email-verification-secret-32-characters',
  FRONTEND_ORIGIN: 'http://localhost:3000',
  JWT_ACCESS_TOKEN_SECRET: 'test-jwt-access-token-secret-32-characters',
  REDIS_URL: 'redis://localhost:6379',
  SMTP_FROM: 'no-reply@example.com',
  SMTP_HOST: 'smtp.example.test',
  SMTP_PASSWORD: 'test-smtp-password',
  SMTP_USER: 'test-smtp-user',
};

describe('environmentSchema', () => {
  it('accepts a PostgreSQL connection string and applies defaults', () => {
    const result = environmentSchema.validate(VALID_ENVIRONMENT);
    const value: unknown = result.value;

    expect(result.error).toBeUndefined();
    expect(value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });

  it('rejects a missing database connection string', () => {
    const { error } = environmentSchema.validate({});

    expect(error?.message).toContain('DATABASE_URL');
  });

  it('rejects a non-PostgreSQL connection string', () => {
    const { error } = environmentSchema.validate({
      ...VALID_ENVIRONMENT,
      DATABASE_URL: 'mysql://user:password@localhost:3306/database',
    });

    expect(error?.message).toContain('DATABASE_URL');
  });

  it('rejects a short email verification code secret', () => {
    const { error } = environmentSchema.validate({
      ...VALID_ENVIRONMENT,
      EMAIL_VERIFICATION_CODE_SECRET: 'too-short',
    });

    expect(error?.message).toContain('EMAIL_VERIFICATION_CODE_SECRET');
  });

  it('rejects a short JWT access-token secret', () => {
    const { error } = environmentSchema.validate({
      ...VALID_ENVIRONMENT,
      JWT_ACCESS_TOKEN_SECRET: 'too-short',
    });

    expect(error?.message).toContain('JWT_ACCESS_TOKEN_SECRET');
  });

  it.each(['*', 'https://example.com/path', 'javascript:alert(1)'])(
    'rejects invalid or non-origin frontend value %s',
    (frontendOrigin) => {
      const { error } = environmentSchema.validate({
        ...VALID_ENVIRONMENT,
        FRONTEND_ORIGIN: frontendOrigin,
      });

      expect(error?.message).toContain('FRONTEND_ORIGIN');
    },
  );

  it('accepts the Gmail STARTTLS configuration on port 587', () => {
    const result = environmentSchema.validate({
      ...VALID_ENVIRONMENT,
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
    const value: unknown = result.value;

    expect(result.error).toBeUndefined();
    expect(value).toMatchObject({
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: 587,
      SMTP_SECURE: false,
    });
  });

  it.each([
    { SMTP_PORT: 465, SMTP_SECURE: false },
    { SMTP_PORT: 587, SMTP_SECURE: true },
  ])('rejects Gmail settings that do not use port 587 STARTTLS', (settings) => {
    const { error } = environmentSchema.validate({
      ...VALID_ENVIRONMENT,
      ...settings,
      SMTP_HOST: 'smtp.gmail.com',
    });

    expect(error?.message).toMatch(/SMTP_(PORT|SECURE)/);
  });
});
