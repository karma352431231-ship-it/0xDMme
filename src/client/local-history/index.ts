import { base64, encode } from '../../shared/account/index.ts';
import { backupChunk, backupRecordLimit } from '../../shared/backups/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import {
  serializeRecord,
  deserializeRecord,
  recordKey,
} from '../backup-records/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import type { BackupReader } from '../backup-archive/index.ts';
import { sealLocal, openLocal } from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { dailyViews } from '../daily-text/index.ts';

const historyBudget = 2 * 1024 * 1024 * 1024;
export interface StoredRecord {
  account: string;
  source: string;
  type: BackupRecord['type'];
  id: string;
  hash: string;
  peer: string;
  sequence: number;
  relation: string;
  kind: string;
  bytes: number;
  digest: string;
  size: number;
  chunks: LocalCipher[];
  manifest: LocalCipher;
}
interface ImportState {
  account: string;
  source: string;
  ready: boolean;
  pending: number;
  created: number;
}
function transaction<T>(
  work: (tx: IDBTransaction, done: (value: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('0xdmme-local-history', 1);
    let db: IDBDatabase | undefined,
      tx: IDBTransaction | undefined,
      value: T,
      finished = false;
    const timer = setTimeout(fail, 15_000);
    function fail(): void {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        tx?.abort();
      } catch {
        /* Transaction already ended. */
      }
      db?.close();
      reject(
        new Error(
          'Histórico local não gravado. Confira o espaço disponível no aparelho; o arquivo de backup continua independente.',
        ),
      );
    }
    opening.onerror = fail;
    opening.onblocked = fail;
    opening.onupgradeneeded = () => {
      if (finished) {
        opening.transaction?.abort();
        return;
      }
      const records = opening.result.createObjectStore('records', {
        keyPath: ['account', 'type', 'id', 'source'],
      });
      records.createIndex('source', ['account', 'source']);
      records.createIndex('conversation', [
        'account',
        'peer',
        'sequence',
        'id',
        'source',
      ]);
      records.createIndex('relations', [
        'account',
        'relation',
        'sequence',
        'id',
        'source',
      ]);
      const imports = opening.result.createObjectStore('imports', {
        keyPath: ['account', 'source'],
      });
      imports.createIndex('pending', [
        'account',
        'pending',
        'created',
        'source',
      ]);
      opening.result.createObjectStore('usage');
      opening.result.createObjectStore('peers', {
        keyPath: ['account', 'peer', 'source'],
      });
    };
    opening.onsuccess = () => {
      db = opening.result;
      if (finished) {
        db.close();
        return;
      }
      tx = db.transaction(
        ['records', 'imports', 'usage', 'peers'],
        'readwrite',
        { durability: 'strict' },
      );
      tx.onerror = fail;
      tx.onabort = fail;
      tx.oncomplete = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        db?.close();
        resolve(value);
      };
      try {
        work(tx, (result) => {
          value = result;
        });
      } catch {
        fail();
      }
    };
  });
}
function queryReady(
  tx: IDBTransaction,
  rows: StoredRecord[],
  done: (rows: StoredRecord[]) => void,
): void {
  if (!rows.length) {
    done([]);
    return;
  }
  const sources = [...new Set(rows.map((r) => r.source))];
  const ready = new Set<string>();
  let remaining = sources.length;
  for (const source of sources) {
    const request = tx.objectStore('imports').get([rows[0]!.account, source]);
    request.onsuccess = () => {
      if ((request.result as ImportState | undefined)?.ready) ready.add(source);
      if (--remaining === 0) done(rows.filter((r) => ready.has(r.source)));
    };
  }
}
async function storeRecord(row: StoredRecord): Promise<void> {
  await transaction<void>((tx, done) => {
    const usage = tx.objectStore('usage');
    const get = usage.get(row.account);
    get.onsuccess = () => {
      const used = (get.result as number | undefined) ?? 0;
      if (used + row.size > historyBudget) {
        tx.abort();
        return;
      }
      tx.objectStore('records').put(row);
      if (
        row.type === 'message' &&
        row.peer &&
        !row.relation &&
        row.kind !== 'profile'
      )
        tx.objectStore('peers').put({
          account: row.account,
          peer: row.peer,
          source: row.source,
          id: row.id,
        });
      usage.put(used + row.size, row.account);
      done(undefined);
    };
  });
}
async function stored(
  a: VaultAuthority,
  type: BackupRecord['type'],
  id: string,
): Promise<StoredRecord | null> {
  return transaction((tx, done) => {
    const request = tx
      .objectStore('records')
      .getAll(
        IDBKeyRange.bound(
          [a.session.accountId, type, id, ''],
          [a.session.accountId, type, id, '\uffff'],
        ),
        32,
      );
    request.onsuccess = () =>
      queryReady(tx, request.result as StoredRecord[], (rows) =>
        done(rows[0] ?? null),
      );
  });
}
function recordManifest(row: Omit<StoredRecord, 'manifest' | 'size'>): string {
  return canonical({
    account: row.account,
    source: row.source,
    type: row.type,
    id: row.id,
    hash: row.hash,
    peer: row.peer,
    sequence: row.sequence,
    relation: row.relation,
    kind: row.kind,
    bytes: row.bytes,
    digest: row.digest,
    chunks: row.chunks.map((c) => ({
      id: c.id,
      epoch: c.epoch,
      block: c.block,
    })),
  });
}
export async function sealHistoryRecord(
  a: VaultAuthority,
  source: string,
  record: BackupRecord,
): Promise<StoredRecord> {
  const bytes = serializeRecord(record);
  try {
    const chunks: LocalCipher[] = [];
    for (let start = 0; start < bytes.length; start += backupChunk)
      chunks.push(
        await sealLocal(
          a,
          crypto.randomUUID(),
          encode(bytes.subarray(start, start + backupChunk)),
        ),
      );
    const metadata = {
      account: a.session.accountId,
      source,
      type: record.type,
      id: record.id,
      hash: record.hash,
      peer: record.type === 'message' ? record.peer : '',
      sequence: record.type === 'message' ? (record.sequence ?? 0) : 0,
      relation: record.type === 'message' ? (record.relation?.id ?? '') : '',
      kind: record.type === 'message' ? record.kind : '',
      bytes: bytes.length,
      digest: await bytesHash(bytes),
      chunks,
    };
    const manifest = await sealLocal(
      a,
      crypto.randomUUID(),
      recordManifest(metadata),
    );
    return {
      ...metadata,
      manifest,
      size: chunks.reduce(
        (size, chunk) => size + chunk.bytes.length + 256,
        manifest.bytes.length + 768,
      ),
    };
  } finally {
    bytes.fill(0);
  }
}
function validateStored(row: StoredRecord, account: string): void {
  if (
    row.account !== account ||
    !Number.isSafeInteger(row.bytes) ||
    row.bytes <= 0 ||
    row.bytes > backupRecordLimit ||
    !Array.isArray(row.chunks) ||
    row.chunks.length !== Math.ceil(row.bytes / backupChunk)
  )
    throw new Error('Registro histórico inválido.');
  if (
    row.manifest.bytes.length > 32_000 ||
    row.chunks.some((c) => c.bytes.length > Math.ceil(backupChunk / 3) * 4 + 28)
  )
    throw new Error('Partes históricas excedidas.');
}
function validateIdentity(row: StoredRecord, record: BackupRecord): void {
  if (
    recordKey(record) !== recordKey(row) ||
    record.hash !== row.hash ||
    (record.type === 'message' &&
      (record.peer !== row.peer || (record.sequence ?? 0) !== row.sequence))
  )
    throw new Error('Índice histórico divergente do conteúdo cifrado.');
}
export async function openHistoryRecord(
  a: VaultAuthority,
  row: StoredRecord,
): Promise<BackupRecord> {
  validateStored(row, a.session.accountId);
  if ((await openLocal(a, row.manifest)) !== recordManifest(row))
    throw new Error('Índice histórico não autenticado.');
  const bytes = new Uint8Array(row.bytes);
  let offset = 0;
  try {
    for (const chunk of row.chunks) {
      const part = base64(await openLocal(a, chunk), backupChunk);
      try {
        bytes.set(part, offset);
        offset += part.length;
      } finally {
        part.fill(0);
      }
    }
    if (offset !== bytes.length || (await bytesHash(bytes)) !== row.digest)
      throw new Error('Registro histórico corrompido.');
    const record = deserializeRecord(bytes);
    validateIdentity(row, record);
    return record;
  } finally {
    bytes.fill(0);
  }
}
async function discard(account: string, source: string): Promise<void> {
  let more = true;
  while (more) {
    more = await transaction<boolean>((tx, done) => {
      const records = tx.objectStore('records');
      const query = records
        .index('source')
        .getAll(IDBKeyRange.only([account, source]), 32);
      query.onsuccess = () => {
        const rows = query.result as StoredRecord[];
        const usage = tx.objectStore('usage');
        const get = usage.get(account);
        get.onsuccess = () => {
          for (const row of rows) {
            records.delete([account, row.type, row.id, source]);
            if (row.peer)
              tx.objectStore('peers').delete([account, row.peer, source]);
          }
          usage.put(
            Math.max(
              0,
              ((get.result as number | undefined) ?? 0) -
                rows.reduce((n, r) => n + r.size, 0),
            ),
            account,
          );
          if (rows.length < 32)
            tx.objectStore('imports').delete([account, source]);
          done(rows.length === 32);
        };
      };
    });
  }
}
/** Imports publish only after every record is durably stored. Permissions never enter this store. */
function alreadyImported(
  previous: StoredRecord | null,
  record: BackupRecord,
): boolean {
  if (!previous) return false;
  if (previous.hash !== record.hash)
    throw new Error('Arquivos divergem para o mesmo registro histórico.');
  return true;
}
export async function importHistory(
  a: VaultAuthority,
  reader: BackupReader,
  guard: () => void,
): Promise<void> {
  const account = a.session.accountId,
    source = reader.hash;
  await removeAbandonedImports(account);
  const created = Date.now();
  const existing = await transaction<ImportState | null>((tx, done) => {
    const request = tx.objectStore('imports').get([account, source]);
    request.onsuccess = () =>
      done((request.result as ImportState | undefined) ?? null);
  });
  if (existing?.ready) return;
  if (existing) await discard(account, source);
  await transaction<void>((tx, done) => {
    tx.objectStore('imports').put({
      account,
      source,
      ready: false,
      pending: 0,
      created,
    });
    done(undefined);
  });
  try {
    for (let index = 0; index < reader.report.records.length; index++) {
      guard();
      const record = await reader.read(index);
      const previous = await stored(a, record.type, record.id);
      if (alreadyImported(previous, record)) continue;
      const row = await sealHistoryRecord(a, source, record);
      guard();
      await storeRecord(row);
    }
    guard();
    await transaction<void>((tx, done) => {
      tx.objectStore('imports').put({
        account,
        source,
        ready: true,
        pending: 1,
        created,
      });
      done(undefined);
    });
    window.dispatchEvent(new Event('0xdmme-history-imported'));
  } catch (error: unknown) {
    await discard(account, source);
    throw error;
  }
}
async function removeAbandonedImports(account: string): Promise<void> {
  const abandoned = await transaction<ImportState[]>((tx, done) => {
    const request = tx
      .objectStore('imports')
      .index('pending')
      .getAll(
        IDBKeyRange.bound(
          [account, 0, 0],
          [account, 0, Date.now() - 86400000, '\uffff'],
        ),
        32,
      );
    request.onsuccess = () => done(request.result as ImportState[]);
  });
  for (const pending of abandoned) await discard(account, pending.source);
}
export async function historyRecord(
  a: VaultAuthority,
  type: BackupRecord['type'],
  id: string,
): Promise<BackupRecord | null> {
  const row = await stored(a, type, id);
  return row ? openHistoryRecord(a, row) : null;
}
export async function historyPeers(
  a: VaultAuthority,
  after: string | null,
): Promise<{ items: Peer[]; next: string | null }> {
  const rows = await transaction<{ rows: StoredRecord[]; next: string | null }>(
    (tx, done) => {
      const account = a.session.accountId;
      const request = tx
        .objectStore('peers')
        .openCursor(
          IDBKeyRange.bound(
            after ? [account, after, '\uffff'] : [account],
            [account, '\uffff'],
            after !== null,
          ),
        );
      const peers = new Map<string, StoredRecord>();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          done({ rows: [...peers.values()], next: null });
          return;
        }
        const value = cursor.value as {
          peer: string;
          source: string;
          id: string;
        };
        if (peers.has(value.peer)) {
          cursor.continue();
          return;
        }
        const record = tx
          .objectStore('records')
          .get([account, 'message', value.id, value.source]);
        record.onsuccess = () => {
          if (!record.result) {
            cursor.continue();
            return;
          }
          queryReady(tx, [record.result as StoredRecord], (ready) => {
            if (ready[0]) peers.set(value.peer, ready[0]);
            if (peers.size === 16)
              done({ rows: [...peers.values()], next: value.peer });
            else cursor.continue();
          });
        };
      };
    },
  );
  const items: Peer[] = [];
  for (const row of rows.rows) {
    const record = await openHistoryRecord(a, row);
    if (record.type !== 'message')
      throw new Error('Conversa histórica inválida.');
    items.push(
      record.participant ?? {
        accountId: record.peer,
        name: 'Conversa do backup',
        address: record.peer,
        ecosystem: 'evm',
      },
    );
  }
  return { items, next: rows.next };
}
export async function historyPage(
  a: VaultAuthority,
  after: IDBValidKey | null = null,
  limit = 16,
): Promise<{ rows: BackupRecord[]; next: IDBValidKey | null }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 16)
    throw new Error('Página histórica excedida.');
  const account = a.session.accountId;
  if (
    after !== null &&
    (!Array.isArray(after) || after.length !== 4 || after[0] !== account)
  )
    throw new Error('Página histórica pertence a outra conta.');
  const page = await transaction<{
    rows: StoredRecord[];
    next: IDBValidKey | null;
  }>((tx, done) => {
    const request = tx
      .objectStore('records')
      .getAll(
        IDBKeyRange.bound(
          after ?? [account],
          [account, '\uffff'],
          after !== null,
        ),
        limit + 1,
      );
    request.onsuccess = () => {
      const all = request.result as StoredRecord[],
        rows = all.slice(0, limit),
        last = rows.at(-1);
      queryReady(tx, rows, (ready) =>
        done({
          rows: ready,
          next:
            all.length > limit && last
              ? [account, last.type, last.id, last.source]
              : null,
        }),
      );
    };
  });
  return {
    rows: await Promise.all(page.rows.map((row) => openHistoryRecord(a, row))),
    next: page.next,
  };
}
async function searchablePage(a: VaultAuthority, after: IDBValidKey | null) {
  const account = a.session.accountId;
  if (
    after !== null &&
    (!Array.isArray(after) ||
      after.length !== 4 ||
      after[0] !== account ||
      after[1] !== 'message')
  )
    throw new Error('Busca de outra conta.');
  return transaction<{ rows: StoredRecord[]; next: IDBValidKey | null }>(
    (tx, done) => {
      const request = tx
        .objectStore('records')
        .openCursor(
          IDBKeyRange.bound(
            after ?? [account, 'message'],
            [account, 'message', '\uffff'],
            after !== null,
          ),
        );
      const rows: StoredRecord[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          done({ rows, next: null });
          return;
        }
        if (rows.length === 16) {
          const last = rows.at(-1)!;
          done({ rows, next: [account, 'message', last.id, last.source] });
          return;
        }
        const row = cursor.value as StoredRecord;
        if (row.kind === 'profile' || row.relation) {
          cursor.continue();
          return;
        }
        queryReady(tx, [row], (ready) => {
          rows.push(...ready);
          cursor.continue();
        });
      };
    },
  );
}
function searchCursor(cursor: string | null): IDBValidKey | null {
  if (cursor === null) return null;
  if (cursor.length > 1024) throw new Error('Página de busca inválida.');
  return JSON.parse(cursor) as IDBValidKey;
}
export async function searchHistory(
  a: VaultAuthority,
  query: string,
  cursor: string | null,
  guard: () => void,
) {
  const term = query.normalize('NFKC').toLocaleLowerCase('pt-BR').trim();
  if (!term || term.length > 128)
    throw new Error('Busque entre 1 e 128 caracteres.');
  let after: IDBValidKey | null = searchCursor(cursor);
  const items: {
    id: string;
    peer: string;
    sequence: number;
    excerpt: string;
  }[] = [];
  for (let page = 0; page < 4; page++) {
    guard();
    const result = await searchablePage(a, after);
    const opened = await Promise.all(
      result.rows.map((r) => openHistoryRecord(a, r)),
    );
    const base = opened.filter(
      (r): r is Extract<BackupRecord, { type: 'message' }> =>
        r.type === 'message' && r.kind !== 'profile' && !r.relation,
    );
    const related = await relatedHistory(
      a,
      base.map((r) => r.id),
      guard,
    );
    const rows = dailyViews(
      [...base, ...related].map((r) => ({
        ...r,
        author: r.own ? a.session.accountId : r.peer,
      })),
    );
    for (const row of rows)
      if (
        row.content.text
          .normalize('NFKC')
          .toLocaleLowerCase('pt-BR')
          .includes(term)
      )
        items.push({
          id: row.id,
          peer: row.peer,
          sequence: row.sequence ?? 0,
          excerpt: row.content.text.slice(0, 160),
        });
    after = result.next;
    if (after === null || items.length >= 16) break;
  }
  guard();
  return { items, next: after === null ? null : JSON.stringify(after) };
}
export async function conversationHistory(
  a: VaultAuthority,
  peer: string,
  before: number | null,
): Promise<Extract<BackupRecord, { type: 'message' }>[]> {
  const page = await transaction<StoredRecord[]>((tx, done) => {
    const request = tx
      .objectStore('records')
      .index('conversation')
      .openCursor(
        IDBKeyRange.bound(
          [a.session.accountId, peer, 0],
          [
            a.session.accountId,
            peer,
            before === null ? Number.MAX_SAFE_INTEGER : Math.max(0, before - 1),
            '\uffff',
            '\uffff',
          ],
        ),
        'prev',
      );
    const rows: StoredRecord[] = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || rows.length === 32) {
        queryReady(tx, rows, done);
        return;
      }
      const row = cursor.value as StoredRecord;
      if (row.relation || row.kind === 'profile') {
        cursor.continue();
        return;
      }
      queryReady(tx, [row], (ready) => {
        rows.push(...ready);
        cursor.continue();
      });
    };
  });
  const rows = await Promise.all(page.map((r) => openHistoryRecord(a, r)));
  return rows.filter(
    (row): row is Extract<BackupRecord, { type: 'message' }> =>
      row.type === 'message',
  );
}
export function mergeHistory<
  T extends { id: string; hash: string; sequence?: number; text: string },
