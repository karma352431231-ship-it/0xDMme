import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HistoryFloors,
  WindowReceipts,
  fromFloor,
  historyPage,
  historyRootLimit,
  reachFloor,
  relationBudget,
  windowRoots,
} from '../src/client/history-window/index.ts';
import {
  messageDay,
  withDayHeadings,
} from '../src/client/message-presentation/index.ts';
import { watchOlderHistory } from '../src/client/chat-ui/older-history.ts';

interface Row {
  id: string;
  sequence: number;
  kind?: string;
  relation?: { id: string };
}
const root = (sequence: number): Row => ({ id: `m${sequence}`, sequence });
const roots = (from: number, to: number): Row[] =>
  Array.from({ length: to - from + 1 }, (_, index) => root(from + index));
/** Verified pages of a conversation with roots 1..total, like the readers. */
function pages(total: number) {
  const asked: number[] = [];
  return {
    asked,
    page: (before: number) => {
      asked.push(before);
      return Promise.resolve(
        roots(1, total)
          .filter((row) => row.sequence < before)
          .slice(-historyPage),
      );
    },
    merge: (newer: readonly Row[], older: readonly Row[]) =>
      [
        ...new Map([...older, ...newer].map((row) => [row.id, row])).values(),
      ].sort((a, b) => a.sequence - b.sequence),
  };
}

await test('without a floor a window keeps the latest page; with one, every root from it', () => {
  const ordered = roots(1, 40);
  assert.deepEqual(
    windowRoots(ordered, null, (row) => row.sequence).map((r) => r.sequence),
    roots(25, 40).map((r) => r.sequence),
  );
  assert.equal(windowRoots(ordered, 3, (row) => row.sequence).length, 38);
  assert.equal(
    windowRoots(roots(1, historyRootLimit + 5), 1, (row) => row.sequence)
      .length,
    historyRootLimit,
  );
  assert.equal(relationBudget(4), 48);
  assert.equal(relationBudget(40), 120);
  const rows = [
    ...roots(1, 3),
    { id: 'edit', sequence: 9, relation: { id: 'm1' } },
    { id: 'reaction', sequence: 10, relation: { id: 'm3' } },
    { id: 'card', sequence: 0, kind: 'profile' },
  ];
  assert.deepEqual(
    fromFloor(rows, 2).map((row) => row.id),
    ['m2', 'm3', 'reaction', 'card'],
  );
});

await test('one page further back moves the floor, and a later read reaches it again', async () => {
  const history = pages(40);
  const older = await reachFloor({
    rows: roots(25, 40),
    floor: null,
    older: true,
    ...history,
  });
  assert.equal(older.floor, 9);
  assert.equal(older.complete, false);
  assert.equal(older.rows.length, 32);
  assert.deepEqual(history.asked, [25]);
  // A fresh latest page (for example after a full read) goes back to the floor.
  const again = await reachFloor({
    rows: roots(26, 41),
    floor: older.floor,
    older: false,
    ...history,
  });
  assert.equal(again.rows[0]?.sequence, 9);
  assert.equal(again.complete, null);
  assert.deepEqual(history.asked, [25, 26, 10]);
  const unchanged = await reachFloor({
    rows: roots(25, 40),
    floor: null,
    older: false,
    ...history,
  });
  assert.equal(unchanged.rows.length, 16);
  assert.deepEqual(history.asked, [25, 26, 10]);
});

await test('reading past the first message reports the history as complete', async () => {
  const history = pages(20);
  const first = await reachFloor({
    rows: roots(5, 20),
    floor: null,
    older: true,
    ...history,
  });
  assert.equal(first.floor, 1);
  const last = await reachFloor({
    rows: first.rows,
    floor: first.floor,
    older: true,
    ...history,
  });
  assert.equal(last.complete, true);
  assert.equal(last.rows.length, 20);
  const floors = new HistoryFloors();
  floors.update('peer', first);
  assert.equal(floors.floor('peer'), 1);
  assert.equal(floors.complete('peer'), false);
  floors.update('peer', last);
  assert.equal(floors.complete('peer'), true);
  floors.update('peer', { floor: 1, complete: null });
  assert.equal(floors.complete('peer'), true);
  floors.clear();
  assert.equal(floors.floor('peer'), null);
});

