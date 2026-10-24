import budgets from './chat-budgets.ts';
import { test } from './fixtures/metrics.ts';
import { openDirect, openGroup, acceptedSend, delivered } from './chat-ui.ts';
for (const kind of ['direct', 'group'] as const) {
  test(`S1 ${kind}: real bidirectional delivery survives reload`, async ({
    accounts,
    chats,
    metrics,
  }) => {
    const { a1, b1 } = accounts;
    if (kind === 'direct') {
      await openDirect(a1);
      await openDirect(b1);
    } else {
      await openGroup(a1, chats.group, chats.groupId);
      await openGroup(b1, chats.group, chats.groupId);
    }
    metrics.flow(a1, b1, 'isolated-a-to-b');
    metrics.flow(b1, a1, 'isolated-b-to-a');
    await acceptedSend(a1, kind, 'E2E-first-a-to-b');
    await delivered(b1, kind, 'E2E-first-a-to-b');
    await acceptedSend(b1, kind, 'E2E-first-b-to-a');
    await delivered(a1, kind, 'E2E-first-b-to-a');
    await a1.reload();
    await b1.reload();
    if (kind === 'direct') {
      await openDirect(a1);
      await openDirect(b1);
    } else {
      await openGroup(a1, chats.group, chats.groupId);
      await openGroup(b1, chats.group, chats.groupId);
    }
    await delivered(b1, kind, 'E2E-first-a-to-b');
    await delivered(a1, kind, 'E2E-first-b-to-a');
    await metrics.drain();
    metrics.assertSamples(1);
  });
}

for (const kind of ['direct', 'group'] as const) {
  test(`S2 ${kind}: two-way 20-text burst with a shared-device tab`, async ({
    accounts,
    chats,
    metrics,
  }, info) => {
    const { burst, verifyBurst, drained } = await import('./chat-workload.ts');
    const { expect } = await import('@playwright/test');
    const { a1, b1, a } = accounts;
    const a2 = await a.newPage();
    await a2.goto('/#settings');
    await expect(a2.locator('[data-device-list] li')).toHaveCount(1);
    if (kind === 'direct') {
      await openDirect(a1);
      await openDirect(a2);
      await openDirect(b1);
    } else {
      await openGroup(a1, chats.group, chats.groupId);
      await openGroup(a2, chats.group, chats.groupId);
      await openGroup(b1, chats.group, chats.groupId);
    }
    await metrics.drain();
    const operation = `messages/${kind === 'group' ? 'group-message-publish' : 'publish'}`;
    const before = metrics.accepted(operation);
    const attemptsBefore = metrics.textAttempts(operation);
    metrics.flow(a1, b1, 'a-to-b');
    metrics.flow(b1, a1, 'b-to-a');
    const [aa, bb] = await Promise.all([
      burst(a1, kind, 'a'),
      burst(b1, kind, 'b'),
    ]);
    await info.attach('admission-times', {
      body: JSON.stringify({ a: aa, b: bb }),
      contentType: 'application/json',
    });
    await expect
      .poll(
        () =>
          metrics.accepted(
            `messages/${kind === 'group' ? 'group-message-publish' : 'publish'}`,
          ) - before,
      )
      .toBe(40);
    await drained([a1, a2, b1], metrics);
    await verifyBurst(
      b1,
      kind,
      aa.map((x) => x.token),
      metrics,
    );
    await verifyBurst(
      a1,
      kind,
      bb.map((x) => x.token),
      metrics,
    );
    await verifyBurst(
      a2,
      kind,
      bb.map((x) => x.token),
      metrics,
    );
    await drained([a1, a2, b1], metrics);
    metrics.assertSamples(20);
    expect(metrics.textAttempts(operation) - attemptsBefore).toBe(
      40 * budgets.requestGates.newPublishesPerText,
    );
    expect(
      metrics.accepted(
        `messages/${kind === 'group' ? 'group-message-publish' : 'publish'}`,
      ) - before,
    ).toBe(40);
    // The account fixture closes all pages after metrics teardown, so cleanup
    // cannot be mistaken for work cancelled inside the measured window.
  });
}
