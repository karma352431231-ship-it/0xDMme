import { defineConfig } from '@playwright/test';
if (!process.env['CHAT_E2E_ORIGIN'] || !process.env['CHAT_E2E_REPORT'])
  throw new Error(
    'Use npm run test:chat-e2e so the runner owns the fixture and cleanup.',
  );
const performanceRun = process.env['CHAT_E2E_PERFORMANCE'] === '1';
export default defineConfig({
  testDir: './tests/e2e',
  testMatch: performanceRun ? ['**/*.spec.ts', '**/*.perf.ts'] : '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  globalTimeout: performanceRun ? 3_600_000 : 1_200_000,
  expect: { timeout: 30_000 },
  outputDir: `${process.env['CHAT_E2E_REPORT'] ?? '.local/chat-e2e/unowned'}/failures`,
  reporter: [
    ['list'],
    ['json', { outputFile: `${process.env['CHAT_E2E_REPORT']}/results.json` }],
  ],
  use: {
    baseURL: process.env['CHAT_E2E_ORIGIN'],
    locale: 'en-US',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 15_000,
    trace: performanceRun ? 'off' : 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: ['chromium', 'firefox', 'webkit'].map((browserName) => ({
    name: browserName,
    use: { browserName: browserName as 'chromium' | 'firefox' | 'webkit' },
  })),
});
