import { readBackupWindow } from '../src/client/messages/backup-window.ts';
import {
  encodePrivateProfile,
  decodePrivateProfile,
  emptyProfile,
} from '../src/client/account-profile/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BackupReader,
  BackupWriter,
} from '../src/client/backup-archive/index.ts';
import {
  backupRecord,
  cleanupTarget,
  groupSnapshotHash,
} from '../src/client/backup-records/index.ts';
import { aesKey, newSecret } from '../src/client/device-keys/index.ts';
import type { VaultAuthority } from '../src/client/vault-authority/index.ts';
import type { BackupRecord } from '../src/client/backup-records/index.ts';
import { sealFile } from '../src/client/attachment-crypto/index.ts';
import { encode } from '../src/shared/account/index.ts';
import { bytesHash } from '../src/shared/vault/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import { createGroupEvent } from '../src/client/groups/transitions.ts';
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
    sign: () =>
      Promise.reject(new Error('Não deve assinar nem autorizar aparelhos.')),
  };
}
function record(value = 'Conteúdo sintético'): BackupRecord {
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
async function archive(
  a: VaultAuthority,
  rows: BackupRecord[],
  omitted: string[] = [],
): Promise<Blob> {
  const writer = await BackupWriter.create(a);
  for (const row of rows) await writer.add(row, () => {});
  return writer.finish(omitted, () => {});
}
await test('grupos e mídias reabrem como cópias independentes sem alvos de limpeza pessoal; faltas bloqueiam completude', async () => {
  const a = fixture(),
    participant = await groupParticipant({
      accountId: a.session.accountId,
      deviceId: a.session.deviceId,
    }),
    state = await createGroupEvent(participant.authority, crypto.randomUUID());
  const data = { state, title: 'Grupo sintético', profileSequence: 1 },
    group: BackupRecord = {
      type: 'group',
      id: crypto.randomUUID(),
      hash: await groupSnapshotHash(data),
      ...data,
    };
  const sealed = await sealFile(new Uint8Array([4, 5, 6])),
    id = crypto.randomUUID(),
    text = JSON.stringify({
      version: 1,
      name: 'teste.bin',
      type: 'application/octet-stream',
      caption: 'Foto sintética',
      image: false,
      file: sealed.file,
      thumbnail: null,
    });
  const message: BackupRecord = {
    type: 'group-message',
    id,
    hash: 'b'.repeat(64),
    groupId: state.groupId,
    sequence: 1,
    epoch: 1,
    sender: a.session.accountId,
    own: true,
    kind: 'attachment',
    text,
  };
  const media: BackupRecord = {
    type: 'group-media',
    id: sealed.file.ref.id,
    hash: sealed.file.ref.hash,
    groupId: state.groupId,
    message: id,
    thumbnail: false,
    bytes: encode(sealed.bytes),
  };
  for (const row of [group, message, media])
    assert.equal(cleanupTarget(row, new Set()), null);
  const missing = await BackupReader.open(
    a,
    await archive(a, [group, message]),
    () => {},
  );
  assert.equal(missing.complete, false);
  const complete = await BackupReader.open(
    a,
    await archive(a, [group, message, media]),
    () => {},
  );
  assert.equal(complete.complete, true);
  assert.deepEqual(complete.targets, []);
  assert.deepEqual(await complete.read(1), message);
  assert.deepEqual(await complete.read(2), media);
  await assert.rejects(
    BackupReader.open(
      a,
      await archive(a, [{ ...group, title: 'Nome adulterado' }]),
      () => {},
    ),
  );
  const wrong = await BackupReader.open(
    a,
    await archive(a, [
      group,
      message,
      { ...media, groupId: crypto.randomUUID() },
    ]),
    () => {},
  );
  assert.equal(wrong.complete, false);
  await assert.rejects(
    BackupReader.open(
      a,
      await archive(a, [group, { ...message, own: false }, media]),
      () => {},
    ),
  );
  assert.throws(() => backupRecord({ ...message, type: 'status' }));
});
await test('arquivo acima de 3 MB abre em leitor limpo com chave histórica da conta; não depende de rede', async () => {
  const a = fixture(),
    rows = [record('x'.repeat(2_900_000)), record('y'.repeat(2_900_000))];
  const file = await archive(a, rows, ['Mídia não selecionada']);
  assert.ok(file.size > 3_000_000);
  const newer = {
    ...a,
    epoch: 2,
    session: { ...a.session, deviceId: crypto.randomUUID() },
  };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.reject(new Error('Arquivo não pode ir à rede.'));
  try {
    const reader = await BackupReader.open(newer, file, () => {});
    assert.equal(reader.report.records.length, 2);
    assert.deepEqual(reader.report.omitted, ['Mídia não selecionada']);
    assert.deepEqual(await reader.read(0), rows[0]);
    assert.deepEqual(await reader.read(1), rows[1]);
    const again = await BackupReader.open(newer, file, () => {});
    assert.equal(again.report.records.length, 2);
    reader.close();
    await assert.rejects(reader.read(0), /fechado/u);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
await test('chave incorreta, outra conta, adulteração, truncamento e bytes extras são rejeitados', async () => {
  const a = fixture(),
    file = await archive(a, [record()]);
  await assert.rejects(
    BackupReader.open({ ...a, key: () => aesKey(newSecret()) }, file, () => {}),
  );
  await assert.rejects(
    BackupReader.open(
      { ...a, session: { ...a.session, accountId: crypto.randomUUID() } },
      file,
      () => {},
    ),
  );
  const bytes = new Uint8Array(await file.arrayBuffer());
  bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1;
  await assert.rejects(BackupReader.open(a, new Blob([bytes]), () => {}));
  await assert.rejects(BackupReader.open(a, file.slice(0, -1), () => {}));
  await assert.rejects(
    BackupReader.open(a, new Blob([file, new Uint8Array([0])]), () => {}),
  );
  const unsupported = new Uint8Array(await file.arrayBuffer());
  unsupported[7] = 50;
  await assert.rejects(BackupReader.open(a, new Blob([unsupported]), () => {}));
});
await test('permissões extras, duplicação, registros grandes e cancelamento não produzem backup válido', async () => {
  const a = fixture(),
    row = record(),
    writer = await BackupWriter.create(a);
  assert.throws(() => backupRecord({ ...row, authorizedDevices: ['intruso'] }));
  assert.throws(() => backupRecord(record('x'.repeat(3_000_001))));
  await writer.add(row, () => {});
  await assert.rejects(
    writer.add(row, () => {}),
    /repetidos/u,
  );
  writer.abort();
  await assert.rejects(writer.finish([], () => {}));
  const cancelled = await archive(a, [record()]);
  await assert.rejects(
    BackupReader.open(a, cancelled, () => {
      throw new Error('cancelado');
    }),
    /cancelado/u,
  );
});
await test('limpeza exige todas as mídias do descritor presentes e autenticadas; relatório mantém omissões', async () => {
  const a = fixture(),
    sealed = await sealFile(new Uint8Array([3, 4, 5])),
    id = crypto.randomUUID();
  const content = {
    version: 1,
    name: 'teste.bin',
    type: 'application/octet-stream',
    caption: 'Sintético',
    image: false,
    file: sealed.file,
    thumbnail: null,
  };
  const message: BackupRecord = {
    type: 'message',
    id,
    hash: 'b'.repeat(64),
    peer: crypto.randomUUID(),
    own: false,
    kind: 'attachment',
    text: JSON.stringify(content),
  };
  assert.equal(cleanupTarget(message, new Set()), null);
  const without = await BackupReader.open(
    a,
    await archive(a, [message], ['Arquivo omitido']),
    () => {},
  );
  assert.equal(without.targets.length, 0);
  assert.equal(without.complete, false);
  const missing = await BackupReader.open(
    a,
    await archive(a, [message]),
    () => {},
  );
  assert.equal(missing.complete, false);
  const media: BackupRecord = {
    type: 'media',
    id: sealed.file.ref.id,
    hash: sealed.file.ref.hash,
    message: id,
    thumbnail: false,
    bytes: encode(sealed.bytes),
  };
  assert.equal(await bytesHash(sealed.bytes), media.hash);
  const complete = await BackupReader.open(
    a,
    await archive(a, [message, media]),
    () => {},
  );
  assert.deepEqual(complete.targets, [
    { kind: 'message', id, hash: message.hash },
  ]);
  assert.equal(complete.complete, true);
});

await test('texto válido com controles não explode por escapes JSON; mídia com hash falso é rejeitada', async () => {
  const a = fixture(),
    row = record('\u0001'.repeat(2_000_000));
  const file = await archive(a, [row]);
  const reader = await BackupReader.open(a, file, () => {});
  assert.deepEqual(await reader.read(0), row);
  const media: BackupRecord = {
    type: 'media',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    message: crypto.randomUUID(),
    thumbnail: false,
    bytes: encode(new Uint8Array([1, 2])),
  };
  await assert.rejects(
    BackupReader.open(a, await archive(a, [media]), () => {}),
    /adulterada/u,
  );
});

await test('backup independente conserva voz v2 e mídia de 90 segundos para outro aparelho, sem rede', async () => {
  const { voiceWav } = await import('../src/client/voice-audio/index.ts');
  const { attachmentContent } =
    await import('../src/shared/attachments/index.ts');
  const { validateVoice, voiceRate, voiceSamples } =
    await import('../src/shared/voice/index.ts');
  const { openFile } = await import('../src/client/attachment-crypto/index.ts');
  const a = fixture(),
    bytes = voiceWav([new Int16Array(voiceSamples).fill(100)]),
    sealed = await sealFile(bytes),
    id = crypto.randomUUID();
  const content = attachmentContent({
    version: 2,
    voice: { samples: voiceSamples, sampleRate: voiceRate },
    name: 'voz.wav',
    type: 'audio/wav',
    caption: '',
    image: false,
    thumbnail: null,
    file: sealed.file,
  });
  const rows: BackupRecord[] = [
    {
      type: 'message',
      id,
      hash: 'a'.repeat(64),
      peer: crypto.randomUUID(),
      own: false,
      kind: 'attachment',
      text: JSON.stringify(content),
    },
    {
      type: 'media',
      id: sealed.file.ref.id,
      hash: sealed.file.ref.hash,
      message: id,
      thumbnail: false,
      bytes: encode(sealed.bytes),
    },
  ];
  const file = await archive(a, rows),
    opened = await BackupReader.open(
      { ...a, session: { ...a.session, deviceId: crypto.randomUUID() } },
      file,
      () => {},
    );
  try {
    const message = await opened.read(0),
      media = await opened.read(1);
    assert.equal(message.type, 'message');
    assert.equal(media.type, 'media');
    if (message.type !== 'message' || media.type !== 'media')
      assert.fail('Registros divergentes');
    const descriptor = attachmentContent(JSON.parse(message.text) as unknown);
    const { base64 } = await import('../src/shared/account/index.ts');
    const audio = await openFile(
      descriptor.file,
      Uint8Array.from(base64(media.bytes, 3_000_000)),
    );
    assert.deepEqual(audio, bytes);
    assert.ok(descriptor.voice);
    validateVoice(audio, descriptor.voice);
  } finally {
    opened.close();
  }
});

await test('backup do perfil conserva foto e preferências com hash, sem conceder permissão', async () => {
  const profile = emptyProfile();
  profile.preferences.backupReminder = true;
  profile.photo = {
    type: 'image/png',
    bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1]),
  };
  const value = encodePrivateProfile(profile),
    hash = await bytesHash(new TextEncoder().encode(value));
  const row: BackupRecord = {
    type: 'account',
    id: crypto.randomUUID(),
    hash,
    value,
  };
  const a = fixture(),
    reader = await BackupReader.open(a, await archive(a, [row]), () => {});
  assert.equal(reader.complete, true);
  assert.deepEqual(await reader.read(0), row);
  assert.deepEqual(decodePrivateProfile(value), profile);
  assert.equal(cleanupTarget(row, new Set()), null);
  await assert.rejects(
    BackupReader.open(
      a,
      await archive(a, [{ ...row, hash: '0'.repeat(64) }]),
      () => {},
    ),
    /perfil|hash|divergente/iu,
  );
});
await test('lote do backup recusa resposta vazia, ordem trocada e falha simulada', () => {
  const id = crypto.randomUUID();
  assert.throws(() => readBackupWindow({ rows: [], recovery: [] }, [id]));
  assert.throws(() =>
    readBackupWindow(
      { rows: [{ id: crypto.randomUUID(), packet: {} }], recovery: [] },
      [id],
    ),
  );
  assert.throws(() =>
    readBackupWindow({ rows: [{ id, unavailable: 403 }], recovery: [] }, [id]),
  );
  const result = readBackupWindow(
    { rows: [{ id, unavailable: 423 }], recovery: [] },
    [id],
  );
  assert.equal(result.count, 1);
  assert.equal(result.packets.size, 0);
});
