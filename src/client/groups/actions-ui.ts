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
  constructor(options: GroupActionsOptions) {
    this.options = options;
    this.contacts = new Contacts(options.access);
  }
  setSession(session: AccountSession | null): void {
    this.reset();
    this.contacts.setSession(session);
  }
  reset(): void {
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
  }
  private show(title: string, content: string): HTMLDialogElement {
    if (this.busy || this.options.isBusy())
      throw new Error('Aguarde a atualização atual.');
    this.reset();
    const dialog = document.createElement('dialog');
    dialog.className = 'group-dialog';
    dialog.setAttribute('aria-labelledby', 'group-dialog-title');
    dialog.innerHTML = `<header><h2 id="group-dialog-title"></h2><button data-close type="button" aria-label="Fechar">×</button></header>${content}<p data-feedback role="status"></p>`;
    const heading = dialog.querySelector('h2');
    if (heading) heading.textContent = title;
    dialog
      .querySelector('[data-close]')
      ?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('cancel', (event) => {
      if (this.busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
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
      '<form><label>Nome do grupo<input name="title" maxlength="160" required autocomplete="off"></label><p>Adicione contatos ou compartilhe um link depois de criar.</p><button class="primary" type="submit">Criar grupo</button></form>',
    );
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
      '<form><label>Link de convite<input name="invitation" type="url" required autocomplete="off" spellcheck="false"></label><p>Ao entrar, os participantes verão seu perfil privado. Você receberá mensagens a partir da sua entrada.</p><button class="primary" type="submit">Entrar no grupo</button></form>',
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
      '<p>Clique em um contato para adicioná-lo diretamente. Ele poderá sair quando quiser.</p><ul data-contacts></ul><button data-more-contacts type="button" hidden>Mais contatos</button><section><h3>Link de convite</h3><p>Quem tiver o link poderá entrar. Gerar em outro aparelho pode substituir o link atual.</p><button data-link type="button">Gerar / copiar link</button><button data-revoke type="button">Revogar link</button><label>Convite compartilhável<input data-invitation readonly hidden></label></section>',
    );
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
          input.hidden = true;
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
    if (!group) throw new Error('O grupo foi fechado.');
    const list = dialog.querySelector('[data-contacts]');
    if (!more) list?.replaceChildren();
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
    const next = dialog.querySelector<HTMLElement>('[data-more-contacts]');
    if (next) next.hidden = page.next === null;
    this.feedback(
      dialog,
      !list?.children.length && !page.next
        ? 'Nenhum contato disponível para adicionar.'
        : '',
    );
  }
  private contact(dialog: HTMLDialogElement, peer: Peer): void {
    const item = document.createElement('li'),
      button = document.createElement('button');
    button.type = 'button';
    button.textContent = peer.name || peer.address;
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
  private async share(dialog: HTMLDialogElement): Promise<void> {
    const link = await this.options.controller.admission('link');
    if (typeof link !== 'string') throw new Error('Link não confirmado.');
    const input = dialog.querySelector<HTMLInputElement>('[data-invitation]');
    if (input) {
      input.hidden = false;
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
