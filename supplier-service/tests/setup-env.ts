process.env.NODE_ENV = 'test';
process.env.PORT = '3002';
process.env.DATABASE_URL =
  'postgresql://foc_supplier:foc_supplier_test@localhost:5434/foc_supplier_test?schema=public';
process.env.JWT_ACCESS_TOKEN_SECRET =
  'test-access-token-secret-at-least-32-characters';
process.env.JWT_ISSUER = 'foc-user-service';
process.env.JWT_AUDIENCE = 'foc-api';
