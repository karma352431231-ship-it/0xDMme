import { test, expect } from './fixtures/metrics.ts';
import {
  openDirect,
  openGroup,
  delivered,
  acceptedSend,
  composer,
  messageRow,
} from './chat-ui.ts';
import {
  burst,
  verifyBurst,
  drained,
  selectConversation,
} from './chat-workload.ts';
import budgets from './chat-budgets.ts';

test('S3: navigation stays responsive and preserves destinations during a burst', async ({
  accounts,
  chats,
  metrics,
}, info) => {
  const { a1, b1, a } = accounts;
  await openDirect(a1);
  const directTitle = await a1.locator('[data-message-peer]').innerText();
  await openGroup(a1, chats.group, chats.groupId);
  await openGroup(b1, chats.group, chats.groupId);
  const a2 = await a.newPage();
  try {
    await a2.goto('/#chats');
    await selectConversation(a2, chats.group, 'group', chats.groupId);
    const times: number[] = [];
    const navigation = async () => {
      for (let i = 0; i < budgets.navigationSwitches; i++) {
        const direct = i % 2 === 0;
        times.push(
          await selectConversation(
            a2,
            direct ? directTitle : chats.group,
            direct ? 'direct' : 'group',
            direct ? undefined : chats.groupId,
          ),
        );
        if (direct)
          await expect(a2.locator('[data-group-title]')).not.toBeVisible();
      }
    };
    const [sent] = await Promise.all([
      burst(b1, 'group', 'navigation'),
      navigation(),
    ]);
    await info.attach('navigation-ms', {
      body: JSON.stringify(times),
      contentType: 'application/json',
    });
    await expect
      .poll(() => metrics.accepted('messages/group-message-publish'))
      .toBe(20);
    await drained([a1, a2, b1], metrics);
    await verifyBurst(
      a1,
      'group',
      sent.map((x) => x.token),
    );
    await selectConversation(a2, directTitle, 'direct');
    for (const item of sent)
      await expect(messageRow(a2, 'direct', item.token)).toHaveCount(0);
    await acceptedSend(a2, 'direct', 'E2E-navigation-direct');
    await openDirect(b1);
    await delivered(b1, 'direct', 'E2E-navigation-direct');
    await selectConversation(a2, chats.group, 'group', chats.groupId);
    await verifyBurst(
      a2,
      'group',
      sent.map((x) => x.token),
    );
    await expect(messageRow(a2, 'group', 'E2E-navigation-direct')).toHaveCount(
      0,
    );
    await drained([a1, a2, b1], metrics);
  } finally {
    await a2.close();
  }
});

test('S4: enrolled one-tab and simultaneous two-tab boot with fixed history', async ({
  accounts,
  chats,
  metrics,
  browserName,
}, info) => {
  const { a1, b1, a } = accounts;
  await openGroup(a1, chats.group, chats.groupId);
  await openGroup(b1, chats.group, chats.groupId);
  const sent = await burst(b1, 'group', 'boot', budgets.historyMessages);
  await expect
    .poll(() => metrics.accepted('messages/group-message-publish'))
    .toBe(budgets.historyMessages);
  await drained([a1, b1], metrics);
  await verifyBurst(
    a1,
    'group',
    sent.map((x) => x.token),
  );
  await drained([a1, b1], metrics);
  const samples: {
    tabs: number;
    cache: string;
    directoryMs: number;
    chatMs: number;
  }[] = [];
  const boot = async (page: typeof a1, tabs: number, cache = 'warm-http') => {
    const start = performance.now();
    await page.goto('/#chats');
    await expect(
      page.locator(`[data-conversation="${chats.groupId}"]`),
    ).toBeVisible();
    const directoryMs = performance.now() - start;
    await selectConversation(page, chats.group, 'group', chats.groupId);
    await verifyBurst(
      page,
      'group',
      sent.map((x) => x.token),
    );
    samples.push({
      tabs,
      cache,
      directoryMs,
      chatMs: performance.now() - start,
    });
  };
  if (browserName === 'chromium') {
    const protocol = await a.newCDPSession(a1);
    try {
      await protocol.send('Network.clearBrowserCache');
    } finally {
      await protocol.detach();
    }
    await boot(a1, 1, 'cold-http');
  }
  await boot(a1, 1);
  const a2 = await a.newPage();
  try {
    await Promise.all([boot(a1, 2), boot(a2, 2)]);
    await a2.goto('/#settings');
    await expect(a2.locator('[data-device-list] li')).toHaveCount(1);
    await info.attach('boot-ms', {
      body: JSON.stringify({
        historyMessages: budgets.historyMessages,
        cache:
          'enrolled storage retained; HTTP cache per sample; cold HTTP cache control available only in Chromium',
        samples,
      }),
      contentType: 'application/json',
    });
    await expect(composer(a1, 'group')).toBeEnabled();
    await drained([a1, b1], metrics);
  } finally {
    await a2.close();
  }
});
