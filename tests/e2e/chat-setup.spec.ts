import { setTimeout as delay } from 'node:timers/promises';
import { test, expect } from './fixtures/accounts.ts';
import {
  requestPrivateConversation,
  approvePrivateConversation,
} from './fixtures/chats.ts';
import { openDirect, history } from './chat-ui.ts';

test('setup waits for the accepted peer instead of opening a saved contact', async ({
  accounts,
}) => {
  const { a1, b1 } = accounts;
  await requestPrivateConversation(a1, b1);
  const saved = b1.locator('[data-conversation]').filter({
    hasText: 'saved in contacts',
  });
  await expect(saved).toHaveCount(1);
  const opening = openDirect(b1);
  // Deliberately delay real consent while the saved-only row is visible.
  // This is an adversarial setup control, outside warm measurements.
  await Promise.all([
    opening,
    delay(500).then(() => approvePrivateConversation(a1)),
  ]);
  await expect(
    b1.getByRole('dialog', { name: 'Contact settings', exact: true }),
  ).not.toBeVisible();
  await expect(history(b1, 'direct')).toBeVisible();
});
