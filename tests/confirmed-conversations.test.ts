import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConfirmedConversations } from '../src/client/messages/confirmed-conversations.ts';

const window = (text = 'Fictícia') => ({
  snapshot: '{}',
  views: [{ text }],
  oldest: 1,
});
await test('orçamento remove a conversa menos usada e não mantém uma janela maior que o limite', () => {
  const cache = new ConfirmedConversations<{ text: string }>();
  for (let index = 0; index < 16; index++)
    cache.remember(String(index), window());
  assert.ok(cache.read('0'));
  cache.remember('16', window());
  assert.equal(cache.read('1'), null);
  assert.ok(cache.read('0'));
  cache.remember('large', window('a'.repeat(5 * 1024 * 1024)));
  assert.equal(cache.read('large'), null);
  cache.clear();
  assert.equal(cache.read('0'), null);
});
await test('texto, metadados e substituição de janelas respeitam orçamento agregado', () => {
  const cache = new ConfirmedConversations<{ text: string }>();
  const large = window('a'.repeat(2 * 1024 * 1024));
  cache.remember('first', large);
  cache.remember('second', large);
  assert.equal(cache.read('first'), null);
  assert.ok(cache.read('second'));
  cache.remember('second', window());
  cache.remember('third', large);
  assert.ok(cache.read('second'));
  assert.ok(cache.read('third'));
});
