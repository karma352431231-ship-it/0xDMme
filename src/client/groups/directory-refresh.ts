import { object, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { groupEvent, groupEventHash } from '../../shared/groups/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { PeerIdentity } from '../peer-identity/index.ts';
import type { GroupContext } from './authority.ts';
import type { GroupState } from './governance.ts';
import { GroupCache, groupTitle } from './cache.ts';
import { GroupCatalog } from './catalog.ts';
import { readGroupPage } from './reader.ts';

export interface GroupSummary extends GroupState {
  title: string;
  profileSequence?: number;
  localOnly?: boolean;
}
interface DirectoryRead {
  authority: <T>(work: (context: GroupContext) => Promise<T>) => Promise<T>;
  identities: PeerIdentity;
  after: string | null;
  machine: <T>(
    context: GroupContext,
    work: (machine: MessageCrypto) => Promise<T>,
  ) => Promise<T>;
}
/** Bounded, currently authorized summaries only. No outbox, invitations or
 * selected-history work is part of reading a directory page. */
export async function readGroupDirectory(input: DirectoryRead) {
  const page = await input.authority((context) =>
    readGroupDirectoryPage(context, input.after),
  );
  const entries: GroupSummary[] = [];
  for (const raw of page.groups)
    entries.push(
      await input.authority((context) =>
        input.machine(context, (machine) =>
          readGroupDirectoryEntry({
            context,
            identities: input.identities,
            machine,
            raw,
          }),
        ),
      ),
    );
  return { entries, next: page.next };
}

/** List transport and validation have no SDK dependency. Each entry may then
 * use a separate exclusive authority turn, allowing queued preview confirmations. */
export async function readGroupDirectoryPage(
  context: GroupContext,
  after: string | null,
) {
  const mode = object(await context.api('group-mode', {}))['mode'];
  if (mode !== 'configured') throw new Error('Invalid group mode.');
  const page = object(await context.api('group-list', { after }));
  if (!Array.isArray(page['items']) || page['items'].length > 16)
    throw new Error('Invalid group list.');
  const groups = page['items'].map((row: unknown) => groupEvent(row));
  const next = page['next'] === null ? null : uuid(page['next']);
  if (next !== null && (next === after || !groups.length))
    throw new Error('Group list pagination does not match.');
  return { groups, next };
}
export async function readGroupDirectoryEntry(input: {
  context: GroupContext;
  identities: PeerIdentity;
  machine: MessageCrypto;
  raw: ReturnType<typeof groupEvent>;
}): Promise<GroupSummary> {
  const group = await input.context.governance.verify(input.raw.groupId);
  if ((await groupEventHash(input.raw)) !== group.head)
    throw new Error('The group list changed. Refresh it.');
  return readGroupSummary({ ...input, group });
}

export async function readGroupSummary(input: {
  context: GroupContext;
  group: GroupState;
  machine: MessageCrypto;
  identities: PeerIdentity;
}): Promise<GroupSummary> {
  const { context, group, machine, identities } = input;
  await readGroupPage(
    { ...context, group, machine, identities },
    await context.api('group-profile', {
      groupId: group.state.groupId,
      head: group.head,
    }),
  );
  const cached = await new GroupCache(
    context.authority,
    group.state.groupId,
  ).get('profile');
  const summary: GroupSummary = {
    ...group,
    profileSequence:
      cached === null
        ? 0
        : integer(object(cached)['sequence'], Number.MAX_SAFE_INTEGER),
    title:
      cached === null
        ? t('Group {0}', [group.state.groupId.slice(0, 8)])
        : groupTitle(cached),
  };
  await new GroupCatalog(context.authority).save(summary);
  return summary;
}
