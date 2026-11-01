import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
      PII_ENCRYPTION_KEY: '0'.repeat(63) + '1',
      PII_BLIND_INDEX_KEY: '0'.repeat(63) + '2',
      PPV_TOKEN_SECRET: '0'.repeat(63) + '3',
      S3_ACCESS_KEY_ID: 'x',
      S3_SECRET_ACCESS_KEY: 'x',
      PUBLIC_MEDIA_BASE_URL: 'https://cdn.example.com',
      PAYMENT_WEBHOOK_SECRET: 'webhook-secret-1234',
    },
  },
});
