import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  composerState,
  historyPosition,
  resetHistoryPosition,
  updateMessageStates,
} from '../src/client/chat-ui/index.ts';

await test('sincronização bloqueia envio mesmo com texto ou anexo pronto', () => {
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

await test('gravação ativa não oferece envio; prévia pronta oferece enviar sem exigir legenda', () => {
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

await test('sincronização que oculta o histórico preserva a posição de leitura ao reabrir', () => {
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

await test('quem já estava no fim acompanha mensagens novas; quem subiu continua lendo', () => {
  const history = {
    hidden: false,
    scrollTop: 750,
    scrollHeight: 1200,
    clientHeight: 400,
    childElementCount: 12,
  };
  const element = history as unknown as HTMLElement;
  const follow = historyPosition(element);
  history.scrollHeight = 1500;
  follow();
  assert.equal(history.scrollTop, 1500);
  history.scrollTop = 80;
  const retain = historyPosition(element);
  history.scrollHeight = 1800;
  retain();
  assert.equal(history.scrollTop, 80);
});

await test('trocar de conversa não reutiliza a posição antiga antes de ocultar o histórico', () => {
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
await test('recibos alteram somente os checks; mídia, bolha e posição de leitura permanecem', () => {
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
