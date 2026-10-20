import type { AddressBook, Contacts } from '../contacts/index.ts';

/** Match the private chat's local alias, then the verified card/account name.
 * Only one already-approved contact and its own encrypted agenda entity load. */
export async function directNotificationSender(input: {
  peer: string;
  profileName: string | undefined;
  contacts: Pick<Contacts, 'approvedPeer'>;
  book: Pick<AddressBook, 'aliasFor'>;
}): Promise<string> {
  const peer = await input.contacts.approvedPeer(input.peer);
  if (peer.accountId !== input.peer)
    throw new Error('Notification sender changed.');
  const alias = await input.book.aliasFor(peer);
  return alias || input.profileName?.trim() || peer.name || peer.address;
}
