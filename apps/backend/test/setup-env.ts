import { TEST_DATABASE_URL, TEST_REDIS_URL } from './test-env';

// Never let e2e tests touch the development database.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.REDIS_URL = TEST_REDIS_URL;
process.env.JWT_ACCESS_SECRET = 'e2e-access-secret-that-is-long-enough-123';
process.env.JWT_ACCESS_TTL = '15m';
process.env.CORS_ORIGINS = 'http://localhost:3000';
process.env.AUTH_RATE_LIMIT_PER_MINUTE = '1000';
process.env.RATE_LIMIT_PER_MINUTE = '10000';
