import { encode, object } from '../../shared/account/index.ts';
import { SocialDms } from '../social-dm/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { recordKey } from '../backup-records/index.ts';
import { socialAttachment } from '../../shared/social-media/index.ts';
export class SocialBackups {
  private readonly dms: SocialDms;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.dms = new SocialDms(access, sync);
  }
  setSession(session: AccountSession | null): void {
    this.dms.setSession(session);
  }
  cancel(): void {
    this.dms.cancel();
  }
  async export(input: {
    append: (record: BackupRecord) => Promise<void>;
    known: ReadonlyMap<string, string>;
    guard: () => void;
    omitted: string[];
    exported: Map<string, string>;
  }): Promise<number> {
    const known = new Map(input.known);
    const has = (key: string, hash: string) => {
      const previous = known.get(key);
      if (previous !== undefined && previous !== hash)
        throw new Error('Cópia de DM diverge do histórico preservado.');
      return previous !== undefined;
    };
    let count = 0;
    const add = async (row: BackupRecord) => {
      input.guard();
      const key = recordKey(row);
      if (has(key, row.hash)) return;
      await input.append(row);
      known.set(key, row.hash);
      count++;
    };
    const snapshot = await this.dms.request('personal-snapshot', {});
    if (snapshot === null) return 0;
    const identity = await this.dms.identityRecord(
      String(object(snapshot)['profile']),
    );
    if (identity) await add(identity);
    if (object(snapshot)['anchor'] === 0) return count;
    let after = 0;
    for (let page = 0; page < 4096; page++) {
      input.guard();
      const rows = await this.dms.historyPage(snapshot, after);
      input.guard();
      input.omitted.push(
        ...rows.unavailable.filter((item) => !known.has(item.split(' ')[0]!)),
      );
      for (const row of rows.items) {
        await add(row);
        input.exported.set(`dm-message:${row.id}`, row.hash);
        await this.media({ ...input, add, has }, row);
      }
      if (rows.next === null) return count;
      if (rows.next <= after)
        throw new Error('Página histórica de DMs não avançou.');
      after = rows.next;
    }
    throw new Error(
      'Histórico de DMs excede o orçamento de registros do backup.',
    );
  }
  private async media(
    input: {
      add: (record: BackupRecord) => Promise<void>;
      has: (key: string, hash: string) => boolean;
      guard: () => void;
      omitted: string[];
    },
    row: Extract<BackupRecord, { type: 'dm-message' }>,
  ): Promise<void> {
    if (row.kind !== 'attachment' || !row.media) return;
    const content = socialAttachment(
      JSON.parse(row.text) as unknown,
      row.media,
    );
    for (const thumbnail of [false, true]) {
      const file = thumbnail ? content.thumbnail : content.file;
      if (!file) continue;
      if (input.has(`dm-media:${file.ref.id}`, file.ref.hash)) continue;
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = await this.dms.media(row, thumbnail, true);
        input.guard();
      } catch {
        input.guard();
        input.omitted.push(`dm-media:${file.ref.id} indisponível`);
        continue;
      }
      try {
        await input.add({
          type: 'dm-media',
          id: file.ref.id,
          hash: file.ref.hash,
          self: row.self,
          message: row.id,
          thumbnail,
          bytes: encode(bytes),
        });
      } finally {
        bytes.fill(0);
      }
    }
  }
}
