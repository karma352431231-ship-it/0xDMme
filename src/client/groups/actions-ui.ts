import { GroupPeople } from './people.ts';
import type { GroupProfile } from './people.ts';
import { paintAvatar } from '../appearance/index.ts';
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
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
  }
  private show(title: string, content: string): HTMLDialogElement {
    if (this.busy || this.options.isBusy())
      throw new Error('Aguarde a atualização atual.');
    this.reset();
    const dialog = document.createElement('dialog');
    dialog.className = 'group-dialog group-actions-dialog';
    dialog.setAttribute('aria-labelledby', 'group-dialog-title');
    dialog.innerHTML = `<header><div><span class="group-eyebrow">GRUPO PRIVADO</span><h2 id="group-dialog-title"></h2></div><button data-close class="group-close" type="button" aria-label="Fechar">${chatIcon('close')}</button></header>${content}<p data-feedback class="group-feedback" role="status"></p>`;
    const heading = dialog.querySelector('h2');
    if (heading) heading.textContent = title;
    dialog
      .querySelector('[data-close]')
      ?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      if (this.dialog === dialog) this.people.clear();
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
    this.feedback(dialog, 'Processando…');
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
    const dialog = this.show(
      'Criar grupo privado',
      '<div class="group-create-preview"><span data-create-avatar class="group-create-avatar" aria-hidden="true">#</span><p>Um espaço para conversar<br>com as suas pessoas.</p></div><form><label>Nome do grupo<input name="title" maxlength="160" required autocomplete="off" placeholder="Como o grupo vai se chamar?"></label><p class="group-hint">Depois de criar, adicione contatos ou compartilhe um convite.</p><div class="group-form-footer"><button class="group-primary" type="submit">Criar grupo</button></div></form>',
    );
    const titleInput =
      dialog.querySelector<HTMLInputElement>('input[name=title]');
    titleInput?.addEventListener('input', () => {
      const avatar = dialog.querySelector<HTMLElement>('[data-create-avatar]');
      if (avatar)
        paintAvatar(avatar, {
          label: titleInput.value,
          seed: titleInput.value,
        });
    });
    dialog.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.perform(async () => {
        const title =
          dialog.querySelector<HTMLInputElement>('input')?.value ?? '';
        const id = await this.options.controller.create(title);
        await this.options.refresh();
        await this.options.open(id);
        dialog.close();
      });
    });
  }
  showJoin(url = ''): void {
    const dialog = this.show(
      'Entrar em grupo privado',
      '<form><label>Link de convite<input name="invitation" type="url" required autocomplete="off" spellcheck="false"></label><p>Ao entrar, os participantes verão seu perfil privado. Você receberá mensagens a partir da sua entrada.</p><div class="group-form-footer"><button class="group-primary" type="submit">Entrar no grupo</button></div></form>',
    );
    const input = dialog.querySelector('input');
    if (input) input.value = url;
    dialog.querySelector('form')?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.perform(async () => {
        const id = await this.options.controller.admission(
          'join',
          input?.value.trim() ?? '',
        );
        if (typeof id !== 'string') throw new Error('Entrada não confirmada.');
        await this.options.refresh();
        await this.options.open(id);
        dialog.close();
      });
    });
  }
  showManage(): void {
    const selected = this.options.controller.selected;
    if (!selected || selected.localOnly)
      throw new Error('Abra um grupo conectado primeiro.');
    const dialog = this.show(
      'Adicionar participantes',
      '<p class="group-hint">Adicione seus contatos ao grupo. Eles poderão sair quando quiserem.</p><label class="group-search">Buscar nesta lista<input data-contact-search type="search" placeholder="Nome ou wallet" autocomplete="off"></label><ul data-contacts class="group-people-list"></ul><button data-more-contacts type="button" hidden>Mais contatos</button><section class="group-invitation-section"><h3>Convidar por link</h3><p class="group-hint">Quem tiver o link poderá entrar. Gerar em outro aparelho pode substituir o convite atual.</p><div class="group-button-row"><button data-link class="group-primary" type="button">Gerar / copiar link</button><button data-revoke class="group-secondary" type="button">Revogar link</button></div><label data-invitation-label hidden>Convite compartilhável<input data-invitation readonly></label></section>',
    );
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
          'Link revogado. Quem já entrou continua no grupo.',
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
    if (!group) throw new Error('O grupo foi fechado.');
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
      !list?.children.length && !next
        ? 'Nenhum contato disponível para adicionar.'
        : '',
    );
  }
  private contact(dialog: HTMLDialogElement, peer: Peer): void {
    const item = document.createElement('li'),
      button = document.createElement('button');
    button.type = 'button';
    item.dataset['search'] = `${peer.name} ${peer.address}`.toLocaleLowerCase(
      'pt-BR',
    );
    button.className = 'group-contact-choice';
    button.append(
      this.people.identity(
        peer.accountId,
        peer.name || peer.address,
        'Contato',
      ),
    );
    const add = document.createElement('span');
    add.className = 'group-add-label';
    add.textContent = 'Adicionar';
    button.append(add);
    button.addEventListener('click', () => {
      void this.perform(async () => {
        await this.options.controller.admission('add', peer.accountId);
        item.remove();
        this.feedback(dialog, 'Contato adicionado ao grupo.');
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
        .toLocaleLowerCase('pt-BR') ?? '';
    dialog
      .querySelectorAll<HTMLElement>('[data-contacts] > li')
      .forEach((item) => {
        item.hidden = !item.dataset['search']?.includes(query);
      });
  }
  private async share(dialog: HTMLDialogElement): Promise<void> {
    const link = await this.options.controller.admission('link');
    if (typeof link !== 'string') throw new Error('Link não confirmado.');
    const input = dialog.querySelector<HTMLInputElement>('[data-invitation]');
    if (input) {
      dialog.querySelector<HTMLElement>('[data-invitation-label]')!.hidden =
        false;
      input.value = link;
      input.select();
    }
    try {
      await navigator.clipboard.writeText(link);
      this.feedback(dialog, 'Link copiado.');
    } catch {
      this.feedback(dialog, 'Link pronto. Copie o endereço acima.');
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Operação não confirmada. Tente novamente.';
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
