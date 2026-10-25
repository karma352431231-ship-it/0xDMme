import { test as base, expect } from '@playwright/test';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { LoginAdmission } from './login-admission.ts';
import { BrowserFailures } from '../browser-failures.ts';

export async function signIn(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/#settings`);
  await page
    .getByRole('button', { name: 'Connect wallet', exact: true })
    .click();
  await page.locator('[data-wallet-brand="MetaMask"]').click();
  const [enrollment] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/account/devices/commit',
      { timeout: 120_000 },
    ),
    page.locator('[data-wallet="MetaMask"]').click(),
  ]);
  expect(enrollment.ok(), 'Real device enrollment must commit').toBe(true);
  const initial = page.getByRole('dialog', {
    name: 'Initial settings',
    exact: true,
  });
  await expect(initial).toBeVisible();
  await initial.getByRole('button', { name: /^Reserved/ }).click();
  await initial
    .getByRole('button', { name: 'Save and get started', exact: true })
    .click();
  await initial.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(initial).not.toBeVisible();
}
interface Accounts {
  a: BrowserContext;
  b: BrowserContext;
  a1: Page;
  b1: Page;
}
export const test = base.extend<{
  accounts: Accounts;
  loginAdmission: LoginAdmission;
}>({
  loginAdmission: async ({ baseURL }, use) => {
    const directory = process.env['CHAT_E2E_REPORT'];
    if (!directory || !baseURL)
      throw new Error('Owned fixture configuration missing.');
    await use(new LoginAdmission(directory));
  },
  accounts: [
    async ({ browser, baseURL, loginAdmission }, use, info) => {
      if (!baseURL)
        throw new Error(
          'Use npm run test:chat-e2e to own the fixture lifecycle.',
        );
      await info.attach('browser-version', {
        body: JSON.stringify({
          name: browser.browserType().name(),
          version: browser.version(),
        }),
        contentType: 'application/json',
      });
      const contexts: BrowserContext[] = [];
      const failures: BrowserFailures[] = [];
      try {
        await loginAdmission.prepare();
        for (let i = 0; i < 2; i++) {
          const context = await browser.newContext({
            baseURL,
            serviceWorkers: 'block',
            locale: 'en-US',
            viewport: { width: 1440, height: 1000 },
          });
          contexts.push(context);
          const observed = new BrowserFailures();
          failures.push(observed);
          await observed.install(context);
          loginAdmission.attach(context);
          await context.addInitScript(
            (seed) => {
              if (location.protocol === 'http:')
                localStorage.setItem('fixture:wallet', seed);
            },
            `0x${randomBytes(32).toString('hex')}`,
          );
        }
        const a = contexts[0]!,
          b = contexts[1]!;
        const a1 = await a.newPage(),
          b1 = await b.newPage();
        await signIn(a1, baseURL);
        await signIn(b1, baseURL);
        await loginAdmission.completed();
        await use({ a, b, a1, b1 });
        loginAdmission.assertWithinReservation();
        await flushFailureEvents(contexts);
        expect(failures.flatMap((observed) => observed.errors)).toEqual([]);
      } finally {
        try {
          await info.attach('browser-failures', {
            body: JSON.stringify(failures.map((observed) => observed.report())),
            contentType: 'application/json',
          });
          if (info.status !== info.expectedStatus)
            await captureFailure(contexts, info);
        } finally {
          await closeContexts(contexts, failures);
        }
      }
    },
    { timeout: 180_000 },
  ],
});
export { expect };

async function captureFailure(
  contexts: readonly BrowserContext[],
  info: TestInfo,
): Promise<void> {
  for (const [i, context] of contexts.entries())
    for (const [j, page] of context.pages().entries())
      await info.attach(`synthetic-page-${i}-${j}`, {
        body: (await page.locator('body').innerText()).slice(0, 20000),
        contentType: 'text/plain',
      });
}

async function flushFailureEvents(
  contexts: readonly BrowserContext[],
): Promise<void> {
  for (const context of contexts)
    for (const page of context.pages())
      if (!page.isClosed()) await page.evaluate(() => null);
}
async function closeContexts(
  contexts: readonly BrowserContext[],
  failures: readonly BrowserFailures[],
): Promise<void> {
  try {
    const outcomes = await Promise.allSettled(
      contexts.map((context) => context.close()),
    );
    for (const outcome of outcomes)
      if (outcome.status === 'rejected') throw outcome.reason;
  } finally {
    for (const observed of failures) observed.stop();
  }
}
