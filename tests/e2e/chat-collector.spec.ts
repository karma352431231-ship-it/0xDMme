import { test, expect } from './fixtures/accounts.ts';
import { test as chatTest } from './fixtures/chats.ts';
import { ChatMetrics } from './chat-metrics.ts';
import { openGroup, acceptedSend, messageRow, delivered } from './chat-ui.ts';

test('collector detects a real delayed response and counts duplicate work', async ({
  accounts,
}, info) => {
  const metrics = new ChatMetrics();
  await metrics.attach(accounts.a);
  try {
    const { a1, a } = accounts;
    const before = metrics.operations.get('session')?.count ?? 0;
    await a.route(
      '**/api/account/session',
      async (route) => {
        const response = await route.fetch();
        await new Promise((resolve) => setTimeout(resolve, 400));
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await a1.evaluate(async () => {
      await (await fetch('/api/account/session')).json();
    });
    await metrics.drain();
    expect(
      Math.max(...metrics.operations.get('session')!.durationMs),
    ).toBeGreaterThanOrEqual(390);
    await a1.evaluate(async () => {
      await (await fetch('/api/account/session')).json();
      await (await fetch('/api/account/session')).json();
    });
    await metrics.drain();
    expect(metrics.operations.get('session')!.count - before).toBe(3);
    metrics.assertValid();
  } finally {
    await info.attach('chat-metrics', {
      body: JSON.stringify(metrics.report()),
      contentType: 'application/json',
    });
    metrics.close();
  }
});

chatTest(
  'delivery assertion fails when real recipient reads are withheld, then recovers',
  async ({ accounts, chats }) => {
    const { a1, b1, b } = accounts;
    await openGroup(a1, chats.group, chats.groupId);
    await openGroup(b1, chats.group, chats.groupId);
    await b.route('**/api/account/messages/group-message-*', (route) =>
      route.abort('failed'),
    );
    await acceptedSend(a1, 'group', 'E2E-withheld-recipient');
    await expect(
      expect(messageRow(b1, 'group', 'E2E-withheld-recipient')).toHaveCount(1, {
        timeout: 1500,
      }),
    ).rejects.toThrow();
    await b.unroute('**/api/account/messages/group-message-*');
    await b1.reload();
    await openGroup(b1, chats.group, chats.groupId);
    await delivered(b1, 'group', 'E2E-withheld-recipient');
  },
);
