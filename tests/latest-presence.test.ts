import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LatestPresence } from '../src/client/daily/latest-presence.ts';

function gated() {
  const sent: boolean[] = [],
    gates: { resolve: () => void; reject: (error: Error) => void }[] = [];
  const presence = new LatestPresence(
    (active) =>
      new Promise<void>((resolve, reject) => {
        sent.push(active);
        gates.push({ resolve, reject });
      }),
  );
  return { presence, sent, gates };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('a burst of visibility changes sends the running state and only the final one', async () => {
  const { presence, sent, gates } = gated();
  const calls = [true, false, true, false, true].map((active) =>
    presence.submit(active),
  );
  await settle();
  assert.deepEqual(sent, [true]);
  gates[0]!.resolve();
  await settle();
  assert.deepEqual(sent, [true, true], 'The final visible state survives');
  gates[1]!.resolve();
  await Promise.all(calls);
  assert.equal(sent.length, 2);
});

await test('callers learn the failure of the heartbeat that carried their state', async () => {
  const { presence, sent, gates } = gated();
  const first = presence.submit(true),
    later = presence.submit(false);
  gates[0]!.resolve();
  await first;
  await settle();
  gates[1]!.reject(new Error('Presence unavailable'));
  await assert.rejects(later, /Presence unavailable/u);
  const next = presence.submit(true);
  await settle();
  assert.deepEqual(sent, [true, false, true], 'A failure does not wedge it');
  gates[2]!.resolve();
  await next;
});
