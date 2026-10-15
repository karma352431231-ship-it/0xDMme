import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EditorImagePreview } from '../src/client/image-editor-preview/index.ts';

await test('unchanged owner image bytes keep their preview URL; removal and cleanup revoke it', (context) => {
  let serial = 0;
  const revoked: string[] = [];
  context.mock.method(
    URL,
    'createObjectURL',
    () => `blob:synthetic-${++serial}`,
  );
  context.mock.method(URL, 'revokeObjectURL', (url: string) =>
    revoked.push(url),
  );
  const image = {
    alt: '',
    hidden: true,
    src: '',
    removeAttribute: (name: string) => {
      if (name === 'src') image.src = '';
    },
  };
  const node = image as unknown as HTMLImageElement;
  const view = new EditorImagePreview(node, node);
  view.show({ type: 'image/png', bytes: new Uint8Array([1, 2]) });
  const first = image.src;
  view.show({ type: 'image/png', bytes: new Uint8Array([1, 2]) });
  assert.equal(image.src, first);
  assert.deepEqual(revoked, []);
  view.show({ type: 'image/png', bytes: new Uint8Array([3, 4]) });
  assert.notEqual(image.src, first);
  assert.deepEqual(revoked, [first]);
  view.show(null);
  assert.equal(image.src, '');
  assert.equal(image.hidden, true);
  assert.equal(revoked.length, 2);
  view.show({ type: 'image/png', bytes: new Uint8Array([1, 2]) });
  view.clear();
  assert.equal(image.src, '');
  assert.equal(image.hidden, true);
  assert.equal(revoked.length, 3);
});
