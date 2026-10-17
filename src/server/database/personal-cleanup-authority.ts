import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';

export interface PersonalCleanupTarget {
  hash: string | null;
  sender: string | null;
  recipient: string | null;
  available: boolean;
}
/** One target rule for preflight and the sequential mutation-time recheck. */
export function assertPersonalCleanupTarget(
  target: PersonalCleanupTarget | undefined,
  input: { account: string; hash: string },
): asserts target is PersonalCleanupTarget {
  if (
    !target?.available ||
    target.hash !== input.hash ||
    ![target.sender, target.recipient].includes(input.account)
  )
    throw new AccountError(409, 'Mensagem ausente ou divergente.');
}

interface CleanupAuthority {
  contacts: ContactStore;
  authority: ContactAuthority;
  items: BackupTarget[];
}
interface Participants {
  sender: string;
  recipient: string;
}

/** Private-only batches lock every affected owner before quota/cross-table work.
 * Mixed vault/social batches keep their existing exclusive coordination and one
 * transaction; splitting a selection would lose its atomic cleanup contract. */
export function withPersonalCleanupAuthority<T>(
  input: CleanupAuthority,
  work: (client: pg.PoolClient, participants: readonly string[]) => Promise<T>,
): Promise<T> {
  const { contacts, authority, items } = input;
  if (!items.every((item) => item.kind === 'message'))
    return contacts.withMessageAuthority(authority, (client) =>
      work(client, []),
    );
  const account = authority.session.accountId;
  const rows = async (client: pg.PoolClient) =>
    (
      await client.query<Participants>(
        'SELECT sender,recipient FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (sender=$2 OR recipient=$2)',
        [items.map((item) => item.id), account],
      )
    ).rows;
  return contacts.withMessageParticipants(
    authority,
    async (client) =>
      (await rows(client)).flatMap((row) => [row.sender, row.recipient]),
    async (client, participants) => {
      // Routing was resolved before waiting. Recheck it after all ordered locks;
      // ownership, hash, presence and prior receipts remain the cleanup owner's job.
      if (
        (await rows(client)).some(
          (row) =>
            !participants.includes(row.sender) ||
            !participants.includes(row.recipient),
        )
      )
        throw new AccountError(409, 'Mensagem ausente ou divergente.');
      return work(client, participants);
    },
  );
}
