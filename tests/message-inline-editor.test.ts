import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { InlineMessageEditor } from '../src/client/message-inline-editor/index.ts';
import { ChatNode } from './fixtures/chat-dom.ts';
import { deferred } from './fixtures/deferred.ts';

class EditorNode extends ChatNode {
  style = { height: '' };
  focus() {}
}
function fixture(
  t: TestContext,
  save?: (message: { id: string }, text: string) => Promise<void>,
  run: (work: () => Promise<void>) => Promise<void> = (work) => work(),
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: (tag: string) => new EditorNode(tag) },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const saved: { id: string; text: string }[] = [];
  const editor = new InlineMessageEditor<{ id: string }>({
    run,
    save:
      save ??
      ((message, text) => {
        saved.push({ id: message.id, text });
        return Promise.resolve();
      }),
  });
  t.after(() => editor.clear());
  const row = new EditorNode('article');
  const update = (text = 'Original message', target = row) =>
    editor.update([
      {
        message: { id: 'original' },
        text,
        row: target as unknown as HTMLElement,
      },
    ]);
  update();
  editor.begin('original');
  const input = row.querySelector('textarea')!;
  const form = row.querySelector('form')!;
  const change = (text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input'));
  };
  const submit = async () => {
    form.dispatchEvent(new Event('submit', { cancelable: true }));
    await new Promise<void>((resolve) => setImmediate(resolve));
  };
  return { editor, row, input, form, update, change, submit, saved };
}

await test('editing replaces only the selected bubble and saves one edit without borrowing the composer', async (t) => {
  const f = fixture(t);
  const composer = new EditorNode('textarea');
  composer.value = 'Unsent new message';
  assert.equal(f.input.value, 'Original message');
  assert.equal(f.row.getAttribute('data-editing-message'), 'true');
  assert.equal(f.form.querySelectorAll('button')[1]!.disabled, true);
  f.change('Edited message');
  await f.submit();
  assert.deepEqual(f.saved, [{ id: 'original', text: 'Edited message' }]);
  assert.equal(f.row.querySelector('form'), null);
  assert.equal(f.row.hasAttribute('data-editing-message'), false);
  assert.equal(composer.value, 'Unsent new message');
});

await test('cancel preserves the original and empty or unchanged edits cannot be saved', async (t) => {
  const f = fixture(t);
  await f.submit();
  f.change('  \n');
  await f.submit();
  assert.deepEqual(f.saved, []);
  f.form.querySelectorAll('button')[0]!.click();
  assert.equal(f.row.querySelector('form'), null);
  f.editor.begin('original');
  assert.equal(f.row.querySelector('textarea')!.value, 'Original message');
});

await test('verified row replacement retains the draft and rejects overwriting a concurrent edit', async (t) => {
  const f = fixture(t);
  f.change('Local unsaved change');
  const replacement = new EditorNode('article');
  f.update('Original message', replacement);
  assert.equal(replacement.querySelector('textarea'), f.input);
  assert.equal(f.input.value, 'Local unsaved change');
  assert.equal(f.row.hasAttribute('data-editing-message'), false);
  f.update('Changed on another device', replacement);
  await f.submit();
  assert.deepEqual(f.saved, []);
  assert.equal(f.input.value, 'Local unsaved change');
  assert.match(f.form.querySelectorAll('p').at(-1)!.textContent, /changed/u);
});

await test('a save failure retains the edit and permits an explicit retry', async (t) => {
  let calls = 0;
  const f = fixture(t, () => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error('Session ended.'))
      : Promise.resolve();
  });
  f.change('Keep this draft');
  await f.submit();
  assert.equal(f.input.value, 'Keep this draft');
  assert.equal(f.form.querySelectorAll('button')[1]!.disabled, false);
  assert.ok(f.form.querySelectorAll('p').at(-1)!.textContent);
  await f.submit();
  assert.equal(calls, 2);
  assert.equal(f.row.querySelector('form'), null);
});

await test('pending saves are deduplicated and stale completions cannot clear a new editor', async (t) => {
  const pending = deferred<void>();
  let calls = 0;
  const f = fixture(t, () => {
    calls++;
    return pending.promise;
  });
  f.change('Pending edit');
  await f.submit();
  await f.submit();
  assert.equal(calls, 1);
  f.editor.clear();
  f.update('Another conversation');
  f.editor.begin('original');
  const next = f.row.querySelector('textarea')!;
  next.value = 'New account draft';
  next.dispatchEvent(new Event('input'));
  pending.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(f.row.querySelector('textarea'), next);
  assert.equal(next.value, 'New account draft');
});

await test('an unavailable or revoked target discards its editor and cannot be reopened', async (t) => {
  const f = fixture(t);
  f.change('Do not send');
  f.editor.update([]);
  f.editor.begin('original');
  await f.submit();
  assert.deepEqual(f.saved, []);
  assert.equal(f.row.querySelector('form'), null);
});

await test('navigation cancels an edit still waiting for the authenticated operation lane', async (t) => {
  const ready = deferred<void>();
  const f = fixture(t, undefined, async (work) => {
    await ready.promise;
    await work();
  });
  f.change('Do not submit after navigation');
  await f.submit();
  f.editor.clear();
  ready.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.saved, []);
});

await test('an observed concurrent edit also blocks a save still waiting for authentication', async (t) => {
  const ready = deferred<void>();
  const f = fixture(t, undefined, async (work) => {
    await ready.promise;
    await work();
  });
  f.change('Local change');
  await f.submit();
  f.update('New verified text');
  ready.resolve();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(f.saved, []);
  assert.equal(f.input.value, 'Local change');
  assert.equal(f.form.querySelectorAll('button')[1]!.disabled, true);
});
