import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SettingsCompletion } from '../src/client/account-settings/completion.ts';

function storage() {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    values,
    writes: () => writes,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes++;
      values.set(key, value);
    },
  };
}
await test('completion survives a new controller instance and stays scoped to its account', () => {
  const saved = storage();
  const first = crypto.randomUUID(),
    second = crypto.randomUUID();
  const history = new SettingsCompletion(saved);
  assert.equal(history.has(first), false);
  history.remember(first);
  history.remember(first);
  assert.equal(saved.writes(), 1);
  assert.equal(new SettingsCompletion(saved).has(first), true);
  assert.equal(history.has(second), false);
});
await test('completion storage stays bounded and rejects malformed or unavailable state', () => {
  const saved = storage(),
    history = new SettingsCompletion(saved);
  const accounts = Array.from({ length: 65 }, () => crypto.randomUUID());
  for (const account of accounts) history.remember(account);
  assert.equal(history.has(accounts[0]!), false);
  assert.equal(history.has(accounts.at(-1)!), true);
  for (const value of saved.values.values()) assert.ok(value.length < 4096);
  const key = [...saved.values.keys()][0]!;
  for (const value of ['{', '"known"', '[]', 'a'.repeat(5000)]) {
    saved.values.set(key, value);
    assert.equal(history.has(accounts.at(-1)!), false);
  }
  const denied = new SettingsCompletion({
    getItem: () => {
      throw new Error('Synthetic storage refusal.');
    },
    setItem: () => {
      throw new Error('Synthetic storage refusal.');
    },
  });
  assert.equal(denied.has(accounts[0]!), false);
  assert.doesNotThrow(() => denied.remember(accounts[0]!));
  assert.equal(new SettingsCompletion(null).has(accounts[0]!), false);
});
