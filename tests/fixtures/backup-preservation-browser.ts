import {
  BackupReader,
  BackupWriter,
} from '../../src/client/backup-archive/index.ts';
import {
  cacheDmRecord,
  forgetDmRecord,
  historyRecord,
  importHistory,
} from '../../src/client/local-history/index.ts';
import { aesKey, newSecret } from '../../src/client/device-keys/index.ts';
import type { BackupRecord } from '../../src/client/backup-records/index.ts';
import type { VaultAuthority } from '../../src/client/vault-authority/index.ts';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function authority(): VaultAuthority {
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
    sign: () => Promise.reject(new Error('No remote signer in this probe.')),
  };
}
function message(): Extract<BackupRecord, { type: 'dm-message' }> {
  return {
    type: 'dm-message',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    self: crypto.randomUUID(),
    peer: { id: crypto.randomUUID(), handle: 'synthetic_peer', avatar: null },
    own: true,
    sequence: 1,
    kind: 'text',
    media: null,
    text: 'Synthetic independent backup content',
  };
}
const writers = new Set<BackupWriter>();
async function archive(a: VaultAuthority, records: BackupRecord[]) {
  const writer = await BackupWriter.create(a);
  writers.add(writer);
  try {
    for (const record of records) await writer.add(record, () => {});
    return await BackupReader.open(
      a,
      await writer.finish([], () => {}),
      () => {},
    );
  } catch (error: unknown) {
    writer.abort();
    throw error;
  }
}
async function importCount(account: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open('0xdmme-local-history');
    opening.onerror = () =>
      reject(opening.error ?? new Error('History database could not open.'));
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('records', 'readonly');
      const query = tx.objectStore('records').index('source').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(
          (query.result as { account: string }[]).filter(
            (row) => row.account === account,
          ).length,
        );
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('History transaction failed.'));
      };
    };
  });
}
async function markLegacyImport(
  a: VaultAuthority,
  hash: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const opening = indexedDB.open('0xdmme-local-history');
    opening.onerror = () =>
      reject(opening.error ?? new Error('History database could not open.'));
    opening.onsuccess = () => {
      const db = opening.result;
      const tx = db.transaction('imports', 'readwrite');
      tx.objectStore('imports').put({
        account: a.session.accountId,
        source: hash,
        ready: true,
        pending: 1,
        created: Date.now(),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error('History transaction failed.'));
      };
    };
  });
}
/** Real IndexedDB and archive encryption; no wallet, backend or network adapter. */
export async function backupPreservationProbe(): Promise<string[]> {
  const a = authority(),
    record = message(),
    reader = await archive(a, [record]);
  const checks: string[] = [];
  try {
    await cacheDmRecord(a, record);
    await importHistory(a, reader, () => {});
    const count = await importCount(a.session.accountId);
    await importHistory(a, reader, () => {});
    assert(
      (await importCount(a.session.accountId)) === count,
      'Duplicate import changed the record count.',
    );
    await forgetDmRecord(a.session.accountId, record.id);
    assert(
      (await historyRecord(a, 'dm-message', record.id))?.hash === record.hash,
      'Personal cleanup removed the independently imported DM.',
    );
    checks.push('Independent imported DM survives automatic cache cleanup.');
    const recovered = message(),
      legacy = await archive(a, [recovered]);
    try {
      await markLegacyImport(a, legacy.hash);
      await importHistory(a, legacy, () => {});
      assert(
        (await historyRecord(a, 'dm-message', recovered.id))?.hash ===
          recovered.hash,
        'Legacy ready marker prevented repair from the actual file.',
      );
      checks.push(
        'Legacy incomplete import is repaired by validating the same file.',
      );
    } finally {
      legacy.close();
    }
    const partial = message(),
      other = message(),
      interrupted = await archive(a, [partial, other]);
    let calls = 0,
      failed = false;
    try {
      await importHistory(a, interrupted, () => {
        if (++calls === 3) throw new Error('Synthetic interruption.');
      });
    } catch {
      failed = true;
    } finally {
      interrupted.close();
    }
    assert(failed, 'Import interruption did not fail.');
    assert(
      (await historyRecord(a, 'dm-message', partial.id)) === null,
      'Interrupted import published partial history.',
    );
    assert(
      (await historyRecord(a, 'dm-message', record.id))?.hash === record.hash,
      'Interrupted import damaged a previous completed import.',
    );
    checks.push(
      'Interrupted import preserves prior history without publishing partial records.',
    );
    return checks;
  } finally {
    reader.close();
    for (const writer of writers) writer.abort();
    writers.clear();
  }
}
