/**
 * Two projects:
 *  - unit: fast, no infrastructure, services tested with mocked Prisma/Redis
 *  - e2e:  boots the real Nest app against PostgreSQL + Redis (see test/setup-e2e.ts)
 * Coverage is collected across both.
 */
const tsJest = ['ts-jest', { tsconfig: 'tsconfig.json' }];

module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/main.ts',
    '!src/**/*.module.ts',
    '!src/**/*.dto.ts',
    '!src/**/dto/*.ts',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'text', 'lcov'],
  // Branch % is lower because TS decorator metadata compiles to ternaries in every controller.
  coverageThreshold: { global: { lines: 90, statements: 90, functions: 90, branches: 70 } },
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/src/**/*.spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
    },
    {
      displayName: 'e2e',
      testEnvironment: 'node',
      rootDir: '.',
      testMatch: ['<rootDir>/test/**/*.e2e-spec.ts'],
      transform: { '^.+\\.ts$': tsJest },
      setupFiles: ['<rootDir>/test/setup-env.ts'],
      globalSetup: '<rootDir>/test/global-setup.ts',
    },
  ],
};
