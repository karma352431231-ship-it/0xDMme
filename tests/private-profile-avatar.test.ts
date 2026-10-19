import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PrivateProfileAvatar } from '../src/client/account/private-profile-avatar.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import { CommunityNode } from './fixtures/community-dom.ts';

class AvatarNode extends CommunityNode {
  alt = '';
  set src(value: string) {
    this.setAttribute('src', value);
  }
}

await test('private account photos share one URL across desktop/mobile, survive repaint and release on clear', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new AvatarNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const create = t.mock.method(
    URL,
    'createObjectURL',
    () => `blob:private-${create.mock.callCount()}`,
  );
  const revoked: string[] = [];
  t.mock.method(URL, 'revokeObjectURL', (url: string) => {
    revoked.push(url);
  });
  const fetch = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Private avatars cannot fetch public photos.');
  });
  const avatar = new PrivateProfileAvatar();
  const hosts = ['account', 'profile', 'rail', 'mobile'].map(
    () => new AvatarNode('span'),
  );
  const input = {
    hosts: hosts as unknown as HTMLElement[],
    session: {
      name: 'Synthetic Account',
      address: '0x' + 'a'.repeat(40),
    } as AccountSession,
    photo: { type: 'image/png', bytes: new Uint8Array(8) },
  };
  avatar.render(input);
  const images = hosts.map((host) => host.querySelector('img'));
  assert.ok(images.every(Boolean));
  assert.equal(
    new Set(images.map((image) => image?.getAttribute('src'))).size,
    1,
  );
  avatar.render(input);
  assert.deepEqual(
    hosts.map((host) => host.querySelector('img')),
    images,
  );
  assert.equal(create.mock.callCount(), 1);
  const oldUrl = images[0]!.getAttribute('src');
  avatar.render({
    ...input,
    photo: { ...input.photo, bytes: new Uint8Array(9) },
  });
  assert.deepEqual(revoked, [oldUrl]);
  images[0]!.dispatchEvent(new Event('error'));
  assert.ok(hosts.every((host) => host.querySelector('img')));
  hosts[0]!.querySelector('img')!.dispatchEvent(new Event('error'));
  assert.ok(
    hosts.every(
      (host) => !host.querySelector('img') && host.textContent === 'SA',
    ),
  );
  avatar.clear();
  assert.equal(revoked.length, 2);
  assert.ok(
    hosts.every((host) => host.textContent === '#' && !host.dataset['tone']),
  );
  assert.equal(fetch.mock.callCount(), 0);
});
