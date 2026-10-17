import type pg from 'pg';
import { AccountError } from '../../shared/account/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { ContactAuthority, ContactStore } from './contacts.ts';

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
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const { contacts, authority, items } = input;
  if (!items.every((item) => item.kind === 'message'))
    return contacts.withMessageAuthority(authority, work);
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
      return work(client);
    },
  );
}
