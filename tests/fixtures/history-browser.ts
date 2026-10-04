import {
  BackupReader,
  BackupWriter,
} from '../../src/client/backup-archive/index.ts';
import {
  conversationHistory,
  relatedHistory,
  historyRecord,
  historyPeers,
  importHistory,
  searchHistory,
} from '../../src/client/local-history/index.ts';
import type { BackupRecord } from '../../src/client/backup-records/index.ts';
import type { VaultAuthority } from '../../src/client/vault-authority/index.ts';
import {
  sealFile,
  openFile,
} from '../../src/client/attachment-crypto/index.ts';
import { base64, encode } from '../../src/shared/account/index.ts';
import { attachmentContent } from '../../src/shared/attachments/index.ts';
import { encodeDailyText } from '../../src/shared/daily/index.ts';

// Deliberately synthetic account/key; this fixture is never part of the app bundle.
const mode = new URL(location.href).searchParams.get('mode');
const account =
  mode === 'reload'
    ? localStorage.getItem('history-fixture-account')!
    : crypto.randomUUID();
if (mode !== 'reload') localStorage.setItem('history-fixture-account', account);
const peer = '22222222-2222-4222-a222-222222222222';
const key = await crypto.subtle.importKey(
  'raw',
  new Uint8Array(32).fill(42),
  'AES-GCM',
  false,
  ['encrypt', 'decrypt'],
);
const a: VaultAuthority = {
  session: {
    accountId: account,
    deviceId: '33333333-3333-4333-a333-333333333333',
    csrf: '',
  },
  offline: true,
  directory: 'a'.repeat(64),
  epoch: 1,
  events: [],
  key: () => Promise.resolve(key),
  sign: () => Promise.reject(new Error('Sem wallet na leitura local.')),
};
function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function row(sequence: number): Extract<BackupRecord, { type: 'message' }> {
  return {
    type: 'message',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    sequence,
    peer,
    own: true,
    kind: 'text',
    text: 'Mensagem ' + sequence,
    participant: {
      accountId: peer,
      ecosystem: 'evm',
      address: '0x' + '1'.repeat(40),
      name: 'Contato sintético',
    },
  };
}
async function archive(rows: BackupRecord[]) {
  const writer = await BackupWriter.create(a);
  for (const row of rows) await writer.add(row, () => {});
  return { file: await writer.finish([], () => {}), writer };
}
async function prepare(): Promise<void> {
  const rows = Array.from({ length: 40 }, (_, index) => row(index + 1)),
    original = rows[0]!;
  const edit = {
    ...row(80),
    text: encodeDailyText({
      text: 'Editada sintética',
      reply: null,
      forwarded: false,
    }),
    relation: {
      type: 'edit' as const,
      id: original.id,
      hash: original.hash,
      author: account,
    },
  };
  const reaction = {
    ...row(81),
    text: encodeDailyText({ text: '👍', reply: null, forwarded: false }),
    relation: { ...edit.relation, type: 'reaction' as const },
  };
  const sealed = await sealFile(new Uint8Array([3, 4, 5]));
  const attachment = {
    ...row(82),
    kind: 'attachment' as const,
    text: JSON.stringify({
      version: 1,
      name: 'teste.bin',
      type: 'application/octet-stream',
      caption: '',
      image: false,
      file: sealed.file,
      thumbnail: null,
    }),
  };
  const media: BackupRecord = {
    type: 'media',
    id: sealed.file.ref.id,
    hash: sealed.file.ref.hash,
    message: attachment.id,
    thumbnail: false,
    bytes: encode(sealed.bytes),
  };
  localStorage.setItem('history-fixture-media', attachment.id);
  const { file, writer } = await archive([
    ...rows,
    edit,
    reaction,
    attachment,
    media,
  ]);
  const reader = await BackupReader.open(a, file, () => {});
  assert(reader.complete, 'Arquivo completo rejeitado');
  await importHistory(a, reader, () => {});
  await importHistory(a, reader, () => {});
  localStorage.setItem('history-fixture-id', original.id);
  await verify();
  const failed = row(90),
    second = await archive([failed, row(91)]);
  const pending = await BackupReader.open(a, second.file, () => {});
  let calls = 0,
    rejected = false;
  try {
    await importHistory(a, pending, () => {
      if (++calls === 3) throw new Error('Interrompida sintética');
    });
  } catch {
    rejected = true;
  }
  assert(
    rejected && (await historyRecord(a, 'message', failed.id)) === null,
    'Importação interrompida publicou dados',
  );
  writer.abort();
  second.writer.abort();
}
async function verify(): Promise<void> {
  const page = await conversationHistory(a, peer, null);
  assert(
    page.length === 32 &&
      page[0]!.sequence === 82 &&
      page.at(-1)!.sequence === 10,
    'Paginação histórica incorreta',
  );
  const older = await conversationHistory(a, peer, 10);
  assert(older.length === 9, 'Histórico duplicado ou incompleto');
  const original = localStorage.getItem('history-fixture-id');
  assert(original, 'ID sintético ausente');
  const related = await relatedHistory(a, [original], () => {});
  assert(related.length === 2, 'Edição/reação perdida');
  const attachmentId = localStorage.getItem('history-fixture-media');
  assert(attachmentId, 'Anexo sintético ausente');
  const attachment = await historyRecord(a, 'message', attachmentId);
  assert(attachment?.type === 'message', 'Anexo não persistiu');
  const file = attachmentContent(JSON.parse(attachment.text) as unknown).file;
  const media = await historyRecord(a, 'media', file.ref.id);
  assert(media?.type === 'media', 'Mídia não persistiu');
  const bytes = await openFile(file, base64(media.bytes, 3_000_000));
  assert(bytes.length === 3 && bytes[2] === 5, 'Mídia histórica não abre');
  const contacts = await historyPeers(a, null);
  assert(
    contacts.items.length === 1 &&
      contacts.items[0]!.name === 'Contato sintético',
    'Conversa importada indisponível',
  );
  let cursor: string | null = null,
    found = false;
  do {
    const result = await searchHistory(
      a,
      'Editada sintética',
      cursor,
      () => {},
    );
    found ||= result.items.some((r) => r.id === original);
    cursor = result.next;
  } while (cursor);
  assert(found, 'Busca perdeu edição histórica');
}
async function large(): Promise<void> {
  const writer = await BackupWriter.create(a);
  for (let i = 0; i < 26; i++)
    await writer.add(
      {
        type: 'vault',
        id: crypto.randomUUID(),
        hash: 'b'.repeat(64),
        change: {
          version: 1,
          entity: crypto.randomUUID(),
          kind: 'test',
          parents: [],
          label: 'Sintético',
        },
        value: 'x'.repeat(2_000_000),
      },
      () => {},
    );
  const file = await writer.finish([], () => {});
  assert(
    file.size > 64 * 1024 * 1024,
    'Arquivo não ultrapassou o limite anterior',
  );
  const reader = await BackupReader.open(a, file, () => {});
  assert(
    reader.complete && reader.report.records.length === 26,
    'Backup grande não abre por partes',
  );
  writer.abort();
}
const result = document.getElementById('result');
try {
  if (mode === 'reload') await verify();
  else if (mode === 'large') await large();
  else await prepare();
  if (result)
    result.textContent =
      'PASSOU: ' +
      (mode ??
        'importação, deduplicação, paginação, mídia lógica e cancelamento');
} catch (error: unknown) {
  if (result)
    result.textContent =
      'FALHOU: ' + (error instanceof Error ? error.message : 'erro');
}
