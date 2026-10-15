import type { Peer, AddressBookEntry } from '../../shared/contacts/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { AddressBook, walletEntity } from './agenda.ts';
import { agendaContact } from './directory.ts';
import type { Contacts } from './controller.ts';

interface RequestContact {
  contacts: Pick<Contacts, 'request'>;
  book: AddressBook;
  sync: Pick<VaultSync, 'heads' | 'isRemoved'>;
  peer: Peer;
  token: string | null;
  alias: string;
  guard: () => void;
}
async function remember(input: RequestContact): Promise<AddressBookEntry> {
  const entity = await walletEntity(input.peer);
  input.guard();
  const heads = input.sync
    .heads(entity)
    .filter((entry) => !input.sync.isRemoved(entry.commit.id));
  if (heads.length > 1)
    throw new Error(
      'Resolve the saved contact versions before saving another request.',
    );
  const prior = heads[0] ? await input.book.open(heads[0].commit.id) : null;
  input.guard();
  if (prior && !prior.contact.removed) return prior.contact;
  const contact = prior
    ? { ...prior.contact, removed: false }
    : { ...agendaContact(input.peer), alias: input.alias || input.peer.name };
  await input.book.save(contact, prior, undefined, input.guard);
  input.guard();
  return contact;
}
/** The request remains committed if the subsequent encrypted bookmark fails.
 * Never repeat the request automatically or overwrite an existing private alias. */
export async function requestContact(
  input: RequestContact,
): Promise<AddressBookEntry> {
  input.guard();
  await input.contacts.request(input.peer.accountId, input.token);
  input.guard();
  try {
    return await remember(input);
  } catch (error: unknown) {
    throw new Error('contacts.request-sent-save-failed', { cause: error });
  }
}
