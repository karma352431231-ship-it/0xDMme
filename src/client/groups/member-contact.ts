import { t } from '../../shared/i18n/index.ts';
import type { WalletContact } from '../../shared/contacts/index.ts';
import type { GroupMemberWallets } from './member-wallets.ts';

/** Same wallet flow as Contacts for a co-member; members who accept
 * invitations only get a notice instead (owner decision 23/10/2026). */
export async function offerMemberContact(input: {
  wallets: GroupMemberWallets;
  member: { groupId: string; account: string; alias: string };
  add: (wallet: WalletContact, alias: string) => void;
}): Promise<void> {
  const { groupId, account, alias } = input.member;
  const wallet = await input.wallets.contact(groupId, account);
  if (wallet === undefined)
    throw new Error('Could not check this member. Try again.');
  if (wallet === null) {
    window.alert(
      t(
        'This member accepts conversation requests by invitation only. Ask them for an invitation link.',
      ),
    );
    return;
  }
  input.add(wallet, alias);
}
/** Makes a message author's name open the member contact offer. */
export function memberContactTrigger(
  author: HTMLElement,
  name: string,
  open: () => void,
): void {
  author.classList.add('group-sender-action');
  author.tabIndex = 0;
  author.setAttribute('role', 'button');
  author.setAttribute('aria-label', t('Add {0} to contacts', [name]));
  author.addEventListener('click', open);
  author.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  });
}
