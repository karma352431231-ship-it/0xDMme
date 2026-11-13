import type { LoadTrace } from '../chat-sync-diagnostics/index.ts';
import { object, uuid } from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import { groupEvent, groupEventHash } from '../../shared/groups/index.ts';
import { t } from '../../shared/i18n/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { IdentityPreparation } from '../peer-identity/index.ts';
import type { VaultWorkOptions } from '../vault-authority/index.ts';
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
  trace?: LoadTrace | undefined;
  guard?: () => void;
  authority: <T>(work: (context: GroupContext) => Promise<T>) => Promise<T>;
  identities: PeerIdentity;
  preparation?: IdentityPreparation | undefined;
  after: string | null;
  machine: <T>(
    context: GroupContext,
    work: (machine: MessageCrypto) => Promise<T>,
  ) => Promise<T>;
}
/** Bounded, currently authorized summaries only. No outbox, invitations or
 * selected-history work is part of reading a directory page. */
export async function readGroupDirectory(input: DirectoryRead) {
  input.guard?.();
  input.trace?.point('vault-request');
  const page = await input.authority(async (context) => {
    input.trace?.point('vault-ready');
    if (input.preparation) {
      const ready = await preparedIdentities(input, context);
      if (!ready) throw new StaleIdentityPreparation();
    }
    return readGroupDirectoryPage(context, input.after, input.trace);
  });
  const entries: GroupSummary[] = [];
  for (const [index, raw] of page.groups.entries())
    entries.push(
      await input.authority(async (context) => {
        const entry = await input.machine(context, (machine) =>
          readGroupDirectoryEntry({
            context,
            identities: input.identities,
            machine,
            raw,
          }),
        );
        // Reuse does not authorize publication. Confirm after the last profile,
        // in its existing exclusive turn, before returning any current rows.
        if (input.preparation && index === page.groups.length - 1) {
          if (!(await input.preparation.confirm(context.authority)))
            throw new Error('Identities are not synchronized yet.');
        }
        return entry;
      }),
    );
  input.guard?.();
  return { entries, next: page.next };
}

class StaleIdentityPreparation extends Error {}

async function preparedIdentities(input: DirectoryRead, context: GroupContext) {
  input.trace?.point('identities-start');
  try {
    return await input.preparation!.hydrate(
      input.identities,
      context.authority,
    );
  } finally {
    input.trace?.point('identities-end');
  }
}

/** A missing/stale handoff uses the ordinary full verification path. A failed
 * authority request is never converted into a cache hit or a stale fallback. */
export async function readPreparedGroupDirectory(
  input: DirectoryRead,
  work: VaultWorkOptions,
) {
  try {
    if (!input.preparation) await loadDirectoryIdentities(input, work);
    try {
      return await readGroupDirectory(input);
    } catch (error: unknown) {
      if (!(error instanceof StaleIdentityPreparation)) throw error;
      await loadDirectoryIdentities(input, work);
      return await readGroupDirectory({ ...input, preparation: undefined });
    }
  } finally {
    input.preparation?.dispose();
  }
}
async function loadDirectoryIdentities(
  input: DirectoryRead,
  work: VaultWorkOptions,
) {
  input.trace?.point('identities-start');
  try {
    await input.identities.load(work);
  } finally {
    input.trace?.point('identities-end');
  }
}

/** List transport and validation have no SDK dependency. Each entry may then
 * use a separate exclusive authority turn, allowing queued preview confirmations. */
export async function readGroupDirectoryPage(
  context: GroupContext,
  after: string | null,
  trace?: LoadTrace,
) {
  trace?.point('group-mode-start');
  let mode: unknown;
  try {
    mode = object(await context.api('group-mode', {}))['mode'];
  } finally {
    trace?.point('group-mode-end');
  }
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
