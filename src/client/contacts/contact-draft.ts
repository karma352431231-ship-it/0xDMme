import {
  addressBookEntry,
  walletContactFromAddress,
} from '../../shared/contacts/index.ts';
import type { AddressBookEntry } from '../../shared/contacts/index.ts';
import { walletKey } from './agenda.ts';

/** Whether saving the typed nickname changes the stored record. A request can
 * already have stored the peer; an empty nickname keeps the stored name. */
export function draftChangesStored(
  stored: AddressBookEntry | null,
  alias: string,
): boolean {
  if (!stored || stored.removed) return true;
  return alias !== '' && alias !== stored.alias;
}

/** A typed wallet starts a new record; matching references retain identity and origin. */
export function contactDraft(input: {
  address: string;
  alias: string;
  reference: AddressBookEntry | null;
}): AddressBookEntry {
  const wallet = walletContactFromAddress(input.address);
  const reference =
    input.reference && walletKey(input.reference) === walletKey(wallet)
      ? input.reference
      : null;
  const contact = reference ?? {
    version: 2,
    addedVia: 'wallet',
    ...wallet,
    accountId: null,
    identity: null,
    directory: null,
    identityRevision: 0,
  };
  return addressBookEntry({
    ...contact,
    ...wallet,
    alias: input.alias,
    removed: false,
  });
}
