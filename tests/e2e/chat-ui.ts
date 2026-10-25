import { object, uuid } from '../../src/shared/account/index.ts';
import { expect } from '@playwright/test';
import type { Page, Response } from '@playwright/test';
export type ChatKind = 'direct' | 'group';
export const history = (page: Page, kind: ChatKind) =>
  page.locator(
    kind === 'group' ? '[data-group-history]' : '[data-message-history]',
  );
export const composer = (page: Page, kind: ChatKind) =>
  page.locator(kind === 'group' ? '[data-group-text]' : '[data-message-text]');
export function messageRow(page: Page, kind: ChatKind, token: string) {
  return history(page, kind)
    .locator('article')
    .filter({ has: page.getByText(token, { exact: true }) });
}
export async function openDirect(page: Page): Promise<void> {
  if (await history(page, 'direct').isVisible()) {
    await expect(composer(page, 'direct')).toBeEnabled();
    return;
  }
  await openDirectory(page);
  // A saved contact can render before the accepted peer finishes loading.
  // Its row opens contact settings; only the accepted peer opens this chat.
  const peer = page.locator('[data-conversation]').filter({
    has: page.getByText(/^0x[a-f0-9]{4}…[a-f0-9]{4}$/iu, { exact: true }),
    hasNotText: 'saved in contacts',
  });
  await expect(peer).toHaveCount(1);
  await peer.click();
  await expect(composer(page, 'direct')).toBeEnabled();
  await expect(history(page, 'direct')).toBeVisible();
}
export async function openGroup(
  page: Page,
  title: string,
  id: string,
): Promise<void> {
  const heading = page.locator('[data-group-title]');
  if (!(await heading.isVisible()) || (await heading.textContent()) !== title) {
    await openDirectory(page);
    await page.locator(`[data-conversation="${uuid(id)}"]`).click();
  }
  await expect(page.locator('[data-group-title]')).toHaveText(title);
  await expect(composer(page, 'group')).toBeEnabled();
  await expect(history(page, 'group')).toBeVisible();
}
export async function sendText(
  page: Page,
  kind: ChatKind,
  text: string,
): Promise<void> {
  const input = composer(page, kind);
  await input.fill(text);
  await input.press('Enter');
  await expect(input).toHaveValue('');
}
export async function delivered(
  page: Page,
  kind: ChatKind,
  token: string,
): Promise<void> {
  await expect(messageRow(page, kind, token)).toHaveCount(1);
  await expect(messageRow(page, kind, token)).toBeVisible();
}
export const publishOperation = (kind: ChatKind) =>
  kind === 'group' ? 'group-message-publish' : 'publish';
export async function acceptedSend(
  page: Page,
  kind: ChatKind,
  text: string,
): Promise<void> {
  const [response] = await Promise.all([
    page.waitForResponse((response) => isTextAcceptance(response, kind)),
    sendText(page, kind, text),
  ]);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ status: 'accepted' });
}

function isTextAcceptance(response: Response, kind: ChatKind): boolean {
  if (!response.url().endsWith(`/${publishOperation(kind)}`) || !response.ok())
    return false;
  const payload = object(
    object(response.request().postDataJSON() as unknown)['payload'],
  );
  return object(payload['packet'])['kind'] === 'text';
}

export async function openContacts(page: Page): Promise<void> {
  const contacts = page.getByRole('link', { name: 'Contacts', exact: true });
  if (!(await contacts.isVisible()))
    await page.getByRole('link', { name: '0xDMme', exact: true }).click();
  await contacts.click();
  await expect(
    page.getByRole('heading', { name: 'Contacts', level: 1, exact: true }),
  ).toBeVisible();
}

async function openDirectory(page: Page): Promise<void> {
  await page.getByRole('link', { name: '0xDMme', exact: true }).click();
  await expect(page.locator('#app-shell')).toHaveAttribute(
    'data-page',
    'conversas',
  );
}