>(remote: readonly T[], local: readonly T[]): T[] {
  const rows = new Map(local.map((row) => [row.id, row]));
  for (const row of remote) {
    const old = rows.get(row.id);
    if (old && old.hash !== row.hash)
      throw new Error('Mensagem diverge do histórico validado.');
    if (!old || row.text) rows.set(row.id, row);
  }
  return [...rows.values()].sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0) || a.id.localeCompare(b.id),
  );
}
export async function relatedHistory(
  a: VaultAuthority,
  ids: readonly string[],
  guard: () => void,
): Promise<Extract<BackupRecord, { type: 'message' }>[]> {
  const result: Extract<BackupRecord, { type: 'message' }>[] = [];
  for (const id of ids) {
    let after: IDBValidKey | null = null;
    do {
      guard();
      const page = await transaction<{
        rows: StoredRecord[];
        next: IDBValidKey | null;
      }>((tx, done) => {
        const request = tx
          .objectStore('records')
          .index('relations')
          .getAll(
            IDBKeyRange.bound(
              after ?? [a.session.accountId, id, 0],
              [
                a.session.accountId,
                id,
                Number.MAX_SAFE_INTEGER,
                '\uffff',
                '\uffff',
              ],
              after !== null,
            ),
            33,
          );
        request.onsuccess = () => {
          const all = request.result as StoredRecord[],
            rows = all.slice(0, 32),
            last = rows.at(-1);
          queryReady(tx, rows, (ready) =>
            done({
              rows: ready,
              next:
                all.length > 32 && last
                  ? [last.account, id, last.sequence, last.id, last.source]
                  : null,
            }),
          );
        };
      });
      for (const row of page.rows) {
        guard();
        const record = await openHistoryRecord(a, row);
        result.push(historicalAction(record, id));
      }
      after = page.next;
    } while (after !== null);
  }
  return result;
}

function historicalAction(
  record: BackupRecord,
  id: string,
): Extract<BackupRecord, { type: 'message' }> {
  if (record.type !== 'message' || record.relation?.id !== id)
    throw new Error('Alteração histórica divergente.');
  return record;
}
