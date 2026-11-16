import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://automarket:automarket@localhost:5434/automarket_test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-123',
      ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
      LOG_LEVEL: 'error',
    },
  },
});
