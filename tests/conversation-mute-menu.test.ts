import assert from 'node:assert/strict';
import test from 'node:test';
import { organizationActions } from '../src/client/messages/directory-actions.ts';
import type { Daily } from '../src/client/daily/index.ts';

function actions(mutedUntil: number, mutePeer: string | null = 'peer-1') {
  const calls: [string, number, string | undefined][] = [];
  const daily = {
    conversation: () => ({ archived: false, pinned: false, mutedUntil }),
    favorite: () => false,
    mute: (
      peer: string,
      duration: number,
      options: { settingsId?: string },
    ) => {
      calls.push([peer, duration, options.settingsId]);
      return Promise.resolve();
    },
  } as unknown as Daily;
  const list = organizationActions({
    daily,
    settingsId: 'org-1',
    favoriteId: 'fav-1',
    mutePeer,
    perform: (work) => void work(),
  });
  return { list, calls };
}

await test('the conversation menu offers mute durations and saves through daily.mute', () => {
  const { list, calls } = actions(0);
  const mute = list.find((action) => action.id === 'mute');
  assert.ok(mute?.choices);
  assert.equal(mute.choices.length, 5);
  mute.choices.at(-1)?.perform();
  assert.deepEqual(calls, [['peer-1', Number.MAX_SAFE_INTEGER, 'org-1']]);
});

await test('a muted conversation offers to resume alerts instead', () => {
  const { list, calls } = actions(Date.now() + 60_000);
  const mute = list.find((action) => action.id === 'mute');
  assert.equal(mute?.choices, undefined);
  mute?.perform();
  assert.deepEqual(calls, [['peer-1', 0, 'org-1']]);
});

await test('conversations without a peer to mute keep the menu unchanged', () => {
  const { list } = actions(0, null);
  assert.equal(
    list.some((action) => action.id === 'mute'),
    false,
  );
});
