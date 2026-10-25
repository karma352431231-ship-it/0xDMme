import { test, expect } from '@playwright/test';
import { BrowserFailures } from './browser-failures.ts';

test('browser failure observer detects native exceptions and stops on disposal', async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error('Owned fixture origin missing.');
  const context = await browser.newContext();
  const failures = new BrowserFailures();
  try {
    await failures.install(context);
    const page = await context.newPage();
    await page.goto(`${baseURL}/health/ready`);
    await Promise.all([
      page.waitForEvent('pageerror'),
      page.evaluate(() => {
        setTimeout(() => {
          throw new Error('Synthetic native error');
        }, 0);
      }),
    ]);
    await Promise.all([
      page.waitForEvent('pageerror'),
      page.evaluate(() => {
        void Promise.reject(new Error('Synthetic native rejection'));
      }),
    ]);
    await expect.poll(() => failures.report().nativeErrors).toBe(1);
    await expect.poll(() => failures.report().nativeRejections).toBe(1);
    expect(failures.errors).toEqual([
      'Unhandled browser error',
      'Unhandled browser rejection',
      'Unexpected browser engine error',
    ]);
    const captured = failures.report();
    failures.stop();
    await Promise.all([
      page.waitForEvent('pageerror'),
      page.evaluate(() => {
        void Promise.reject(new Error('Synthetic error after disposal'));
      }),
    ]);
    expect(failures.report()).toEqual(captured);
  } finally {
    await context.close();
    failures.stop();
  }
});
