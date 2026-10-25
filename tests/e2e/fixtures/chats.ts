import { test as accountsTest, expect } from './accounts.ts';
import type { Page } from '@playwright/test';
import { ChatMetrics } from '../chat-metrics.ts';
import { uuid } from '../../../src/shared/account/index.ts';
import { openDirect, openContacts, composer } from '../chat-ui.ts';

export async function requestPrivateConversation(
  a: Page,
  b: Page,
): Promise<void> {
  await openContacts(a);
  await a.getByRole('button', { name: 'My invitation ↗', exact: true }).click();
  await a
    .getByRole('button', { name: 'Create new invitation', exact: true })
    .click();
  const link = a.getByLabel('My invitation link', { exact: true });
  await expect(link).not.toHaveValue('');
  const invitation = await link.inputValue();
  await a
    .getByRole('button', { name: 'Close my invitation', exact: true })
    .click();
  await openContacts(b);
  await b.getByRole('button', { name: 'Add contact', exact: false }).click();
  await b.getByRole('tab', { name: 'By invitation', exact: true }).click();
  await b.getByLabel('Invitation link', { exact: true }).fill(invitation);
  await b
    .getByRole('button', { name: 'Request conversation', exact: true })
    .click();
  await expect(b.locator('[data-contact-editor-status]')).toContainText(
    'Request sent',
  );
  await b.getByRole('button', { name: 'Close form', exact: true }).click();
}
export async function approvePrivateConversation(a: Page): Promise<void> {
  await a.reload();
  await a.getByRole('tab', { name: /^Requests/ }).click();
  await a
    .locator('[data-contact-list="incoming"]')
    .getByRole('button', { name: 'Accept', exact: true })
    .click();
  await expect(a.locator('[data-contact-status]')).toContainText(
    'Contact approved',
  );
}
async function connect(a: Page, b: Page): Promise<void> {
  await requestPrivateConversation(a, b);
  await approvePrivateConversation(a);
  await b.reload();
  await openDirect(a);
  await openDirect(b);
}
async function createGroup(a: Page, b: Page, title: string): Promise<string> {
  const setup = new ChatMetrics();
  const stopA = setup.observeNetwork(a.context());
  const stopB = setup.observeNetwork(b.context());
  try {
    await openContacts(a);
    await groupReady(a, setup);
    await a.getByRole('button', { name: 'Create group', exact: true }).click();
    const dialog = a.getByRole('dialog', {
      name: 'Create private group',
      exact: true,
    });
    await dialog.getByLabel('Group name', { exact: true }).fill(title);
    await groupReady(a, setup);
    await dialog
      .getByRole('button', { name: 'Create group', exact: true })
      .click();
    await expect(a.locator('[data-group-title]')).toHaveText(title);
    await expect(composer(a, 'group')).toBeEnabled();
    const selected = a.locator('[data-conversation][aria-pressed="true"]');
    await expect(selected).toHaveCount(1);
    const groupId = uuid(await selected.getAttribute('data-conversation'));
    await groupReady(a, setup);
    await a
      .getByRole('button', { name: 'Group settings', exact: true })
      .click();
    await a
      .getByRole('dialog', { name: 'Group settings', exact: true })
      .getByRole('button', { name: 'Add', exact: true })
      .click();
    const add = a.getByRole('dialog', {
      name: 'Add participants',
      exact: true,
    });
    await groupReady(a, setup);
    await add
      .getByRole('button', { name: 'Generate / copy link', exact: true })
      .click();
    const link = add.getByLabel('Shareable invitation', { exact: true });
    await expect(link).not.toHaveValue('');
    const invitation = await link.inputValue();
    await add.getByRole('button', { name: 'Close', exact: true }).click();
    await a
      .getByRole('button', { name: 'Close settings', exact: true })
      .click();
    await openContacts(b);
    await groupReady(b, setup);
    await b.getByRole('button', { name: 'Join by link', exact: true }).click();
    const join = b.getByRole('dialog', {
      name: 'Join private group',
      exact: true,
    });
    await join.getByLabel('Invitation link', { exact: true }).fill(invitation);
    await groupReady(b, setup);
    await join.getByRole('button', { name: 'Join group', exact: true }).click();
    await expect(b.locator('[data-group-title]')).toHaveText(title);
    await expect(composer(b, 'group')).toBeEnabled();
    return groupId;
  } finally {
    stopA();
    stopB();
    setup.close();
  }
}
export const test = accountsTest.extend<{
  chats: { group: string; groupId: string };
}>({
  chats: [
    async ({ accounts }, use) => {
      await connect(accounts.a1, accounts.b1);
      const group = 'Synthetic delivery group';
      const groupId = await createGroup(accounts.a1, accounts.b1, group);
      await use({ group, groupId });
    },
    { timeout: 120_000 },
  ],
});
export { expect };

async function groupReady(
  page: Page,
  setup: Pick<ChatMetrics, 'drain'>,
): Promise<void> {
  await setup.drain();
  await expect(page.locator('[data-group-new]')).toBeEnabled();
}
