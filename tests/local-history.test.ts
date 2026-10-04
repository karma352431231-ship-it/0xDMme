import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  sealHistoryRecord,
  openHistoryRecord,
  mergeHistory,
} from '../src/client/local-history/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import type { BackupRecord } from '../src/client/backup-records/index.ts';
import { aesKey, newSecret } from '../src/client/device-keys/index.ts';
import { dailyViews } from '../src/client/daily-text/index.ts';
import { encodeDailyText } from '../src/shared/daily/index.ts';
function fixture(): VaultAuthority {
  const secret = newSecret();
  return {
    session: {
      accountId: crypto.randomUUID(),
      deviceId: crypto.randomUUID(),
      csrf: '',
    },
    offline: true,
    directory: 'a'.repeat(64),
    epoch: 1,
    events: [],
    key: () => aesKey(secret),
    sign: () => Promise.reject(new Error('Sem autorização remota.')),
  };
}
function row(value: string): BackupRecord {
  return {
    type: 'vault',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    change: {
      version: 1,
      entity: crypto.randomUUID(),
      kind: 'test',
      parents: [],
      label: 'Sintético',
    },
    value,
  };
}
await test('histórico persistido cifra registros grandes e autentica conta, metadados e ordem das partes', async () => {
  const a = fixture(),
    record = row('x'.repeat(600_000));
  const stored = await sealHistoryRecord(a, 'b'.repeat(64), record);
  assert.ok(stored.chunks.length > 2);
  assert.deepEqual(await openHistoryRecord(a, structuredClone(stored)), record);
  for (const changed of [
    { ...stored, peer: crypto.randomUUID() },
    { ...stored, relation: crypto.randomUUID() },
    { ...stored, hash: 'c'.repeat(64) },
    { ...stored, chunks: [...stored.chunks].reverse() },
    { ...stored, bytes: stored.bytes - 1 },
    { ...stored, source: 'c'.repeat(64) },
  ])
    await assert.rejects(openHistoryRecord(a, changed));
  await assert.rejects(openHistoryRecord(fixture(), stored));
  const corrupted = structuredClone(stored);
  corrupted.chunks[0]!.bytes[12] = (corrupted.chunks[0]!.bytes[12] ?? 0) ^ 1;
  await assert.rejects(openHistoryRecord(a, corrupted));
  await assert.rejects(openHistoryRecord(a, { ...stored, bytes: -1 }));
});
await test('histórico antigo e novo se unem por identidade, mantendo edições e reações sem duplicar', () => {
  const author = crypto.randomUUID(),
    peer = crypto.randomUUID();
  const base = {
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    peer,
    author,
    own: true,
    kind: 'text',
    text: encodeDailyText({ text: 'Antes', reply: null, forwarded: false }),
    sequence: 1,
    archived: true,
  };
  const edit = {
    ...base,
    id: crypto.randomUUID(),
    hash: 'b'.repeat(64),
    sequence: 2,
    text: encodeDailyText({ text: 'Depois', reply: null, forwarded: false }),
    relation: { type: 'edit' as const, id: base.id, hash: base.hash, author },
  };
  const reaction = {
    ...edit,
    id: crypto.randomUUID(),
    hash: 'c'.repeat(64),
    own: false,
    author: peer,
    sequence: 3,
    text: encodeDailyText({ text: '👍', reply: null, forwarded: false }),
    relation: { ...edit.relation, type: 'reaction' as const },
  };
  const newer = {
    ...base,
    id: crypto.randomUUID(),
    hash: 'd'.repeat(64),
    sequence: 4,
    archived: false,
    text: 'Nova',
  };
  const merged = mergeHistory([base, newer], [reaction, edit, base]);
  assert.equal(merged.length, 4);
  const visible = dailyViews(merged);
  assert.equal(visible[0]!.content.text, 'Depois');
  assert.deepEqual(visible[0]!.reactions, ['👍']);
  assert.equal(visible[1]!.content.text, 'Nova');
  assert.throws(
    () => mergeHistory([{ ...base, hash: 'f'.repeat(64) }], [base]),
    /diverge/u,
  );
});
