/** Single source of truth for e2e infrastructure, used by global setup and every test file. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://devtrack:devtrack@localhost:5432/devtrack_test?schema=public';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
