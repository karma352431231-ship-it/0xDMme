import { canonical } from '../../shared/devices/index.ts';
import type { RecoveryKey } from '../../shared/messages/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';

export interface SendParticipant {
  accountId: string;
  directory: string;
  revision: number;
  recovery: RecoveryKey;
}
export interface SendMaterial {
  scope: string;
  participants: readonly SendParticipant[];
}
interface Remembered {
  stamp: string;
  material: SendMaterial;
  bytes: number;
}

export function sendAuthorityStamp(a: VaultAuthority): string {
  return canonical([
    a.session.accountId,
    a.session.deviceId,
    a.session.csrf,
    a.directory,
    a.epoch,
  ]);
}

/** Verified encryption inputs only. Admission remains authoritative. No timers or persistence. */
export class SendMaterials {
  private readonly entries = new Map<string, Remembered>();
  private bytes = 0;
  private epoch = 0;
  get generation(): number {
    return this.epoch;
  }
  /** Scheduling hint only. Presence never replaces authority/audience checks. */
  has(key: string): boolean {
    return this.entries.has(key);
  }
  remember(
    authority: VaultAuthority,
    key: string,
    material: SendMaterial,
    generation = this.epoch,
  ): void {
    if (generation !== this.epoch) return;
    this.invalidate(key);
    const copy = structuredClone(material);
    const bytes = new TextEncoder().encode(JSON.stringify(copy)).byteLength;
    if (bytes > 1_048_576) return;
    this.entries.set(key, {
      stamp: sendAuthorityStamp(authority),
      material: copy,
      bytes,
    });
    this.bytes += bytes;
    while (this.entries.size > 32 || this.bytes > 1_048_576)
      this.invalidate(this.entries.keys().next().value);
  }
  reusable(authority: VaultAuthority, key: string): SendMaterial | null {
    const stored = this.entries.get(key);
    if (!stored) return null;
    if (stored.stamp !== sendAuthorityStamp(authority)) {
      this.invalidate(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, stored);
    return structuredClone(stored.material);
  }
  /** Information already learned from an identity read or signed incoming packet. */
  observed(accountId: string, directory: string): void {
    for (const [key, stored] of this.entries)
      if (
        stored.material.participants.some(
          (p) => p.accountId === accountId && p.directory !== directory,
        )
      )
        this.invalidate(key);
  }
  invalidate(key?: string): void {
    if (key === undefined) {
      this.epoch++;
      this.entries.clear();
      this.bytes = 0;
      return;
    }
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes;
    this.entries.delete(key);
  }
}

/** Stops a reused encryption before any claim or key envelope reaches transport. */
export class FreshSendRequired extends Error {
  readonly code = 'fresh-send-required';
  constructor() {
    super('Send material requires full verification before key distribution.');
  }
}
export function staleSendMaterial(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'stale-send-material'
  );
}
export function refreshSendMaterial(error: unknown): boolean {
  return (
    staleSendMaterial(error) ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error.code === 'fresh-send-required' ||
        error.code === 'fresh-own-directory-required'))
  );
}
