import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { startCommunitiesTab } from '../src/client/communities/communities-tab.ts';

function fixture(t: TestContext, feedReturn: string | null = null) {
  const events = new EventTarget(),
    place = { hash: '#communities', pathname: '/', search: '' },
    link = { href: '' };
  for (const [name, value] of [
    ['window', events],
    ['location', place],
  ] as const) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, {
      configurable: true,
      value,
    });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, name, previous);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
  const state = { feedReturn };
  startCommunitiesTab({
    link: link as unknown as HTMLAnchorElement,
    feedReturn: () => state.feedReturn,
  });
  return {
    link,
    state,
    go(hash: string) {
      place.hash = hash;
      events.dispatchEvent(new Event('hashchange'));
    },
  };
}
const profile = '#users?handle=karma';

await test('a profile opened from the feed reopens after another tab', (t) => {
  const f = fixture(t, '#communities?view=feed&return=feed');
  f.go(profile);
  f.go('#chats');
  assert.equal(f.link.href, profile);
  f.go(profile);
  // Inside it, the tab goes back to the kept feed position.
  assert.equal(f.link.href, '#communities?view=feed&return=feed');
});

await test('a post, community or Ranking reopen too; the feed itself stays put', (t) => {
  const f = fixture(t);
  for (const place of [
    '#communities?id=group&post=one',
    '#communities?id=group',
    '#communities?view=explore',
  ]) {
    f.go(place);
    f.go('#activity');
    assert.equal(f.link.href, place);
  }
  f.go('#communities?view=following');
  assert.equal(f.link.href, '#communities?view=following');
});

await test('a profile opened from another tab does not replace where Communities was', (t) => {
  const f = fixture(t);
  f.go('#communities?view=explore');
  f.go('#chats');
  f.go(profile);
  assert.equal(f.link.href, '#communities?view=explore');
});

await test('public chat routes never become the Communities destination', (t) => {
  const f = fixture(t);
  f.go('#communities?view=dms&dm=peer');
  f.go('#chats');
  assert.equal(f.link.href, '#communities');
});
