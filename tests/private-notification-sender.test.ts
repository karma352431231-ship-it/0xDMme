import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directNotificationSender } from '../src/client/notification-private/sender.ts';

function sender(alias: string, profileName: string) {
  const peer = {
    accountId: crypto.randomUUID(),
    name: 'Current sender',
    ecosystem: 'evm' as const,
    address: '0x' + '1'.repeat(40),
  };
  return {
    peer: peer.accountId,
    profileName,
    contacts: { approvedPeer: () => Promise.resolve(peer) },
    book: { aliasFor: () => Promise.resolve(alias) },
  };
}
await test('private notifications use the same local contact alias as the chat', async () => {
  assert.equal(
    await directNotificationSender(sender('Saved nickname', 'Private card')),
    'Saved nickname',
  );
});
await test('a photo card with no name still identifies its currently approved sender', async () => {
  assert.equal(
    await directNotificationSender(sender('', '')),
    'Current sender',
  );
});
await test('a mismatched approved identity cannot attribute private text to someone else', async () => {
  const input = sender('Wrong nickname', 'Private card');
  input.peer = crypto.randomUUID();
  await assert.rejects(directNotificationSender(input), /sender changed/u);
});
