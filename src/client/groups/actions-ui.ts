import { GroupCreationFields } from './creation-fields.ts';
import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { GroupPeople } from './people.ts';
import type { GroupProfile } from './people.ts';
import { chatIcon } from '../chat-ui/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { Contacts } from '../contacts/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import type { GroupController } from './controller.ts';

interface GroupActionsOptions {
  access: VaultAccess;
  controller: GroupController;
  peers: () => readonly Peer[];
  profile: GroupProfile;
  refresh: () => Promise<void>;
  open: (id: string) => Promise<void>;
  isBusy: () => boolean;
  run: (work: () => Promise<void>) => Promise<void>;
}
/** Creation/admission dialogs have their own lifecycle, outside the chat screen closure. */
export class GroupActionsUi {
  private readonly options: GroupActionsOptions;
  private dialog: HTMLDialogElement | null = null;
  private busy = false;
  private readonly creation = new GroupCreationFields();
  private readonly contacts: Contacts;
  private readonly people: GroupPeople;
  constructor(options: GroupActionsOptions) {
    this.options = options;
    this.contacts = new Contacts(options.access);
    this.people = new GroupPeople(options.profile);
  }
  setSession(session: AccountSession | null): void {
    this.reset();
    this.contacts.setSession(session);
  }
  reset(): void {
    this.people.clear();
    this.creation.reset();
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
  }
  private show(title: string, content: string): HTMLDialogElement {
    if (this.busy || this.options.isBusy())
      throw new Error('Wait for the current update.');
    this.reset();
    const dialog = document.createElement('dialog');
    dialog.className = 'group-dialog group-actions-dialog';
    dialog.setAttribute('aria-labelledby', 'group-dialog-title');
    dialog.innerHTML = t('html.8f97d3de1ea5', [chatIcon('close'), content]);
    const heading = dialog.querySelector('h2');
    if (heading) heading.textContent = title;
    dialog
      .querySelector('[data-close]')
      ?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (this.dialog === dialog) {
        this.people.clear();
        this.creation.reset();
      }
      dialog.remove();
      if (this.dialog === dialog) this.dialog = null;
    });
    document.body.append(dialog);
    this.dialog = dialog;
    dialog.showModal();
    return dialog;
  }
  private async perform(work: () => Promise<void>): Promise<void> {
    const dialog = this.dialog;
    if (!dialog || this.busy || this.options.isBusy()) return;
    this.busy = true;
    this.buttons(dialog, true);
    this.feedback(dialog, t('Processing…'));
    try {
      await this.options.run(async () => {
        try {
          await work();
        } catch (error: unknown) {
          this.feedback(dialog, errorMessage(error));
        }
      });
    } catch (error: unknown) {
      this.feedback(dialog, errorMessage(error));
    } finally {
      this.busy = false;
      this.buttons(dialog, false);
    }
  }
  private buttons(dialog: HTMLDialogElement, disabled: boolean): void {
    for (const button of dialog.querySelectorAll<HTMLButtonElement>('button'))
      button.disabled = disabled;
  }
  private feedback(dialog: HTMLDialogElement, text: string): void {
    const node = dialog.querySelector('[data-feedback]');
    if (node) node.textContent = text;
  }
  showCreate(): void {
    const dialog = this.show(t('Create private group'), t('html.c392c59440f2'));
    this.creation.mount(dialog);
    dialog.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.perform(async () => {
        const title =
          dialog.querySelector<HTMLInputElement>('input[name=title]')?.value ??
          '';
        const profile = await this.creation.read();
        if (this.dialog !== dialog) return;
        const id = await this.options.controller.create(title, profile);
        await this.options.refresh();
        await this.options.open(id);
        dialog.close();
      });
    });
  }
  showJoin(url = ''): void {
    const dialog = this.show(t('Join private group'), t('html.9012ccf1c0d4'));
    const input = dialog.querySelector('input');
    if (input) input.value = url;
    dialog.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.perform(async () => {
        const id = await this.options.controller.admission(
          'join',
          input?.value.trim() ?? '',
        );
        if (typeof id !== 'string') throw new Error('Sign-in not confirmed.');
        await this.options.refresh();
        await this.options.open(id);
        dialog.close();
      });
    });
  }
  showManage(): void {
    const selected = this.options.controller.selected;
    if (!selected || selected.localOnly)
      throw new Error('Open a connected group first.');
    const dialog = this.show(t('Add participants'), t('html.ea146116f72c'));
    dialog
      .querySelector<HTMLInputElement>('[data-contact-search]')
      ?.addEventListener('input', () => this.filterContacts(dialog));
    dialog
      .querySelector('[data-more-contacts]')
      ?.addEventListener('click', () => {
        void this.perform(() => this.loadContacts(dialog, true));
      });
    void this.perform(() => this.loadContacts(dialog, false));
    dialog.querySelector('[data-link]')?.addEventListener('click', () => {
      void this.perform(() => this.share(dialog));
    });
    dialog.querySelector('[data-revoke]')?.addEventListener('click', () => {
      void this.perform(async () => {
        await this.options.controller.admission('revoke');
        const input =
          dialog.querySelector<HTMLInputElement>('[data-invitation]');
        if (input) {
          input.value = '';
          dialog.querySelector<HTMLElement>('[data-invitation-label]')!.hidden =
            true;
        }
        this.feedback(
          dialog,
          t('Link revoked. Existing members remain in the group.'),
        );
      });
    });
  }
  private async loadContacts(
    dialog: HTMLDialogElement,
    more: boolean,
  ): Promise<void> {
    const page = await this.contacts.list('approved', more),
      group = this.options.controller.selected;
    if (this.dialog !== dialog) return;
    if (!group) throw new Error('The group was closed.');
    const list = dialog.querySelector('[data-contacts]');
    if (!more) {
      this.people.clear();
      list?.replaceChildren();
    }
    const eligible = page.items.filter(
      (peer) =>
        !group.state.members.some((m) => m.accountId === peer.accountId),
    );
    for (const peer of eligible) {
      this.contact(
        dialog,
        this.options.peers().find((p) => p.accountId === peer.accountId) ??
          peer,
      );
    }
    this.filterContacts(dialog);
    const next = dialog.querySelector<HTMLElement>('[data-more-contacts]');
    if (next) next.hidden = page.next === null;
    this.contactsFeedback(dialog, page.next);
  }
  private contactsFeedback(
    dialog: HTMLDialogElement,
    next: string | null,
  ): void {
    const list = dialog.querySelector('[data-contacts]');
    this.feedback(
      dialog,
      !list?.children.length && !next ? t('No contacts available to add.') : '',
    );
  }
  private contact(dialog: HTMLDialogElement, peer: Peer): void {
    const item = document.createElement('li'),
      button = document.createElement('button');
    button.type = 'button';
    item.dataset['search'] = t('{0} {1}', [
      peer.name,
      peer.address,
    ]).toLocaleLowerCase(currentLanguage());
    button.className = 'group-contact-choice';
    button.append(
      this.people.identity(
        peer.accountId,
        peer.name || peer.address,
        t('Contact'),
      ),
    );
    const add = document.createElement('span');
    add.className = 'group-add-label';
    add.textContent = t('Add');
    button.append(add);
    button.addEventListener('click', () => {
      void this.perform(async () => {
        await this.options.controller.admission('add', peer.accountId);
        item.remove();
        this.feedback(dialog, t('Contact added to the group.'));
        await this.options.refresh();
      });
    });
    item.append(button);
    dialog.querySelector('[data-contacts]')?.append(item);
  }
  private filterContacts(dialog: HTMLDialogElement): void {
    const query =
      dialog
        .querySelector<HTMLInputElement>('[data-contact-search]')
        ?.value.trim()
        .toLocaleLowerCase(currentLanguage()) ?? '';
    dialog
      .querySelectorAll<HTMLElement>('[data-contacts] > li')
      .forEach((item) => {
        item.hidden = !item.dataset['search']?.includes(query);
      });
  }
  private async share(dialog: HTMLDialogElement): Promise<void> {
    const link = await this.options.controller.admission('link');
    if (typeof link !== 'string') throw new Error('Link not confirmed.');
    const input = dialog.querySelector<HTMLInputElement>('[data-invitation]');
    if (input) {
      dialog.querySelector<HTMLElement>('[data-invitation-label]')!.hidden =
        false;
      input.value = link;
      input.select();
    }
    try {
      await navigator.clipboard.writeText(link);
      this.feedback(dialog, t('Link copied.'));
    } catch {
      this.feedback(dialog, t('Link ready. Copy the address above.'));
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? translatedError(error.message)
    : t('Operation not confirmed. Try again.');
}

export function showGroupManagement(
  button: HTMLElement | null,
  input: {
    state: import('../../shared/groups/index.ts').GroupEvent;
    localOnly?: boolean;
  } | null,
  account: string | undefined,
): void {
  if (button)
    button.hidden =
      !input ||
      !!input.localOnly ||
      !account ||
      !groupManager(input.state, account);
}
