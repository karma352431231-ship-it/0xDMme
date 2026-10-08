import type { AccountSession } from '../../shared/account/index.ts';
import {
  addressBookEntry,
  discoveryMode,
  invitationLink,
  readInvitation,
  walletContact,
} from '../../shared/contacts/index.ts';
import type {
  AddressBookEntry,
  ContactList,
  Invitation,
  Peer,
} from '../../shared/contacts/index.ts';
import { digest } from '../../shared/devices/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync, VaultEntry } from '../vault-sync/index.ts';
import { QrCamera, renderQr } from '../device-qr/index.ts';
import { AddressBook, incomingInvitation, walletKey } from './agenda.ts';
import type { BookVersion } from './agenda.ts';
import { Contacts } from './controller.ts';
import { template, settingsTemplate } from './template.ts';
import {
  bindContactTabs,
  contactRow,
  contactMenu,
  contactSearchMatches,
  emptyContacts,
  searchContacts,
  selectContactTab,
  shortWallet,
} from './view.ts';
export function startContacts(
  access: VaultAccess,
  sync: VaultSync,
  options: {
    saved?: (contact: AddressBookEntry) => Promise<void>;
    open?: (peer: Peer) => Promise<void>;
  } = {},
) {
  const contacts = new Contacts(access),
    book = new AddressBook(sync);
  let mounted: HTMLElement | null = null,
    busy = false,
    generation = 0,
    offset = 0;
  let status = 'Conecte e autorize o aparelho para sincronizar.';
  let editing: BookVersion | null = null,
    parents: string[] | undefined;
  let found: Peer | null = null,
    received: Invitation | null = null,
    invitePeer: Peer | null = null;
  let ownLink: string | null = null;
  let prepared: AddressBookEntry | null = null;
  let camera: QrCamera | null = null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function text(selector: string, value: string): void {
    const n = node(selector);
    if (n) n.textContent = value;
  }
  function value(selector: string): string {
    return node<HTMLInputElement | HTMLSelectElement>(selector)?.value ?? '';
  }
  function button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.disabled = busy;
    b.addEventListener('click', () => {
      void run(work);
    });
    return b;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const current = generation;
    render();
    try {
      await work();
      if (current === generation) {
        const retry = node('[data-contact-action="refresh"]');
        if (retry) retry.hidden = true;
      }
    } catch (error: unknown) {
      const retry = node('[data-contact-action="refresh"]');
      if (retry) retry.hidden = false;
      if (current === generation)
        status =
          error instanceof Error
            ? error.message
            : 'Operação indisponível. Confira o estado antes de repetir.';
    } finally {
      busy = false;
      render();
      if (current !== generation) ready();
    }
  }
  function render(): void {
    text('[data-contact-status]', busy ? 'Atualizando contatos…' : status);
    text('[data-contact-editor-status]', busy ? 'Processando…' : status);
    renderInvite();
    renderBook();
    renderLists();
    renderPagination();
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.disabled = busy;
    });
    const close = node<HTMLButtonElement>('[data-contact-editor-close]');
    if (close) close.disabled = false;
  }
  function renderPagination(): void {
    mounted
      ?.querySelectorAll<HTMLButtonElement>('[data-contact-page]')
      .forEach((button) => {
        button.hidden = !contacts.pages.get(
          button.dataset['contactPage'] as ContactList,
        )?.next;
      });
    const next = node('[data-contact-action="book-more"]');
    if (next) next.hidden = bookEntries().length <= 16;
  }
  function renderInvite(): void {
    const own = node('[data-contact-own-invite]');
    if (own) own.hidden = !ownLink;
    const input = node<HTMLInputElement>('[data-contact-invite]');
    if (input) input.value = ownLink ?? '';
    if (!ownLink) return;
    const qr = node('[data-contact-invite-qr]');
    if (qr) renderQr(qr, ownLink, 'QR Code de convite para contato');
  }
  function resetEditor(): void {
    editing = null;
    parents = undefined;
    found = null;
    prepared = null;
    node<HTMLFormElement>('[data-book-form]')?.reset();
    text('[data-book-title]', 'Adicionar contato');
    text('[data-contact-discovery]', '');
    node('[data-contact-discovery-actions]')?.replaceChildren();
  }
  function openEditor(tab: 'wallet' | 'invite'): void {
    const dialog = node<HTMLDialogElement>('[data-contact-editor]');
    if (!dialog || !mounted) return;
    selectContactTab(mounted, 'editor', tab);
    if (!dialog.open) dialog.showModal();
    dialog
      .querySelector<HTMLInputElement>(
        `[data-contact-panel="editor"][data-tab="${tab}"] input`,
      )
      ?.focus();
  }
  function bindEditor(): void {
    node('[data-contact-add]')?.addEventListener('click', () => {
      resetEditor();
      status =
        'Salvar guarda o apelido na agenda; solicitar conversa depende do aceite.';
      render();
      openEditor('wallet');
    });
    const dialog = node<HTMLDialogElement>('[data-contact-editor]');
    node('[data-contact-editor-close]')?.addEventListener('click', () =>
      dialog?.close(),
    );
    dialog?.addEventListener('close', () => {
      // A queued close from session reset must not clear a reopened invitation.
      if (dialog.open || dialog !== node('[data-contact-editor]')) return;
      camera?.stop();
      resetEditor();
      received = null;
      invitePeer = null;
      node<HTMLFormElement>('[data-contact-invite-form]')?.reset();
      node('[data-contact-invite-peer]')?.replaceChildren();
    });
    node('[data-contact-tab="editor"][data-tab="wallet"]')?.addEventListener(
      'click',
      () => camera?.stop(),
    );
  }
  async function refresh(): Promise<void> {
    const deadline = Date.now() + 60_000;
    do {
      if (Date.now() >= deadline)
        throw new Error('Sincronização interrompida. Tente novamente.');
      await sync.refresh();
    } while (!sync.complete);
    if (sync.pending) await sync.retry();
    await contacts.snapshot();
    const mode = node<HTMLSelectElement>('[data-contact-mode]');
    if (mode) mode.value = contacts.state.mode;
    if (sync.complete)
      ownLink = await book.savedInvite(
        location.origin,
        contacts.state.inviteHash,
      );
    status = sync.complete
      ? 'Contatos atualizados.'
      : 'Permissões conferidas. Continue carregando o índice do cofre antes de editar a agenda.';
    if (received) await inspectInvite();
  }
  function renderBook(): void {
    const entries = bookEntries();
    text('[data-book-state]', `Versões carregadas: ${entries.length}`);
    const list = node('[data-book-list]');
    if (!list) return;
    list.replaceChildren();
    for (const entry of entries.slice(offset, offset + 16)) {
      const conflicts = sync.heads(entry.change.entity).length;
      const { row, actions } = contactRow({
        title: entry.change.label,
        detail:
          conflicts > 1
            ? `${conflicts} versões em conflito`
            : 'Registro da sua agenda particular',
      });
      actions.append(
        button('Abrir contato', async () => edit(entry.commit.id, false)),
      );
      if (conflicts > 1)
        contactMenu(actions, entry.change.label).append(
          button('Resolver usando esta versão', async () =>
            edit(entry.commit.id, true),
          ),
        );
      list.append(row);
    }
    if (!list.childElementCount)
      emptyContacts(
        list,
        value('[data-book-search]')
          ? 'Nenhum registro encontrado nesta agenda.'
          : 'Sua agenda está vazia. Adicione uma wallet para guardar um apelido particular.',
      );
  }
  function bookEntries(): VaultEntry[] {
    return book
      .versions()
      .filter((entry) =>
        contactSearchMatches(entry.change.label, value('[data-book-search]')),
      );
  }
  async function edit(id: string, resolve: boolean): Promise<void> {
    editing = await book.open(id);
    parents = resolve
      ? sync
          .heads(editing.vault.change.entity)
          .map((e) => e.commit.id)
          .slice(0, 16)
      : undefined;
    const c = editing.contact;
    for (const [selector, v] of [
      ['[data-book-network]', c.ecosystem],
      ['[data-book-address]', c.address],
      ['[data-book-alias]', c.alias],
    ]) {
      const n = node<HTMLInputElement | HTMLSelectElement>(selector ?? '');
      if (n) n.value = v ?? '';
    }
    text(
      '[data-book-title]',
      resolve
        ? 'Resolver contato: confira antes de salvar'
        : 'Editar contato particular',
    );
    text(
      '[data-contact-discovery]',
      `Wallet ${c.ecosystem}: ${c.address}${c.identity ? ' · referência de identidade guardada' : ''}${c.removed ? ' · removido da agenda ativa' : ''}`,
    );
    status = resolve
      ? 'Salvar preservará as versões anteriores e resolverá os ramos escolhidos.'
      : 'Contato aberto apenas neste aparelho.';
    openEditor('wallet');
  }
  function referenceContact(
    wallet: AddressBookEntry | ReturnType<typeof walletContact>,
  ): AddressBookEntry | null {
    if (editing) return editing.contact;
    return prepared && walletKey(prepared) === walletKey(wallet)
      ? prepared
      : null;
  }
  function draft(): AddressBookEntry {
    const wallet = walletContact({
      ecosystem: value('[data-book-network]'),
      address: value('[data-book-address]').trim(),
    });
    const reference = referenceContact(wallet);
    return addressBookEntry({
      version: 1,
      ...wallet,
      alias: value('[data-book-alias]'),
      accountId: reference?.accountId ?? null,
      identity: reference?.identity ?? null,
      directory: reference?.directory ?? null,
      identityRevision: reference?.identityRevision ?? 0,
      removed: false,
    });
  }
  async function save(): Promise<void> {
    const contact = draft();
    const expected = generation;
    await book.save(contact, editing, parents, () => {
      if (expected !== generation) throw new Error('Sessão alterada.');
    });
    if (expected !== generation) throw new Error('Sessão alterada.');
    await options.saved?.(contact);
    status = sync.pending
      ? 'Contato salvo neste aparelho. Será enviado quando a conexão voltar.'
      : 'Contato particular confirmado no cofre. Isso não aprovou conversa.';
    resetEditor();
    node<HTMLDialogElement>('[data-contact-editor]')?.close();
  }
  async function discover(): Promise<void> {
    found = await contacts.discover(
      walletContact({
        ecosystem: value('[data-book-network]'),
        address: value('[data-book-address]').trim(),
      }),
    );
    text(
      '[data-contact-discovery]',
      found
        ? `${found.name || 'Sem nome'} · nome escolhido pelo usuário · ${found.ecosystem} · ${found.address}`
        : 'Wallet indisponível para solicitação por endereço. Salve na agenda e compartilhe seu convite.',
    );
    const actions = node('[data-contact-discovery-actions]');
    actions?.replaceChildren();
  }
  function renderLists(): void {
    for (const kind of [
      'incoming',
      'outgoing',
      'approved',
      'rejected',
    ] as const) {
      const list = node(`[data-contact-list="${kind}"]`);
      if (!list) continue;
      list.replaceChildren();
      const page = contacts.pages.get(kind);
      const items = searchContacts(
        page?.items ?? [],
        value('[data-book-search]'),
      );
      for (const contact of items) list.append(peerRow(contact, kind));
      if (!items.length) emptyContacts(list, emptyList(kind, !!page));
      text(
        `[data-contact-page-state="${kind}"]`,
        page ? `${page.items.length}${page.next ? '+' : ''} nesta página` : '',
      );
    }
    renderRequestCount();
    renderBlocks();
  }
  function renderRequestCount(): void {
    const count = node('[data-contact-request-count]'),
      incoming = contacts.pages.get('incoming');
    if (count) {
      const amount = incoming?.items.length ?? 0;
      count.hidden = amount === 0;
      count.textContent = `${amount}${incoming?.next ? '+' : ''}`;
      count.setAttribute(
        'aria-label',
        `Pedidos recebidos nesta página: ${amount}`,
      );
    }
  }
  function emptyList(kind: ContactList, loaded: boolean): string {
    if (!loaded) return 'Entre e sincronize para conferir esta lista.';
    if (value('[data-book-search]'))
      return 'Nenhum resultado nos itens desta página.';
    const labels = {
      approved:
        'Nenhuma conversa liberada. Adicione um contato ou aceite uma solicitação.',
      incoming: 'Nenhum pedido recebido. Os novos pedidos aparecem aqui.',
      outgoing: 'Você não tem pedidos enviados nesta página.',
      rejected: 'Nenhum pedido recusado nesta página.',
      blocked: 'Nenhum bloqueio nesta página.',
    };
    return labels[kind];
  }
  function peerRow(
    contact: Peer & { requester: string },
    kind: ContactList,
  ): HTMLLIElement {
    const title = contact.name || shortWallet(contact.address);
    const { row, actions } = contactRow({
      title,
      detail: `${contact.ecosystem.toUpperCase()} · ${shortWallet(contact.address)}`,
    });
    if (kind === 'approved' && options.open) {
      const open = options.open;
      const converse = button('Conversar', () => open(contact));
      converse.className = 'primary';
      actions.append(converse);
    }
    if (kind === 'incoming') requestActions(actions, contact);
    const menu = contactMenu(actions, title),
      details = document.createElement('details'),
      summary = document.createElement('summary'),
      wallet = document.createElement('p');
    summary.textContent = 'Wallet e nome informado';
    wallet.textContent = `${contact.ecosystem.toUpperCase()} · ${contact.address}. Nome escolhido pelo usuário.`;
    details.append(summary, wallet);
    menu.append(
      details,
      button('Salvar na minha agenda', async () => selectPeer(contact)),
    );
    if (kind === 'outgoing')
      menu.append(
        button('Cancelar solicitação', async () => {
          await contacts.api('cancel', {
            revision: contacts.state.revision,
            target: contact.accountId,
          });
          await refresh();
          status = 'Solicitação pendente cancelada.';
        }),
      );
    return row;
  }
  function requestActions(actions: HTMLElement, contact: Peer): void {
    const accept = button('Aceitar', async () => {
      await contacts.respond(contact.accountId, true);
      await refresh();
      status = 'Contato aprovado nos dois sentidos.';
    });
    accept.className = 'primary';
    actions.append(
      accept,
      button('Recusar', async () => {
        await contacts.respond(contact.accountId, false);
        await refresh();
        status =
          'Solicitação recusada. A mesma identidade não pode repetir este pedido.';
      }),
    );
  }
  function renderBlocks(): void {
    const list = node('[data-contact-list="blocked"]');
    if (!list) return;
    list.replaceChildren();
    const query = value('[data-book-search]').trim().toLowerCase();
    for (const hash of contacts.pages.get('blocked')?.blocks ?? []) {
      if (!hash.toLowerCase().includes(query)) continue;
      const { row, actions } = contactRow({
        title: 'Wallet bloqueada',
        detail: `Referência · ${shortWallet(hash)}`,
      });
      const menu = contactMenu(actions, `bloqueio ${shortWallet(hash)}`),
        reference = document.createElement('p');
      reference.textContent = `Referência do bloqueio: ${hash}`;
      menu.append(reference);
      actions.prepend(
        button('Desbloquear', async () => {
          await contacts.api('unblock', {
            revision: contacts.state.revision,
            walletHash: hash,
          });
          await refresh();
          status =
            'Bloqueio removido. Uma nova solicitação e aprovação continuam necessárias.';
        }),
      );
      list.append(row);
    }
    if (!list.childElementCount)
      emptyContacts(list, emptyList('blocked', contacts.pages.has('blocked')));
  }
  async function selectPeer(contact: Peer): Promise<void> {
    resetEditor();
    const n = node<HTMLSelectElement>('[data-book-network]'),
      a = node<HTMLInputElement>('[data-book-address]'),
      alias = node<HTMLInputElement>('[data-book-alias]');
    if (n) n.value = contact.ecosystem;
    if (a) a.value = contact.address;
    if (alias) alias.value = contact.name;
    status = 'Confira o apelido particular e salve explicitamente na agenda.';
    openEditor('wallet');
    await Promise.resolve();
  }
  async function configure(): Promise<void> {
    await contacts.configure(
      discoveryMode(value('[data-contact-mode]')),
      contacts.state.inviteHash,
    );
    status =
      'Visibilidade aplicada no servidor. Contatos já aprovados foram preservados.';
  }
  async function rotate(): Promise<void> {
    if (!sync.complete || sync.pending)
      throw new Error(
        'Abra/sincronize a agenda e resolva o rascunho antes de trocar o convite.',
      );
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(bytes, (b) =>
      b.toString(16).padStart(2, '0'),
    ).join('');
    bytes.fill(0);
    const session = contacts.session;
    if (!session) throw new Error('Entre primeiro.');
    const invite = { owner: session.accountId, token };
    await contacts.configure(contacts.state.mode, await digest(token));
    ownLink = invitationLink(location.origin, invite);
    try {
      await book.saveInvite(invite);
    } catch (error: unknown) {
      status =
        'Convite ativo, mas a cópia cifrada não foi confirmada. Guarde o link ou revogue-o antes de sair.';
      render();
      throw error;
    }
    status = sync.pending
      ? 'Convite ativo; a cópia cifrada será enviada automaticamente ao reconectar.'
      : 'Novo convite ativo e preservado no cofre. O anterior foi invalidado.';
  }
  async function inspectInvite(): Promise<void> {
    const link = value('[data-contact-received]');
    if (link) received = readInvitation(link, location.origin);
    if (!received) throw new Error('Informe um convite válido.');
    invitePeer = await contacts.invite(received);
    const target = node('[data-contact-invite-peer]');
    target?.replaceChildren();
    if (!invitePeer) {
      status =
        'Convite indisponível, revogado ou restrito pela privacidade atual.';
      return;
    }
    const selected = invitePeer,
      invite = received;
    const p = document.createElement('p');
    p.textContent = `${selected.name || 'Sem nome'} · nome escolhido pelo usuário · ${selected.ecosystem} · ${selected.address}`;
    target?.append(p);
    if (!node('[data-contact-invite-form]'))
      target?.append(
        button('Solicitar conversa', () =>
          requestInvite(selected, invite.token),
        ),
      );
  }
  async function requestInvite(selected: Peer, token: string): Promise<void> {
    await contacts.request(selected.accountId, token);
    received = null;
    invitePeer = null;
    node('[data-contact-invite-peer]')?.replaceChildren();
    await refresh();
    status = 'Solicitação enviada. Aguarde o aceite.';
  }
  async function sendInvite(): Promise<void> {
    await inspectInvite();
    if (invitePeer && received) await requestInvite(invitePeer, received.token);
  }
  async function requestWallet(): Promise<void> {
    await discover();
    if (found) {
      await contacts.request(found.accountId, null);
      await refresh();
      status = 'Solicitação enviada. Aguarde o aceite.';
    }
  }
  const actions: Record<string, () => Promise<void>> = {
    refresh,
    discover: requestWallet,
    rotate,
    revoke: async () => {
      await contacts.configure(contacts.state.mode, null);
      ownLink = null;
      status =
        'Convite revogado. Links antigos não permitem novas solicitações.';
    },
    copy: async () => {
      if (!ownLink) throw new Error('Crie um convite primeiro.');
      await navigator.clipboard.writeText(ownLink);
      status = 'Link copiado. Compartilhe manualmente com o destinatário.';
    },
    'book-more': async () => {
      offset = offset + 16 < bookEntries().length ? offset + 16 : 0;
      await Promise.resolve();
    },
    scan: async () => {
      camera?.start('invitation');
      await Promise.resolve();
    },
    'stop-camera': async () => {
      camera?.stop();
      await Promise.resolve();
    },
  };
  function clear(): void {
    generation++;
    camera?.stop();
    node<HTMLDialogElement>('[data-contact-editor]')?.close();
    contacts.clear();
    ownLink = null;
    editing = null;
    prepared = null;
    parents = undefined;
    found = null;
    invitePeer = null;
    mounted?.querySelectorAll<HTMLInputElement>('input').forEach((n) => {
      n.value = '';
    });
    node('[data-contact-invite-peer]')?.replaceChildren();
    node('[data-contact-discovery-actions]')?.replaceChildren();
    for (const selector of ['[data-contact-invite-qr]']) {
      const qr = node(selector);
      qr?.replaceChildren();
      if (qr) delete qr.dataset['qrPayload'];
    }
    status = 'Consultando contatos da conta…';
  }
  function sessionChanged(session: AccountSession | null): boolean {
    return (
      session?.accountId !== contacts.session?.accountId ||
      session?.csrf !== contacts.session?.csrf ||
      session?.deviceId !== contacts.session?.deviceId
    );
  }
  function showReceivedInvite(): void {
    if (!received) return;
    const input = node<HTMLInputElement>('[data-contact-received]');
    if (input) input.value = invitationLink(location.origin, received);
    openEditor('invite');
  }
  function readIncomingInvite(): void {
    try {
      const invite = incomingInvitation(location.hash, location.origin);
      if (!invite) return;
      received = invite;
    } catch {
      received = null;
      status = 'Convite inválido. Confira o link completo.';
    }
    if (location.hash.startsWith('#contatos?'))
      history.replaceState(null, '', location.pathname + '#contatos');
  }
  function mountCamera(): void {
    const video = node<HTMLVideoElement>('[data-contact-camera]');
    if (!video) return;
    camera = new QrCamera({
      video,
      state: (active) => {
        video.hidden = !active;
        const stop = node('[data-contact-action="stop-camera"]');
        if (stop) stop.hidden = !active;
      },
      failed: (message) => {
        status = message;
        render();
      },
      decoded: (link) => {
        const input = node<HTMLInputElement>('[data-contact-received]');
        if (input) input.value = link;
        void run(inspectInvite);
      },
    });
  }
  function restoreForm(values: { selector: string; value: string }[]): void {
    for (const saved of values) {
      const input = node<HTMLInputElement | HTMLSelectElement>(saved.selector);
      if (input && saved.value) input.value = saved.value;
    }
  }
  window.addEventListener('pagehide', () => {
    clear();
    received = null;
    render();
  });
  function ready(): void {
    if (mounted?.isConnected && contacts.session && navigator.onLine)
      void run(refresh);
  }
  return {
    ready,
    showContact(contact: AddressBookEntry): void {
      resetEditor();
      prepared = contact;
      for (const [selector, value] of [
        ['[data-book-network]', contact.ecosystem],
        ['[data-book-address]', contact.address],
        ['[data-book-alias]', contact.alias],
      ]) {
        const input = node<HTMLInputElement | HTMLSelectElement>(
          selector ?? '',
        );
        if (input) input.value = value ?? '';
      }
      status =
        'Salvar guarda o contato; pedir conversa continua sujeito ao aceite.';
      render();
      openEditor('wallet');
    },
    setSession(session: AccountSession | null): void {
      const firstConnection = !contacts.session && session !== null;
      if (sessionChanged(session)) clear();
      if (!session) received = null;
      contacts.setSession(session);
      if (firstConnection) showReceivedInvite();
      render();
    },
    canActivate: () =>
      !busy &&
      !camera?.active &&
      !node<HTMLDialogElement>('[data-contact-editor]')?.open &&
      !value('[data-book-address]') &&
      !value('[data-contact-received]'),
    mount(
      container: HTMLElement,
      mode: 'contacts' | 'settings' = 'contacts',
    ): void {
      const formValues = [
        '[data-book-network]',
        '[data-book-address]',
        '[data-book-alias]',
        '[data-book-search]',
        '[data-contact-received]',
        '[data-contact-mode]',
      ].map((selector) => ({ selector, value: value(selector) }));
      camera?.stop();
      mounted = container;
      container.innerHTML = mode === 'settings' ? settingsTemplate : template;
      restoreForm(formValues);
      bindContactTabs(container);
      bindEditor();
      readIncomingInvite();
      showReceivedInvite();
      mountCamera();
      container
        .querySelectorAll<HTMLButtonElement>('[data-contact-action]')
        .forEach((b) =>
          b.addEventListener('click', () => {
            const action = actions[b.dataset['contactAction'] ?? ''];
            if (action) void run(action);
          }),
        );
      container
        .querySelectorAll<HTMLButtonElement>('[data-contact-page]')
        .forEach((b) =>
          b.addEventListener('click', () => {
            void run(async () => {
              await contacts.list(
                b.dataset['contactPage'] as ContactList,
                true,
              );
            });
          }),
        );
      for (const [selector, action] of [
        ['[data-book-form]', save],
        ['[data-contact-settings]', configure],
        ['[data-contact-invite-form]', sendInvite],
      ] as const)
        node<HTMLFormElement>(selector)?.addEventListener('submit', (event) => {
          event.preventDefault();
          void run(action);
        });
      node('[data-book-search]')?.addEventListener('input', () => {
        offset = 0;
        renderBook();
        renderLists();
        renderPagination();
      });
      render();
      void run(async () => {
        if (navigator.onLine && contacts.session) await refresh();
        else await sync.openLocal();
      });
    },
  };
}

export { Contacts, checkPinnedIdentity } from './controller.ts';
export { AddressBook, walletEntity, walletKey } from './agenda.ts';
export type { BookVersion } from './agenda.ts';
