import { environmentSchema } from '../../../../src/platform/config/environment.schema.js';

const VALID_ENVIRONMENT = {
  DATABASE_URL:
    'postgresql://foc_user:foc_user_test@localhost:5433/foc_user_test?schema=public',
  EMAIL_VERIFICATION_CODE_SECRET:
    'test-email-verification-secret-32-characters',
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
});
