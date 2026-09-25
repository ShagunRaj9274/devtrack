import { execSync } from 'child_process';
import { TEST_DATABASE_URL } from './test-env';

/**
 * Brings the test database schema up to date before any e2e file runs.
 * Set E2E_SKIP_MIGRATE=1 if you've already migrated the test database yourself.
 */
export default function globalSetup(): void {
  if (process.env.E2E_SKIP_MIGRATE === '1') return;
  execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
