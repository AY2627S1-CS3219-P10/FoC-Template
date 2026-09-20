process.env.NODE_ENV = 'test';
process.env.PORT = '3001';
process.env.DATABASE_URL =
  'postgresql://foc_user:foc_user_test@localhost:5433/foc_user_test?schema=public';
process.env.EMAIL_VERIFICATION_CODE_SECRET =
  'test-email-verification-secret-32-characters';
