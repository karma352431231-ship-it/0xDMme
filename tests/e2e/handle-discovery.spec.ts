import { randomBytes } from 'node:crypto';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures/accounts.ts';

async function publishProfile(page: Page, handle: string): Promise<void> {
  await page.goto('/settings/profile');
  await page.locator('[data-public-input]').fill(handle);
  await page
    .getByRole('button', { name: 'Create public profile', exact: true })
    .click();
  await expect(page.locator('[data-public-own-handle]')).toHaveText(
    '@' + handle,
  );
}

test('public handle discovery combines suggestions and shows Users ranking', async ({
  accounts,
}) => {
  const { a1, b1 } = accounts;
  const prefix = 'e2e_handle_' + randomBytes(4).toString('hex');
  const handles = [prefix + '_a', prefix + '_b'];
  await publishProfile(a1, handles[0]!);
  await publishProfile(b1, handles[1]!);
  await a1.goto('/communities/feed');
  const [suggestions] = await Promise.all([
    Promise.all(
      [
        '/api/public-profiles/_/suggestions',
        '/api/communities/suggestions',
      ].map((path) =>
        a1.waitForResponse((response) => {
          const url = new URL(response.url());
          return url.pathname === path && url.searchParams.get('q') === prefix;
        }),
      ),
    ),
    a1
      .getByRole('searchbox', {
        name: 'Search posts, users and communities',
        exact: true,
      })
      .fill(prefix),
  ]);
  for (const response of suggestions) expect(response.status()).toBe(200);
  for (const handle of handles)
    await expect(
      a1.getByRole('link', {
        name: '@' + handle + ' Public profile',
        exact: true,
      }),
    ).toBeVisible();

  const [stream] = await Promise.all([
    a1.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/communities/ranking-events',
    ),
    a1.goto('/communities/explore'),
  ]);
  expect(stream.status()).toBe(200);
  expect(await stream.headerValue('content-type')).toBe(
    'text/event-stream; charset=utf-8',
  );
  const content = a1.locator('#page-content');
  const [trending] = await Promise.all([
    a1.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/communities/accounts' &&
        url.searchParams.get('order') === 'trending'
      );
    }),
    content.getByRole('button', { name: 'Users', exact: true }).click(),
  ]);
  expect(trending.status()).toBe(200);
  const [biggest] = await Promise.all([
    a1.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/api/communities/accounts' &&
        url.searchParams.get('order') === 'size'
      );
    }),
    content.getByRole('button', { name: 'Biggest', exact: true }).click(),
  ]);
  expect(biggest.status()).toBe(200);
  for (const handle of handles)
    await expect(
      content.getByRole('link', { name: new RegExp('@' + handle) }),
    ).toBeVisible();
});
