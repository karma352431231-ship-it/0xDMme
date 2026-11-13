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
  context: GroupContext;
  identities: PeerIdentity;
  after: string | null;
  machine: <T>(work: (machine: MessageCrypto) => Promise<T>) => Promise<T>;
}
/** Bounded, currently authorized summaries only. No outbox, invitations or
 * selected-history work is part of reading a directory page. */
export async function readGroupDirectory(input: DirectoryRead) {
  const { context } = input;
  const mode = object(await context.api('group-mode', {}))['mode'];
  if (mode !== 'configured') throw new Error('Invalid group mode.');
  const page = object(await context.api('group-list', { after: input.after }));
  if (!Array.isArray(page['items']) || page['items'].length > 16)
    throw new Error('Invalid group list.');
  const rows: unknown[] = page['items'];
  const next = page['next'] === null ? null : uuid(page['next']);
  const entries: GroupSummary[] = [];
  if (rows.length)
    await input.machine(async (machine) => {
      for (const row of rows) {
        const raw = groupEvent(row);
        const group = await context.governance.verify(raw.groupId);
        if ((await groupEventHash(raw)) !== group.head)
          throw new Error('The group list changed. Refresh it.');
        entries.push(
          await readGroupSummary({
            context,
            group,
            machine,
            identities: input.identities,
          }),
        );
      }
    });
  return { entries, next };
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
