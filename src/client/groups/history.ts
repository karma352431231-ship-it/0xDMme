import { base64, object } from '../../shared/account/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import {
  attachmentContent,
  fileLimit,
} from '../../shared/attachments/index.ts';
import { bytesHash } from '../../shared/vault/index.ts';
import {
  groupConversationHistory,
  groupHistoryPage,
  historyRecord,
} from '../local-history/index.ts';
import { openStoredAttachment } from '../attachments/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { GroupCache } from './cache.ts';
import { GroupCatalog } from './catalog.ts';
import { groupView } from './reader.ts';
import type { GroupView } from './reader.ts';
export async function importGroupCatalog(
  authority: VaultAuthority,
  guard: () => void,
): Promise<void> {
  let after: string | null = null;
  do {
    guard();
    const page = await groupHistoryPage(authority, after);
    for (const row of page.items) {
      guard();
      await new GroupCatalog(authority).save({
        state: row.state,
        title: row.title,
        profileSequence: row.profileSequence,
      });
    }
    after = page.next;
  } while (after !== null);
}
export async function localGroupViews(
  authority: VaultAuthority,
  groupId: string,
  before: number | null,
): Promise<{ views: GroupView[]; before: number | null }> {
  const cached = await new GroupCache(authority, groupId).messages(before),
    historical = await groupConversationHistory(authority, groupId, before);
  const rows = new Map<string, GroupView>();
  for (const raw of [...cached.items, ...historical]) {
    const view = localCopy(raw, {
      groupId,
      accountId: authority.session.accountId,
    });
    if (view.kind === 'profile') continue;
    const previous = rows.get(view.id);
    if (previous && previous.hash !== view.hash)
      throw new Error('Cópias locais de grupo divergentes.');
    rows.set(view.id, { ...view, localOnly: true });
  }
  const views = [...rows.values()]
    .sort((x, y) => y.sequence - x.sequence)
    .slice(0, 16)
    .reverse();
  return {
    views,
    before:
      cached.next !== null || historical.length === 16 || rows.size > 16
        ? (views[0]?.sequence ?? null)
        : null,
  };
}
function localCopy(
  raw: unknown,
  expected: { groupId: string; accountId: string },
): GroupView {
  const view = groupView({ ...object(raw), unavailableMedia: [] });
  if (
    view.groupId !== expected.groupId ||
    view.own !== (view.sender === expected.accountId)
  )
    throw new Error('Cópia histórica de outra conta ou grupo.');
  return view;
}
export async function restoredGroupMedia(
  authority: VaultAuthority,
  view: GroupView,
  thumbnail: boolean,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const content = attachmentContent(JSON.parse(view.text) as unknown),
    file = thumbnail ? content.thumbnail : content.file;
  if (!file) throw new Error('Prévia ausente.');
  const row = await historyRecord(authority, 'group-media', file.ref.id);
  if (row === null) return null;
  const checked = restoredMediaRecord(row, {
    groupId: view.groupId,
    message: view.id,
    hash: file.ref.hash,
    thumbnail,
  });
  const bytes = Uint8Array.from(base64(checked.bytes, fileLimit));
  try {
    if ((await bytesHash(bytes)) !== file.ref.hash)
      throw new Error('Mídia histórica adulterada.');
    return await openStoredAttachment(
      file,
      bytes,
      thumbnail,
      thumbnail || content.image,
    );
  } finally {
    bytes.fill(0);
  }
}
function restoredMediaRecord(
  row: BackupRecord,
  expected: {
    groupId: string;
    message: string;
    hash: string;
    thumbnail: boolean;
  },
): Extract<BackupRecord, { type: 'group-media' }> {
  if (
    row.type !== 'group-media' ||
    row.groupId !== expected.groupId ||
    row.message !== expected.message ||
    row.hash !== expected.hash ||
    row.thumbnail !== expected.thumbnail
  )
    throw new Error('Mídia restaurada de outro grupo.');
  return row;
}
