import { canonical } from '../../shared/devices/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
import {
  localGet,
  localPutWithin,
  localPage,
  localDelete,
  sealLocal,
  openLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

export interface ReopenLocation {
  scope: string;
  name: string;
  binding: unknown;
  maximum?: number;
  family?: 'preview:';
}
interface Entry {
  cipher: LocalCipher;
  time: number;
}
const maximumEntry = 512 * 1024;
const maximumEntries = 16;
function binding(authority: VaultAuthority, location: ReopenLocation): string {
  return canonical([
    authority.session.accountId,
    authority.session.deviceId,
    authority.directory,
    location.scope,
    location.name,
    location.binding,
  ]);
}
/** Optional encrypted accelerators. A cache miss always returns to the verified
 * reader. This store grants no permission to publish its decrypted candidate. */
export async function readReopen<T>(
  authority: VaultAuthority,
  location: ReopenLocation,
): Promise<T | null> {
  try {
    const row = await localGet<Entry>(location.scope, location.name);
    if (!row || row.cipher.bytes.length > maximumEntry + 1024) return null;
    const value: unknown = JSON.parse(await openLocal(authority, row.cipher));
    const envelope = cacheEnvelope(value);
    return envelope?.binding === binding(authority, location)
      ? (envelope.value as T)
      : null;
  } catch {
    // Corrupt, evicted, unavailable or obsolete cache entries are safe misses.
    return null;
  }
}
export async function writeReopen<T>(
  authority: VaultAuthority,
  location: ReopenLocation,
  value: T,
): Promise<boolean> {
  try {
    const text = JSON.stringify({
      version: 1,
      binding: binding(authority, location),
      value,
    });
    if (new TextEncoder().encode(text).length > maximumEntry) return false;
    if (await unchangedEntry(authority, location, text)) return true;
    const cipher = await sealLocal(authority, crypto.randomUUID(), text);
    await localPutWithin({
      scope: location.scope,
      name: location.name,
      value: { cipher, time: Date.now() },
      size: cipher.bytes.length + 512,
      maximum: location.maximum ?? vaultQuota,
    });
    await trim(location);
    return true;
  } catch {
    // A failed accelerator write does not change the confirmed remote history.
    return false;
  }
}
async function unchangedEntry(
  authority: VaultAuthority,
  location: ReopenLocation,
  text: string,
): Promise<boolean> {
  try {
    const row = await localGet<Entry>(location.scope, location.name);
    return (
      !!row &&
      row.cipher.bytes.length <= maximumEntry + 1024 &&
      (await openLocal(authority, row.cipher)) === text
    );
  } catch {
    return false;
  }
}
function cacheEnvelope(
  value: unknown,
): { binding: string; value: unknown } | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('binding' in value) ||
    typeof value.binding !== 'string' ||
    !('value' in value)
  )
    return null;
  return { binding: value.binding, value: value.value };
}
async function trim(location: ReopenLocation): Promise<void> {
  const prefix = location.family ?? 'reopen:',
    maximum = location.family ? 128 : maximumEntries;
  const rows: { name: string; value: Entry }[] = [];
  let after: string | null = null;
  do {
    const page: {
      items: { name: string; value: Entry }[];
      next: string | null;
    } = await localPage<Entry>(location.scope, prefix, after);
    rows.push(...page.items);
    after = page.next;
  } while (after !== null && rows.length <= maximum);
  if (rows.length <= maximum && after === null) return;
  const oldest = rows
    .filter((row) => row.name !== location.name)
    .sort((a, b) => a.value.time - b.value.time)[0];
  if (oldest) await localDelete(location.scope, oldest.name);
}
