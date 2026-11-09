import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composerState,
  historyPosition,
  resetHistoryPosition,
  sendOnEnter,
  updateMessageStates,
} from '../src/client/chat-ui/index.ts';

await test('synchronization blocks sending even with text or an attachment ready', () => {
  for (const content of [
    { text: 'Mensagem de teste', attachment: false },
    { text: '', attachment: true },
  ]) {
    const state = composerState({
      ...content,
      blocked: true,
      recording: false,
    });
    assert.equal(state.send, true);
    assert.equal(state.disabled, true);
    assert.equal(state.record, false);
  }
});

await test('active recording cannot send; ready preview allows sending without a caption', () => {
  assert.deepEqual(
    composerState({
      text: 'Legenda',
      attachment: false,
      blocked: false,
      recording: true,
    }),
    { send: false, record: false, disabled: true },
  );
  assert.deepEqual(
    composerState({
      text: '',
      attachment: true,
      blocked: false,
      recording: false,
    }),
    { send: true, record: false, disabled: false },
  );
  assert.deepEqual(
    composerState({
      text: ' \n ',
      attachment: false,
      blocked: false,
      recording: false,
    }),
    { send: false, record: true, disabled: false },
  );
});

await test('synchronization hiding history preserves reading position on reopen', () => {
  // Only the scroll geometry is needed; no browser/crypto emulation.
  const history = {
    hidden: false,
    scrollTop: 140,
    scrollHeight: 1200,
    clientHeight: 400,
    childElementCount: 12,
  };
  const element = history as unknown as HTMLElement;
  historyPosition(element);
  history.hidden = true;
  history.childElementCount = 0;
  history.scrollTop = 0;
  const restore = historyPosition(element);
  history.hidden = false;
  history.childElementCount = 14;
  history.scrollHeight = 1500;
  restore();
  assert.equal(history.scrollTop, 140);
});

await test('readers at the bottom follow new messages; readers above keep their position', () => {
  const history = {
    hidden: false,
    scrollTop: 799,
    scrollHeight: 1200,
    clientHeight: 400,
    childElementCount: 12,
  };
  const element = history as unknown as HTMLElement;
  const follow = historyPosition(element);
  history.scrollHeight = 1500;
  follow();
  assert.equal(history.scrollTop, 1500);
  history.scrollTop = 1090;
  const retain = historyPosition(element);
  history.scrollHeight = 1800;
  retain();
  assert.equal(history.scrollTop, 1090, 'even a small deliberate scroll holds');
});

await test('the new-message button counts only incoming appends and clears on jump or manual return', () => {
  const button = Object.assign(new EventTarget(), {
    hidden: true,
    textContent: '',
    setAttribute() {},
  });
  let attached = 0;
  const history = Object.assign(new EventTarget(), {
    hidden: false,
    scrollTop: 800,
    scrollHeight: 1200,
    clientHeight: 400,
    childElementCount: 12,
    ownerDocument: { createElement: () => button },
    after: () => {
      attached++;
    },
  });
  const element = history as unknown as HTMLElement;
  const message = (sequence: number, own = false) => ({ sequence, own });
  const initial = [message(7), message(8, true)];
  historyPosition(element, initial)();
  history.scrollTop = 780;
  const first = [...initial, message(9)];
  const restore = historyPosition(element, first);
  history.scrollHeight = 1250;
  restore();
  assert.equal(history.scrollTop, 780);
  assert.equal(button.hidden, false);
  assert.equal(button.textContent, '1 new message');

  const next = [
    message(1),
    ...first,
    message(10, true),
    { ...message(11), relation: { id: 'old' } },
    message(12),
  ];
  historyPosition(element, next)();
  historyPosition(element, next)();
  assert.equal(button.textContent, '2 new messages');
  assert.equal(attached, 1);

  history.scrollTop = history.scrollHeight - history.clientHeight;
  history.dispatchEvent(new Event('scroll'));
  assert.equal(button.hidden, true);
  history.scrollTop -= 20;
  const more = historyPosition(element, [...next, message(13)]);
  history.scrollHeight += 40;
  more();
  assert.equal(button.textContent, '1 new message');
  button.dispatchEvent(new Event('click'));
  assert.equal(history.scrollTop, history.scrollHeight);
  assert.equal(button.hidden, true);

  resetHistoryPosition(element);
  historyPosition(element, [message(100)])();
  assert.equal(button.hidden, true);
});

await test('conversation change cannot reuse the old position before hiding history', () => {
  const history = {
    hidden: false,
    scrollTop: 140,
    scrollHeight: 1200,
    clientHeight: 400,
    childElementCount: 12,
  };
  const element = history as unknown as HTMLElement;
  resetHistoryPosition(element);
  historyPosition(element);
  history.hidden = true;
  history.childElementCount = 0;
  const restore = historyPosition(element);
  history.hidden = false;
  history.scrollHeight = 1500;
  restore();
  assert.equal(history.scrollTop, 1500);
});
await test('receipts update only checkmarks; media, bubble and reading position remain', () => {
  const media = {},
    body = {},
    actions = {},
    unchanged = {} as HTMLElement,
    received = {} as HTMLElement;
  let detail = unchanged,
    replacements = 0;
  const article = {
    dataset: { message: 'synthetic-id' },
    media,
    body,
    actions,
    querySelector: () => ({
      isEqualNode: (next: HTMLElement) => next === detail,
      replaceWith: (next: HTMLElement) => {
        replacements++;
        detail = next;
      },
    }),
  };
  const history = {
    scrollTop: 170,
    querySelectorAll: () => [article],
  };
  updateMessageStates(
    history as unknown as HTMLElement,
    new Map([['synthetic-id', unchanged]]),
  );
  assert.equal(replacements, 0);
  updateMessageStates(
    history as unknown as HTMLElement,
    new Map([['synthetic-id', received]]),
  );
  assert.equal(replacements, 1);
  assert.equal(detail, received);
  assert.equal(article.media, media);
  assert.equal(article.body, body);
  assert.equal(article.actions, actions);
  assert.equal(history.scrollTop, 170);
});

await test('Enter sends, Shift+Enter adds a line; touch keyboards require Ctrl/Cmd to send', (t) => {
  let touch = false;
  Object.defineProperty(globalThis, 'matchMedia', {
    configurable: true,
    value: () => ({ matches: touch }),
  });
  t.after(() => {
    Reflect.deleteProperty(globalThis, 'matchMedia');
  });
  const field = new EventTarget() as HTMLTextAreaElement;
  let sent = 0;
  sendOnEnter(field, () => sent++);
  const press = (init: KeyboardEventInit & { isComposing?: boolean }) => {
    const event = Object.assign(new Event('keydown', { cancelable: true }), {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      isComposing: false,
      ...init,
    });
    field.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(press({}), true);
  assert.equal(press({ shiftKey: true }), false);
  assert.equal(press({ isComposing: true }), false);
  assert.equal(press({ key: 'a' }), false);
  touch = true;
  assert.equal(press({}), false);
  assert.equal(press({ ctrlKey: true }), true);
  assert.equal(sent, 2);
});
