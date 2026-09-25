/**
 * Fails fast on boot if required configuration is missing or obviously unsafe,
 * instead of crashing later on the first request that needs it.
 */
const REQUIRED = ['DATABASE_URL', 'REDIS_URL', 'JWT_ACCESS_SECRET'] as const;

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const missing = REQUIRED.filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  const secret = String(config.JWT_ACCESS_SECRET);
  if (secret.length < 32) {
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters long');
  }
  if (config.NODE_ENV === 'production' && secret.startsWith('change-me')) {
    throw new Error(
      'JWT_ACCESS_SECRET still has the example value; set a real secret in production',
    );
  }
  return config;
}
