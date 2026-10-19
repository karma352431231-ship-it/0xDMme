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
    throw new AccountError(409, 'Message missing or does not match.');
}

interface CleanupAuthority {
  contacts: ContactStore;
  authority: ContactAuthority;
  items: BackupTarget[];
  socialParticipants: (
    client: pg.PoolClient,
    account: string,
    ids: string[],
  ) => Promise<string[]>;
}
interface Participants {
  sender: string;
  recipient: string;
}

/** One ordered owner set for a mixed signed selection; effects remain one transaction. */
export function withPersonalCleanupAuthority<T>(
  input: CleanupAuthority,
  work: (client: pg.PoolClient, participants: readonly string[]) => Promise<T>,
): Promise<T> {
  const { contacts, authority, items, socialParticipants } = input;
  const account = authority.session.accountId;
  const rows = async (client: pg.PoolClient) =>
    (
      await client.query<Participants>(
        'SELECT sender,recipient FROM hash_talk.message_packets WHERE id=ANY($1::uuid[]) AND (sender=$2 OR recipient=$2)',
        [
          items
            .filter((item) => item.kind === 'message')
            .map((item) => item.id),
          account,
        ],
      )
    ).rows;
  const participantsFor = async (client: pg.PoolClient) => {
    const privateRows = await rows(client);
    const socialOwners = await socialParticipants(
      client,
      account,
      items.filter((item) => item.kind === 'dm-message').map((item) => item.id),
    );
    return [
      ...privateRows.flatMap((row) => [row.sender, row.recipient]),
      ...socialOwners,
    ];
  };
  return contacts.withMessageParticipants(
    authority,
    participantsFor,
    async (client, participants) => {
      // Routing was resolved before waiting. Recheck it after all ordered locks;
      // ownership, hash, presence and prior receipts remain the cleanup owner's job.
      if (
        (await participantsFor(client)).some(
          (owner) => !participants.includes(owner),
        )
      )
        throw new AccountError(409, 'Message missing or does not match.');
      return work(client, participants);
    },
  );
}
