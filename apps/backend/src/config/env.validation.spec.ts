import { validateEnv } from './env.validation';

const valid = {
  DATABASE_URL: 'postgres://x',
  REDIS_URL: 'redis://x',
  JWT_ACCESS_SECRET: 'x'.repeat(32),
};

describe('validateEnv', () => {
  it('accepts a complete config', () => {
    expect(validateEnv(valid)).toBe(valid);
  });

  it('lists every missing variable', () => {
    expect(() => validateEnv({})).toThrow('DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET');
  });

  it('rejects short JWT secrets', () => {
    expect(() => validateEnv({ ...valid, JWT_ACCESS_SECRET: 'short' })).toThrow('at least 32');
  });

  it('refuses the example secret in production but allows it in development', () => {
    const placeholder = {
      ...valid,
      JWT_ACCESS_SECRET: 'change-me-access-secret-at-least-32-chars',
    };
    expect(() => validateEnv({ ...placeholder, NODE_ENV: 'production' })).toThrow('example value');
    expect(validateEnv({ ...placeholder, NODE_ENV: 'development' })).toBeTruthy();
  });
});
