import { groupQuota } from '../../shared/group-quota/index.ts';
import { object, uuid, encode } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { groupEvent, groupEventHash } from '../../shared/groups/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { VaultAccess, VaultAuthority } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { groupSnapshotHash, recordKey } from '../backup-records/index.ts';
import { backupMessageApi } from '../message-api/index.ts';
import { PeerIdentity } from '../peer-identity/index.ts';
import { openMessageMachine } from '../message-session/index.ts';
import {
  downloadSealedAttachment,
  openStoredAttachment,
  retainAttachment,
} from '../attachments/index.ts';
import type { AttachmentApi } from '../attachments/index.ts';
import { GroupGovernance } from './governance.ts';
import type { GroupState } from './governance.ts';
import { GroupCache, groupCacheScope, groupTitle } from './cache.ts';
import { GroupCatalog } from './catalog.ts';
import type { CatalogGroup } from './catalog.ts';
import { readGroupPage, groupView } from './reader.ts';
import type { GroupView } from './reader.ts';
import { groupAttachmentApi } from './media.ts';
interface ExportContext {
  authority: VaultAuthority;
  api: AttachmentApi;
  governance: GroupGovernance;
  guard: () => void;
  add: (row: BackupRecord) => Promise<void>;
  has: (key: string, hash: string) => boolean;
  omitted: string[];
}
/** Explicit export preserves authorized periods and independent copies without personal cleanup targets. */
export class GroupBackups {
  private readonly access: VaultAccess;
  private readonly identities: PeerIdentity;
  private session: AccountSession | null = null;
  constructor(access: VaultAccess, sync: VaultSync) {
    this.access = access;
    this.identities = new PeerIdentity(sync);
  }
  setSession(value: AccountSession | null): void {
    if (value?.accountId !== this.session?.accountId) this.identities.clear();
    this.session = value;
  }
  async export(input: {
    append: (row: BackupRecord) => Promise<void>;
    known: ReadonlyMap<string, string>;
    guard: () => void;
    omitted: string[];
  }): Promise<number> {
    await this.identities.load();
    let included = 0;
    const known = new Map(input.known);
    const has = (key: string, hash: string) => {
      const old = known.get(key);
      if (old !== undefined && old !== hash)
        throw new Error('Cópia de grupo diverge do histórico preservado.');
      return old !== undefined;
    };
    const add = async (row: BackupRecord) => {
      input.guard();
      const key = recordKey(row),
        old = known.get(key);
      if (old !== undefined) {
        if (old !== row.hash)
          throw new Error('Cópia de grupo diverge do histórico preservado.');
        return;
      }
      await input.append(row);
      known.set(key, row.hash);
      included++;
    };
    await this.access.withVault(false, async (authority) => {
      const api: AttachmentApi = (op, payload) =>
        backupMessageApi(authority, op, payload, input.guard);
      const c: ExportContext = {
        authority,
        api,
        governance: new GroupGovernance(this.identities, api, authority),
        guard: input.guard,
        add,
        has,
        omitted: input.omitted,
      };
      await this.remote(c);
      await this.local(c);
    });
    input.guard();
    await this.identities.save();
    return included;
  }
  private async remote(c: ExportContext): Promise<void> {
    let after: string | null = null;
    do {
      c.guard();
      const page = object(await c.api('group-list', { after })),
        raw = page['items'];
      if (!Array.isArray(raw) || raw.length > 16)
        throw new Error('Lista de grupos inválida.');
      const items: unknown[] = raw;
      for (const item of items) {
        const state = groupEvent(item),
          group = await c.governance.verify(state.groupId);
        if ((await groupEventHash(state)) !== group.head)
          throw new Error(
            'Participação mudou durante o backup. Tente novamente.',
          );
        await this.remoteGroup(c, group);
      }
      after = page['next'] === null ? null : uuid(page['next']);
    } while (after !== null);
  }
  private async remoteGroup(
    c: ExportContext,
    group: GroupState,
  ): Promise<void> {
    const machine = await openMessageMachine(c.authority, (op, payload) =>
      c.api(op, payload),
    );
    try {
      const context = { ...c, group, machine, identities: this.identities },
        scope = { groupId: group.state.groupId, head: group.head };
      await readGroupPage(context, await c.api('group-profile', scope));
      let before: number | null = null;
      do {
        c.guard();
        const raw = object(
            await c.api('group-message-recent', { ...scope, before }),
          ),
          page = await readGroupPage(context, raw);
        recordUnavailable(raw, page.views, c.omitted);
        if (page.receipts.length)
          await c.api('group-message-received', {
            ...scope,
            items: page.receipts,
          });
        for (const view of page.views) await writeView(c, group, view);
        before =
          raw['next'] === null
            ? null
            : integer(raw['next'], Number.MAX_SAFE_INTEGER);
      } while (before !== null);
      const current = groupEvent(
        await c.api('group-current', { groupId: group.state.groupId }),
      );
      if ((await groupEventHash(current)) !== group.head)
        throw new Error(
          'Participação mudou durante o backup. Tente novamente.',
        );
      await writeSummary(c, await cachedSummary(c.authority, group));
    } finally {
      machine.close();
    }
  }
  private async local(c: ExportContext): Promise<void> {
    let after: string | null = null;
    const catalog = new GroupCatalog(c.authority);
    do {
      c.guard();
      const page = await catalog.page(after);
      for (const summary of page.items) await this.localGroup(c, summary);
      after = page.next;
    } while (after !== null);
  }
  private async localGroup(
    c: ExportContext,
    summary: CatalogGroup,
  ): Promise<void> {
    await writeSummary(c, summary);
    const cache = new GroupCache(c.authority, summary.state.groupId),
      group = {
        state: summary.state,
        head: await groupEventHash(summary.state),
      };
    let after: string | null = null;
    do {
      c.guard();
      const page = await cache.page('message:', after);
      for (const row of page.items)
        await writeView(c, group, { ...groupView(row.value), localOnly: true });
      after = page.next;
    } while (after !== null);
  }
}
async function cachedSummary(
  authority: VaultAuthority,
  group: GroupState,
): Promise<CatalogGroup> {
  const raw = await new GroupCache(authority, group.state.groupId).get(
    'profile',
  );
  const summary = {
    state: group.state,
    title:
      raw === null
        ? `Grupo ${group.state.groupId.slice(0, 8)}`
        : groupTitle(raw),
    profileSequence:
      raw === null
        ? 0
        : integer(object(raw)['sequence'], Number.MAX_SAFE_INTEGER),
  };
  await new GroupCatalog(authority).save(summary);
  return summary;
}
async function writeSummary(
  c: ExportContext,
  summary: CatalogGroup,
): Promise<void> {
  const data = {
      state: summary.state,
      title: summary.title,
      profileSequence: summary.profileSequence ?? 0,
    },
    hash = await groupSnapshotHash(data),
    id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  await c.add({ type: 'group', id, hash, ...data });
}
function recordUnavailable(
  raw: Record<string, unknown>,
  views: readonly GroupView[],
  omitted: string[],
): void {
  if (!Array.isArray(raw['items']))
    throw new Error('Mensagens de grupo inválidas.');
  const rows: unknown[] = raw['items'];
  for (const row of rows) {
    const id = uuid(object(row)['id']);
    if (!views.some((v) => v.id === id))
      omitted.push(`group-message:${id} indisponível`);
  }
}
async function writeView(
  c: ExportContext,
  group: GroupState,
  view: GroupView,
): Promise<void> {
  if (
    view.groupId !== group.state.groupId ||
    view.own !== (view.sender === c.authority.session.accountId)
  )
    throw new Error('Cópia de outro grupo ou conta.');
  const { id, hash, groupId, sequence, epoch, sender, own, kind, text } = view;
  await c.add({
    type: 'group-message',
    id,
    hash,
    groupId,
    sequence,
    epoch,
    sender,
    own,
    kind,
    text,
  });
  if (kind !== 'attachment') return;
  await writeMedia(c, group, view);
}
async function writeMedia(
  c: ExportContext,
  group: GroupState,
  view: GroupView,
): Promise<void> {
  const { text, id, groupId } = view;
  const content = attachmentContent(JSON.parse(text) as unknown);
  for (const thumbnail of [false, true]) {
    const file = thumbnail ? content.thumbnail : content.file;
    if (!file) continue;
    if (c.has(`group-media:${file.ref.id}`, file.ref.hash)) continue;
    let bytes: Uint8Array<ArrayBuffer>;
    try {
      const input = {
        account: groupCacheScope(c.authority.session.accountId, groupId),
        message: id,
        file,
        thumbnail,
        image: thumbnail || content.image,
        api: view.localOnly
          ? () => Promise.reject(new Error('Mídia ausente na cópia local.'))
          : groupAttachmentApi(group, c.api),
        snapshot: null,
        guard: c.guard,
        budget: groupQuota,
      };
      await retainAttachment(input.account, id, input.budget);
      bytes = await downloadSealedAttachment(input);
      const opened = await openStoredAttachment(
        file,
        bytes,
        thumbnail,
        thumbnail || content.image,
      );
      opened.fill(0);
      c.guard();
    } catch {
      c.guard();
      c.omitted.push(`group-media:${file.ref.id} indisponível`);
      continue;
    }
    try {
      await c.add({
        type: 'group-media',
        id: file.ref.id,
        hash: file.ref.hash,
        groupId,
        message: id,
        thumbnail,
        bytes: encode(bytes),
      });
    } finally {
      bytes.fill(0);
    }
  }
}
