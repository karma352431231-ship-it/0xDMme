import { t, translatedError } from '../../shared/i18n/index.ts';
import { addressBookEntry } from '../../shared/contacts/index.ts';
import type { AddressBookEntry } from '../../shared/contacts/index.ts';
import type { VaultEntry, VaultSync } from '../vault-sync/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
import { AddressBook, walletEntity, walletKey } from './agenda.ts';
import type { BookVersion } from './agenda.ts';

/** Contact settings never discover, request or accept a conversation. */
export class ContactSettings {
  private host: HTMLElement | null = null;
  private dialog: HTMLDialogElement | null = null;
  private contact: AddressBookEntry | null = null;
  private editing: BookVersion | null = null;
  private parents: string[] | undefined;
  private versions: VaultEntry[] = [];
  private epoch = 0;
  private status = '';
  private draft = '';
  private readonly ports: {
    book: AddressBook;
    sync: Pick<VaultSync, 'heads' | 'pending'>;
    run: (work: () => Promise<void>) => Promise<void>;
    saved: (contact: AddressBookEntry) => Promise<void>;
  };
  constructor(ports: ContactSettings['ports']) {
    this.ports = ports;
  }
  get active(): boolean {
    return this.dialog?.open ?? false;
  }
  mount(host: HTMLElement): void {
    this.clear();
    this.host = host;
  }
  clear(): void {
    this.epoch++;
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.contact = null;
    this.editing = null;
    this.parents = undefined;
    this.versions = [];
    this.draft = '';
    this.status = '';
  }
  async open(contact: AddressBookEntry): Promise<void> {
    this.clear();
    const epoch = this.epoch;
    this.editing = await this.latest(contact, epoch);
    this.contact = this.editing?.contact ?? contact;
    this.draft = this.contact.alias;
    this.status = '';
    this.render();
    this.dialog?.showModal();
    this.dialog
      ?.querySelector<HTMLInputElement>('[data-contact-alias]')
      ?.focus();
  }
  private async latest(
    contact: AddressBookEntry,
    epoch: number,
  ): Promise<BookVersion | null> {
    const entity = await walletEntity(contact);
    this.guard(epoch);
    this.versions = this.ports.book
      .versions()
      .filter((entry) => entry.change.entity === entity);
    const latest = this.versions.toSorted(
      (a, b) => b.commit.sequence - a.commit.sequence,
    )[0];
    const editing = latest
      ? await this.ports.book.open(latest.commit.id)
      : null;
    this.guard(epoch);
    return editing;
  }
  private guard(epoch: number): void {
    if (epoch !== this.epoch || !this.host?.isConnected)
      throw new Error('Session changed.');
  }
  private createDialog(): void {
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'contact-settings contact-dialog';
    this.dialog.setAttribute('aria-labelledby', 'contact-settings-title');
    this.dialog.innerHTML = t('html.contact-settings', [chatIcon('close')]);
    this.dialog
      .querySelector('[data-contact-settings-close]')
      ?.addEventListener('click', () => this.clear());
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.clear();
    });
    this.dialog.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.ports.run(() => this.save());
    });
    this.dialog
      .querySelector<HTMLInputElement>('[data-contact-alias]')
      ?.addEventListener('input', (event) => {
        this.draft = (event.currentTarget as HTMLInputElement).value;
      });
    this.host!.append(this.dialog);
  }
  private render(): void {
    if (!this.host || !this.contact) return;
    if (!this.dialog) this.createDialog();
    const name = this.dialog!.querySelector<HTMLElement>(
      '[data-contact-name]',
    )!;
    name.textContent = this.contact.alias || t('Unnamed');
    const identity = this.dialog!.querySelector<HTMLElement>(
      '[data-contact-identity]',
    )!;
    identity.textContent =
      this.contact.addedVia === 'wallet'
        ? t('Wallet {0}: {1}', [
            this.contact.ecosystem.toUpperCase(),
            this.contact.address,
          ])
        : this.contact.addedVia === 'invite'
          ? t('Added via invitation')
          : t('Contact origin not recorded');
    const alias = this.dialog!.querySelector<HTMLInputElement>(
      '[data-contact-alias]',
    )!;
    if (document.activeElement !== alias) alias.value = this.draft;
    this.dialog!.querySelector('[data-contact-settings-status]')!.textContent =
      this.status;
    this.renderVersions();
  }
  private renderVersions(): void {
    const host = this.dialog!.querySelector<HTMLElement>(
      '[data-contact-versions]',
    )!;
    host.replaceChildren();
    if (this.versions.length <= 1) return;
    const details = document.createElement('details'),
      summary = document.createElement('summary');
    summary.textContent = t('Resolve saved versions');
    details.append(summary);
    for (const version of this.versions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = t('Resolve using this version');
      button.addEventListener('click', () => {
        void this.ports.run(() => this.chooseVersion(version.commit.id));
      });
      details.append(button);
    }
    host.append(details);
  }
  private async chooseVersion(id: string): Promise<void> {
    const epoch = this.epoch,
      editing = await this.ports.book.open(id);
    this.guard(epoch);
    if (!this.contact || walletKey(this.contact) !== walletKey(editing.contact))
      throw new Error('Create another contact for a different wallet.');
    this.editing = editing;
    this.contact = editing.contact;
    this.draft = editing.contact.alias;
    this.parents = this.ports.sync
      .heads(editing.vault.change.entity)
      .map((entry) => entry.commit.id);
    this.status = t(
      'Saving preserves previous versions and resolves the selected branches.',
    );
    this.render();
  }
  private unchanged(alias: string): boolean {
    return (
      this.editing !== null &&
      alias === this.contact?.alias &&
      !this.contact?.removed &&
      !this.parents
    );
  }
  private async persist(
    contact: AddressBookEntry,
    epoch: number,
  ): Promise<void> {
    await this.ports.book.save(contact, this.editing, this.parents, () =>
      this.guard(epoch),
    );
    this.guard(epoch);
    this.contact = contact;
    this.draft = contact.alias;
    this.editing = await this.latest(contact, epoch);
    this.parents = undefined;
    try {
      await this.ports.saved(contact);
    } catch (error: unknown) {
      throw new Error('contacts.settings-saved-refresh-failed', {
        cause: error,
      });
    }
    this.guard(epoch);
  }
  private async save(): Promise<void> {
    if (!this.contact || !this.dialog) return;
    const epoch = this.epoch;
    const field = this.dialog.querySelector<HTMLInputElement>(
      '[data-contact-alias]',
    )!;
    const alias = field.value;
    this.draft = alias;
    if (this.unchanged(alias)) {
      this.status = t('Contact changes saved.');
      this.render();
      return;
    }
    field.disabled = true;
    try {
      const contact = addressBookEntry({
        ...this.contact,
        alias,
        removed: false,
      });
      await this.persist(contact, epoch);
      this.status = this.ports.sync.pending
        ? t(
            'Contact saved on this device. It will be sent when the connection returns.',
          )
        : t('Contact changes saved.');
    } catch (error: unknown) {
      if (epoch === this.epoch)
        this.status = translatedError(
          error instanceof Error
            ? error.message
            : t('Operation unavailable. Check the state before retrying.'),
        );
      throw error;
    } finally {
      if (epoch === this.epoch) {
        field.disabled = false;
        this.render();
      }
    }
  }
}
