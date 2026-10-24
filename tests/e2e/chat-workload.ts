import { expect } from '@playwright/test';
import type { BrowserContext, Page } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';
import budgets from './chat-budgets.ts';
import { outboxCounts } from './local-outbox.ts';
import { sendText, history, composer } from './chat-ui.ts';
import type { ChatKind } from './chat-ui.ts';
import type { ChatMetrics } from './chat-metrics.ts';

export async function burst(
  page: Page,
  kind: ChatKind,
  sender: string,
  count = budgets.burst.messagesPerSender,
) {
  const start = performance.now(),
    admissions: { token: string; scheduledAt: number; admittedAt: number }[] =
      [];
  for (let i = 0; i < count; i++) {
    const scheduledAt = start + i * budgets.burst.intervalMs;
    await delay(Math.max(0, scheduledAt - performance.now()));
    const token = `E2E-${sender}-${String(i).padStart(3, '0')}`;
    await sendText(page, kind, token);
    admissions.push({ token, scheduledAt, admittedAt: performance.now() });
  }
  return admissions;
}
interface VisibleRow {
  id: string;
  text: string;
}
async function visibleRows(page: Page, kind: ChatKind): Promise<VisibleRow[]> {
  const rows = await history(page, kind)
    .locator(
      kind === 'group'
        ? 'article[data-group-message]'
        : 'article[data-message]',
    )
    .evaluateAll((elements) =>
      elements.map((row) => ({
        id:
          row.getAttribute('data-message') ??
          row.getAttribute('data-group-message') ??
          '',
        text:
          Array.from(row.querySelectorAll('p'))
            .map((paragraph) => paragraph.textContent ?? '')
            .find((text) => text.startsWith('E2E-')) ?? '',
      })),
    );
  expect(rows.every((row) => row.id.length > 0)).toBe(true);
  expect(
    new Set(rows.map((row) => row.id)).size,
    'Duplicate logical row in one history page',
  ).toBe(rows.length);
  return rows;
}
function orderedTokens(
  pages: readonly VisibleRow[][],
  tokens: readonly string[],
): string[] {
  const unique = new Map<string, VisibleRow>();
  for (const rows of pages)
    for (const row of rows) if (!unique.has(row.id)) unique.set(row.id, row);
  return [...unique.values()].flatMap((row) =>
    tokens.filter((token) => row.text === token),
  );
}
export async function verifyBurst(
  page: Page,
  kind: ChatKind,
  tokens: readonly string[],
  metrics?: ChatMetrics,
): Promise<void> {
  await expect(history(page, kind)).toBeVisible();
  await expect(
    history(page, kind).locator(
      kind === 'group'
        ? 'article[data-group-message]'
        : 'article[data-message]',
    ),
  ).not.toHaveCount(0);
  await expect
    .poll(async () => {
      const rows = await visibleRows(page, kind);
      const all = orderedTokens([rows], tokens);
      const earlier = page.locator(
        kind === 'group' ? '[data-group-older]' : '[data-message-older]',
      );
      return (
        tokens.every((token) => all.includes(token)) ||
        (await earlier.isVisible())
      );
    })
    .toBe(true);
  const pages: VisibleRow[][] = [];
  for (let index = 0; index < 6; index++) {
    const rows = await visibleRows(page, kind);
    pages.unshift(rows);
    const found = orderedTokens(pages, tokens);
    if (tokens.every((token) => found.includes(token))) break;
    const earlier = page.locator(
      kind === 'group' ? '[data-group-older]' : '[data-message-older]',
    );
    if (!(await earlier.isVisible())) break;
    metrics?.historyReview(page);
    const previous = rows.map((row) => row.id).join(',');
    await earlier.click();
    await expect
      .poll(async () => {
        const current = await visibleRows(page, kind);
        return (
          current.length > 0 &&
          current.map((row) => row.id).join(',') !== previous
        );
      })
      .toBe(true);
  }
  expect(
    orderedTokens(pages, tokens),
    'Exact delivery/FIFO across bounded history pages',
  ).toEqual(tokens);
}
export async function drained(
  pages: readonly Page[],
  metrics: ChatMetrics,
): Promise<void> {
  await metrics.drain();
  const contexts = new Set<BrowserContext>();
  for (const page of pages) {
    if (contexts.has(page.context())) continue;
    contexts.add(page.context());
    await expect
      .poll(
        async () => {
          const counts = await outboxCounts(page);
          metrics.recordOutbox(page, counts);
          return counts.direct + counts.group;
        },
        { message: 'Committed encrypted outbox must drain' },
      )
      .toBe(0);
  }
  metrics.assertValid();
}
export async function selectConversation(
  page: Page,
  title: string,
  kind: ChatKind,
  id?: string,
): Promise<number> {
  const start = performance.now();
  const target = id
    ? page.locator(`[data-conversation="${id}"]`)
    : page
        .locator('[data-conversation]')
        .filter({ has: page.getByText(title, { exact: true }) });
  await target.click();
  await expect(
    page.locator(
      kind === 'group' ? '[data-group-title]' : '[data-message-peer]',
    ),
  ).toHaveText(title);
  await expect(composer(page, kind)).toBeEnabled();
  return performance.now() - start;
}
