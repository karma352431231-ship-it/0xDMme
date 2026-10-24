import {
  loseAcknowledgement,
  holdPublisher,
} from './fixtures/transport-loss.ts';
import { test, expect } from './fixtures/metrics.ts';
import {
  openGroup,
  openDirect,
  acceptedSend,
  delivered,
  sendText,
  messageRow,
} from './chat-ui.ts';
import { burst, verifyBurst, drained } from './chat-workload.ts';
import { outboxCounts } from './local-outbox.ts';

for (const kind of ['direct', 'group'] as const) {
  test(`S5 ${kind}: real disconnect and reconnect recovers each message once`, async ({
    accounts,
    chats,
    metrics,
  }) => {
    const { a1, b1, b } = accounts;
    if (kind === 'direct') {
      await openDirect(a1);
      await openDirect(b1);
    } else {
      await openGroup(a1, chats.group, chats.groupId);
      await openGroup(b1, chats.group, chats.groupId);
    }
    await b.setOffline(true);
    const sent = await burst(a1, kind, 'offline', 5);
    try {
      await expect
        .poll(() =>
          metrics.accepted(
            `messages/${kind === 'group' ? 'group-message-publish' : 'publish'}`,
          ),
        )
        .toBeGreaterThanOrEqual(5);
    } finally {
      await b.setOffline(false);
    }
    await verifyBurst(
      b1,
      kind,
      sent.map((x) => x.token),
    );
    await b1.reload();
    if (kind === 'direct') await openDirect(b1);
    else await openGroup(b1, chats.group, chats.groupId);
    await verifyBurst(
      b1,
      kind,
      sent.map((x) => x.token),
    );
    await b.setOffline(true);
    try {
      if (kind === 'direct') await openDirect(b1);
      await sendText(b1, kind, 'E2E-offline-draft');
      await expect.poll(async () => (await outboxCounts(b1))[kind]).toBe(1);
    } finally {
      await b.setOffline(false);
    }
    await delivered(a1, kind, 'E2E-offline-draft');
    await drained([a1, b1], metrics);
  });
  test(`S6 ${kind}: accepted publication survives a lost acknowledgement and sender reload`, async ({
    accounts,
    chats,
    metrics,
  }) => {
    const { a1, b1, a } = accounts;
    if (kind === 'direct') {
      await openDirect(a1);
      await openDirect(b1);
    } else {
      await openGroup(a1, chats.group, chats.groupId);
      await openGroup(b1, chats.group, chats.groupId);
    }
    const operation = kind === 'group' ? 'group-message-publish' : 'publish';
    const loss = await loseAcknowledgement(a, operation);
    try {
      await sendText(a1, kind, 'E2E-lost-ack');
      await loss.waitForCommit();
      await a1.reload();
    } finally {
      await loss.close();
    }
    if (kind === 'direct') await openDirect(a1);
    else await openGroup(a1, chats.group, chats.groupId);
    await delivered(b1, kind, 'E2E-lost-ack');
    await delivered(a1, kind, 'E2E-lost-ack');
    await drained([a1, b1], metrics);
  });
  test(`S6 ${kind}: closing the active publisher transfers durable work to its sibling`, async ({
    accounts,
    chats,
    metrics,
  }) => {
    const { a1, b1, a } = accounts;
    if (kind === 'direct') {
      await openDirect(a1);
      await openDirect(b1);
    } else {
      await openGroup(a1, chats.group, chats.groupId);
      await openGroup(b1, chats.group, chats.groupId);
    }
    const a2 = await a.newPage();
    try {
      await a2.goto('/#chats');
      if (kind === 'direct') await openDirect(a2);
      else await openGroup(a2, chats.group, chats.groupId);
      const operation = kind === 'group' ? 'group-message-publish' : 'publish';
      const held = await holdPublisher([a1, a2], operation);
      try {
        await sendText(a1, kind, 'E2E-owner-loss');
        const owner = await held.waitForOwner();
        const survivor = owner === a1 ? a2 : a1;
        await expect(messageRow(b1, kind, 'E2E-owner-loss')).toHaveCount(0);
        await owner.close();
        await delivered(b1, kind, 'E2E-owner-loss');
        await delivered(survivor, kind, 'E2E-owner-loss');
        held.assertExclusive();
        await drained([survivor, b1], metrics);
      } finally {
        await held.close();
      }
    } finally {
      if (!a2.isClosed()) await a2.close();
    }
  });
}

test('S7: group edits and deletion during incoming traffic survive navigation and reload', async ({
  accounts,
  chats,
  metrics,
}) => {
  const { a1, b1 } = accounts;
  await openGroup(a1, chats.group, chats.groupId);
  await openGroup(b1, chats.group, chats.groupId);
  await acceptedSend(a1, 'group', 'E2E-mutate-original');
  await delivered(b1, 'group', 'E2E-mutate-original');
  await delivered(a1, 'group', 'E2E-mutate-original');
  const mutation = async () => {
    await messageRow(a1, 'group', 'E2E-mutate-original')
      .getByRole('button', { name: 'Message options', exact: true })
      .click();
    await a1
      .getByRole('menu', { name: 'Message options', exact: true })
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    const dialog = a1.getByRole('dialog', {
      name: 'Edit message',
      exact: true,
    });
    await dialog
      .getByRole('textbox', { name: 'Message', exact: true })
      .fill('E2E-mutate-edited');
    await dialog
      .getByRole('button', { name: 'Save change', exact: true })
      .click();
    await delivered(b1, 'group', 'E2E-mutate-edited');
    await delivered(a1, 'group', 'E2E-mutate-edited');
    await messageRow(a1, 'group', 'E2E-mutate-edited')
      .getByRole('button', { name: 'Message options', exact: true })
      .click();
    await a1
      .getByRole('menu', { name: 'Message options', exact: true })
      .getByRole('button', { name: 'Delete for everyone', exact: true })
      .click();
    await expect(messageRow(b1, 'group', 'E2E-mutate-edited')).toHaveCount(0);
  };
  const [sent] = await Promise.all([
    burst(b1, 'group', 'mutation', 5),
    mutation(),
  ]);

  await verifyBurst(
    a1,
    'group',
    sent.map((x) => x.token),
  );
  await openDirect(b1);
  await b1.reload();
  await openGroup(b1, chats.group, chats.groupId);
  await expect(messageRow(b1, 'group', 'E2E-mutate-original')).toHaveCount(0);
  await expect(messageRow(b1, 'group', 'E2E-mutate-edited')).toHaveCount(0);
  await verifyBurst(
    b1,
    'group',
    sent.map((x) => x.token),
  );
  await drained([a1, b1], metrics);
});
