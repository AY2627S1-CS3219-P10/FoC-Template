process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  'postgresql://foc_user:foc_user_test@localhost:5433/foc_user_test?schema=public';
process.env.EMAIL_VERIFICATION_CODE_SECRET =
  'test-email-verification-secret-32-characters';
process.env.JWT_ACCESS_TOKEN_SECRET =
  'test-jwt-access-token-secret-32-characters';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.SMTP_FROM = 'no-reply@example.com';
process.env.SMTP_HOST = 'smtp.example.test';
process.env.SMTP_PASSWORD = 'test-smtp-password';
process.env.SMTP_PORT = '587';
process.env.SMTP_SECURE = 'false';
process.env.SMTP_USER = 'test-smtp-user';
