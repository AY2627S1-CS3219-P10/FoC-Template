import { environmentSchema } from '../../../../src/platform/config/environment.schema.js';

describe('environmentSchema', () => {
  it('accepts a PostgreSQL connection string and applies defaults', () => {
    const result = environmentSchema.validate({
      DATABASE_URL:
        'postgresql://foc_user:foc_user_test@localhost:5433/foc_user_test?schema=public',
      EMAIL_VERIFICATION_CODE_SECRET:
        'test-email-verification-secret-32-characters',
    });
    const value: unknown = result.value;

    expect(result.error).toBeUndefined();
    expect(value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3001,
    });
  });

  it('rejects a missing database connection string', () => {
    const { error } = environmentSchema.validate({});

    expect(error?.message).toContain('DATABASE_URL');
  });

  it('rejects a non-PostgreSQL connection string', () => {
    const { error } = environmentSchema.validate({
      DATABASE_URL: 'mysql://user:password@localhost:3306/database',
      EMAIL_VERIFICATION_CODE_SECRET:
        'test-email-verification-secret-32-characters',
    });

    expect(error?.message).toContain('DATABASE_URL');
  });

  it('rejects a short email verification code secret', () => {
    const { error } = environmentSchema.validate({
      DATABASE_URL:
        'postgresql://foc_user:foc_user_test@localhost:5433/foc_user_test?schema=public',
      EMAIL_VERIFICATION_CODE_SECRET: 'too-short',
    });

    expect(error?.message).toContain('EMAIL_VERIFICATION_CODE_SECRET');
  });
});
