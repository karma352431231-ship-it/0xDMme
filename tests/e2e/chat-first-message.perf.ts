import { test } from './fixtures/metrics.ts';
import { openDirect, openGroup, acceptedSend, delivered } from './chat-ui.ts';

// A warm isolated exchange, separate from S1's functional reload workload.
for (const kind of ['direct', 'group'] as const) {
  test(`P1 ${kind}: isolated first-message recipient latency`, async ({
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
    await metrics.drain();
    metrics.flow(a1, b1, 'isolated-a-to-b');
    metrics.flow(b1, a1, 'isolated-b-to-a');
    await acceptedSend(a1, kind, 'E2E-isolated-a');
    await delivered(b1, kind, 'E2E-isolated-a');
    await acceptedSend(b1, kind, 'E2E-isolated-b');
    await delivered(a1, kind, 'E2E-isolated-b');
    await metrics.drain();
    metrics.assertSamples(1);
  });
}