await test('receipts ask the latest page every time and each older page once', () => {
  const receipts = new WindowReceipts<boolean>(),
    ids = Array.from({ length: 40 }, (_, index) => `id${index}`);
  const first = receipts.batches(ids);
  assert.deepEqual(
    first.map((batch) => batch.length),
    [16, 16, 8],
  );
  assert.deepEqual(first[0], ids.slice(-16));
  for (const batch of first)
    receipts.answered(batch, new Map(batch.map((id) => [id, id === 'id0'])));
  assert.deepEqual(receipts.batches(ids), [ids.slice(-16)]);
  assert.equal(receipts.state('id0'), true);
  assert.equal(receipts.state('id1'), false);
  receipts.clear();
  assert.equal(receipts.state('id0'), undefined);
  assert.deepEqual(new WindowReceipts().batches([]), []);
});

await test('day headings start at local midnight and name today and yesterday', () => {
  const now = new Date(2026, 10, 25, 9, 30).getTime(),
    at = (day: number, hour: number, minute = 0) =>
      new Date(2026, 10, day, hour, minute).getTime();
  assert.equal(messageDay(at(25, 0, 0), now).label, 'Today');
  assert.equal(messageDay(at(24, 23, 59), now).label, 'Yesterday');
  assert.notEqual(
    messageDay(at(24, 23, 59), now).key,
    messageDay(at(25, 0, 0), now).key,
  );
  assert.match(messageDay(at(23, 12), now).label, /November 23/);
  assert.match(messageDay(new Date(2025, 0, 2).getTime(), now).label, /2025/);
  const rows = [
    { id: 'a', sentAt: at(23, 10) },
    { id: 'b', sentAt: at(23, 23) },
    { id: 'c' },
    { id: 'd', sentAt: Date.now() },
  ];
  const headed = withDayHeadings(
    rows,
    (row) => ('sentAt' in row ? row.sentAt : undefined),
    (day) => ({ id: `day:${day.label}` }),
  ).map((row) => row.id);
  assert.equal(headed.length, 6);
  assert.match(headed[0]!, /^day:/);
  assert.deepEqual(headed.slice(1, 4), ['a', 'b', 'c']);
  assert.deepEqual(headed.slice(4), ['day:Today', 'd']);
});

await test('reaching the top reads once at a time; a read with no progress shows the retry', async () => {
  const listeners = new Map<string, () => void>();
  const node = () => ({
    hidden: false,
    disabled: false,
    textContent: '',
    isConnected: true,
    scrollTop: 0,
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, listener),
  });
  const history = node(),
    button = node();
  let calls = 0,
    progress = true;
  const finished: (() => void)[] = [];
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: (callback: () => void) => finished.push(callback),
  });
  try {
    const older = watchOlderHistory({
      history: history as unknown as HTMLElement,
      button: button as unknown as HTMLButtonElement,
      available: () => true,
      load: () => {
        calls++;
        return Promise.resolve(progress);
      },
      signal: new AbortController().signal,
    });
    assert.equal(button.hidden, true);
    older.check();
    older.check();
    assert.equal(calls, 1);
    assert.equal(button.disabled, true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(button.hidden, true);
    // After progress the trigger looks again on the next frame.
    progress = false;
    finished.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(calls, 2);
    assert.equal(button.hidden, false);
    history.scrollTop = 0;
    older.check();
    assert.equal(calls, 2);
    listeners.get('click')?.();
    assert.equal(calls, 3);
  } finally {
    Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  }
});
