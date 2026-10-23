import { t } from '../../shared/i18n/index.ts';
import type { Peer, WalletContact } from '../../shared/contacts/index.ts';
import type { GroupController, GroupSummary } from './controller.ts';
import { GroupPeople } from './people.ts';
import type { GroupProfile, MemberLabel } from './people.ts';
import { GroupMemberWallets } from './member-wallets.ts';
import { offerMemberContact } from './member-contact.ts';

interface MemberOptions {
  controller: Pick<GroupController, 'selected' | 'memberWallets'>;
  account: () => string | undefined;
  alias: (account: string) => string;
  peers: () => readonly Peer[];
  profile: GroupProfile;
  addContact: (wallet: WalletContact, alias: string) => void;
  redraw: () => void;
}
/** Shared member labels and wallet discovery have one owner. Settings and
 * message-author photos keep the distinct cache lifetimes already used by main. */
export class GroupMemberPresentation {
  private readonly options: MemberOptions;
  private readonly people: GroupPeople;
  private readonly senders: GroupPeople;
  private readonly wallets: GroupMemberWallets;
  constructor(options: MemberOptions) {
    this.options = options;
    this.people = new GroupPeople(options.profile);
    this.senders = new GroupPeople(options.profile);
    this.wallets = new GroupMemberWallets((groupId, accounts) =>
      options.controller.memberWallets(groupId, accounts),
    );
  }
  clearPanel(): void {
    this.people.clear();
  }
  clearConversation(): void {
    this.senders.clear();
    this.wallets.clear();
  }
  label(account: string): MemberLabel {
    if (account === this.options.account())
      return { text: t('You'), chosen: true };
    const alias = this.options.alias(account);
    if (alias) return { text: alias, chosen: true };
    const wallet = this.wallets.get(account);
    return {
      text:
        this.senders.knownName(account) ||
        this.people.knownName(account) ||
        this.options.peers().find((peer) => peer.accountId === account)?.name ||
        t('Member {0}', [account.slice(0, 8)]),
      chosen: false,
      ...(wallet ? { wallet: wallet.address } : {}),
    };
  }
  name(account: string): string {
    return this.label(account).text;
  }
  identity(account: string, role: string): HTMLElement {
    return this.people.identity(account, this.label(account), role);
  }
  sender(account: string): HTMLElement[] {
    return this.senders.sender(account, this.label(account));
  }
  contactCandidate(account: string): boolean {
    return (
      account !== this.options.account() &&
      !this.options.alias(account) &&
      !this.options.peers().some((peer) => peer.accountId === account)
    );
  }
  load(group: GroupSummary): void {
    if (group.localOnly) return;
    const id = group.state.groupId;
    const accounts = group.state.members
      .map((member) => member.accountId)
      .filter((account) => this.contactCandidate(account));
    if (!accounts.length) return;
    void this.wallets.load(id, accounts).then((changed) => {
      if (!changed || this.options.controller.selected?.state.groupId !== id)
        return;
      this.options.redraw();
    });
  }
  offerContact(account: string): Promise<void> {
    const group = this.options.controller.selected;
    if (!group || group.localOnly) return Promise.resolve();
    return offerMemberContact({
      wallets: this.wallets,
      member: {
        groupId: group.state.groupId,
        account,
        alias:
          this.senders.knownName(account) || this.people.knownName(account),
      },
      add: this.options.addContact,
    });
  }
}
