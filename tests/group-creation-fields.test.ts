import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupCreationFields } from '../src/client/groups/creation-fields.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
import { base64 } from '../src/shared/account/index.ts';
await test('creation photo is prepared before submission, survives title edits and is removed/reset without retaining a blob URL', async (t) => {
  const photo = fixtureGroupPhoto(),
    bytes = base64(photo.base64, 16384),
    revoked: string[] = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: communityDocument(),
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  t.mock.method(
    URL,
    'createObjectURL',
    () => `blob:synthetic-${revoked.length}`,
  );
  t.mock.method(URL, 'revokeObjectURL', (value: string) => revoked.push(value));
  const bitmap = Object.getOwnPropertyDescriptor(
      globalThis,
      'createImageBitmap',
    ),
    canvas = Object.getOwnPropertyDescriptor(globalThis, 'OffscreenCanvas');
  Object.defineProperty(globalThis, 'createImageBitmap', {
    configurable: true,
    value: () => Promise.resolve({ width: 192, height: 192, close() {} }),
  });
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    value: class {
      getContext() {
        return { drawImage() {} };
      }
      convertToBlob() {
        return Promise.resolve(
          new Blob([Uint8Array.from(bytes)], { type: 'image/jpeg' }),
        );
      }
    },
  });
  t.after(() => {
    for (const [key, value] of [
      ['createImageBitmap', bitmap],
      ['OffscreenCanvas', canvas],
    ] as const) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  const title = new CommunityNode('input'),
    description = new CommunityNode('textarea'),
    avatar = new CommunityNode(),
    remove = new CommunityNode('button'),
    file = Object.assign(new CommunityNode('input'), {
      files: [
        new File([Uint8Array.from(bytes)], 'synthetic.jpg', {
          type: 'image/jpeg',
        }),
      ],
    });
  title.value = 'Initial';
  description.value = 'Optional initial description';
  const nodes = new Map<string, CommunityNode>([
    ['[name=title]', title],
    ['[name=description]', description],
    ['[data-create-avatar]', avatar],
    ['[data-create-photo-file]', file],
    ['[data-create-photo-pick]', new CommunityNode('button')],
    ['[data-create-photo-remove]', remove],
    ['[data-feedback]', new CommunityNode()],
  ]);
  const fields = new GroupCreationFields();
  fields.mount({
    querySelector: (selector: string) => nodes.get(selector) ?? null,
  } as unknown as HTMLDialogElement);
  file.dispatchEvent(new Event('change'));
  const first = await fields.read();
  assert.deepEqual(first.photo, photo);
  assert.equal(first.description, description.value);
  assert.equal(avatar.querySelectorAll('img').length, 1);
  title.value = 'Changed';
  title.dispatchEvent(new Event('input'));
  assert.deepEqual((await fields.read()).photo, photo);
  remove.click();
  assert.equal((await fields.read()).photo, null);
  assert.equal(avatar.querySelectorAll('img').length, 0);
  assert.equal(remove.hidden, true);
  fields.reset();
  await assert.rejects(fields.read(), /closed/);
  assert.ok(revoked.length >= 2);
});
