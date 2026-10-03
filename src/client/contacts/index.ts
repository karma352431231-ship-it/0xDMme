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
import type { VaultSync } from '../vault-sync/index.ts';
import { QrCamera, renderQr } from '../device-qr/index.ts';
import { AddressBook, incomingInvitation, walletEntity } from './agenda.ts';
import type { BookVersion } from './agenda.ts';
import { Contacts } from './controller.ts';
import { template } from './template.ts';
export function startContacts(access: VaultAccess, sync: VaultSync) {
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
  let ownLink: string | null = null,
    ownIdentity: Awaited<ReturnType<Contacts['ownIdentity']>> | null = null,
    identityResult: Awaited<ReturnType<Contacts['identity']>> | null = null;
  let identityPeer: Peer | null = null,
    camera: QrCamera | null = null;
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
    } catch (error: unknown) {
      if (current === generation)
        status =
          error instanceof Error
            ? error.message
            : 'Operação indisponível. Confira o estado antes de repetir.';
    } finally {
      busy = false;
      if (current === generation) render();
    }
  }
  function render(): void {
    text('[data-contact-status]', status);
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
      b.disabled = busy;
    });
    renderInvite();
    renderOwnIdentity();
    renderIdentity();
    renderBook();
    renderLists();
  }
  function renderOwnIdentity(): void {
    const panel = node('[data-contact-own-identity]');
    if (panel) panel.hidden = !ownIdentity;
    if (!ownIdentity) return;
    const code = `0xdmme-contact-identity:1:${ownIdentity.accountId}.${ownIdentity.fingerprint}`;
    text('[data-contact-own-fingerprint]', code);
    const qr = node('[data-contact-own-identity-qr]');
    if (qr) renderQr(qr, code, 'QR Code da minha identidade pública');
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
  function renderIdentity(): void {
    const detail = node('[data-contact-identity]');
    if (detail) detail.hidden = !identityResult;
    if (!identityResult || !identityPeer) return;
    const fingerprint = `0xdmme-contact-identity:1:${identityPeer.accountId}.${identityResult.fingerprint}`;
    text('[data-contact-fingerprint]', fingerprint);
    const qr = node('[data-contact-identity-qr]');
    if (qr) renderQr(qr, fingerprint, 'QR Code de identidade do contato');
  }
  function resetEditor(): void {
    editing = null;
    parents = undefined;
    identityResult = null;
    identityPeer = null;
    found = null;
    node<HTMLFormElement>('[data-book-form]')?.reset();
    text('[data-book-title]', 'Salvar wallet na agenda');
    text('[data-contact-discovery]', '');
    node('[data-contact-discovery-actions]')?.replaceChildren();
  }
  async function refresh(): Promise<void> {
    await sync.refresh();
    await contacts.snapshot();
    const mode = node<HTMLSelectElement>('[data-contact-mode]');
    if (mode) mode.value = contacts.state.mode;
    if (sync.complete)
      ownLink = await book.savedInvite(
        location.origin,
        contacts.state.inviteHash,
      );
    status = sync.complete
      ? 'Agenda e permissões atuais conferidas. Conteúdo privado é aberto sob demanda.'
      : 'Permissões conferidas. Continue carregando o índice do cofre antes de editar a agenda.';
  }
  function renderBook(): void {
    const entries = book.versions(value('[data-book-search]'));
    text(
      '[data-book-state]',
      `${entries.length} versões atuais no índice carregado · ${sync.complete ? 'índice conferido' : 'índice parcial'} · apelidos buscados apenas neste aparelho`,
    );
    const list = node('[data-book-list]');
    if (!list) return;
    list.replaceChildren();
    for (const entry of entries.slice(offset, offset + 16)) {
      const li = document.createElement('li'),
        p = document.createElement('p');
      const conflicts = sync.heads(entry.change.entity).length;
      p.textContent = `${entry.change.label} · ${conflicts > 1 ? conflicts + ' versões em conflito' : 'salvo no cofre'}`;
      li.append(
        p,
        button('Abrir contato', async () => edit(entry.commit.id, false)),
      );
      if (conflicts > 1)
        li.append(
          button('Resolver usando esta versão', async () =>
            edit(entry.commit.id, true),
          ),
        );
      list.append(li);
    }
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
  }
  function draft(): AddressBookEntry {
    const wallet = walletContact({
      ecosystem: value('[data-book-network]'),
      address: value('[data-book-address]').trim(),
    });
    return addressBookEntry({
      version: 1,
      ...wallet,
      alias: value('[data-book-alias]'),
      accountId: editing?.contact.accountId ?? null,
      identity: editing?.contact.identity ?? null,
      directory: editing?.contact.directory ?? null,
      identityRevision: editing?.contact.identityRevision ?? 0,
      removed: false,
    });
  }
  async function save(): Promise<void> {
    await book.save(draft(), editing, parents);
    status = sync.pending
      ? 'Contato cifrado salvo como rascunho neste aparelho. Retome o envio no Cofre.'
      : 'Contato particular confirmado no cofre. Isso não aprovou conversa.';
    resetEditor();
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
    if (found) {
      const selected = found;
      actions?.append(
        button('Solicitar conversa', async () => {
          await contacts.request(selected.accountId, null);
          await refresh();
          status =
            'Solicitação enviada. Aguarde consentimento; nenhuma mensagem foi enviada.';
        }),
      );
    }
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
      for (const contact of page?.items ?? [])
        list.append(peerRow(contact, kind));
      if (!page?.items.length) {
        const li = document.createElement('li');
        li.textContent = page
          ? 'Nenhum item nesta página.'
          : 'Atualize para conferir.';
        list.append(li);
      }
    }
    renderBlocks();
  }
  function peerRow(
    contact: Peer & { requester: string },
    kind: ContactList,
  ): HTMLLIElement {
    const li = document.createElement('li'),
      p = document.createElement('p'),
      details = document.createElement('details'),
      summary = document.createElement('summary'),
      wallet = document.createElement('p');
    p.textContent = `${contact.name || 'Sem nome'} · nome escolhido pelo usuário`;
    summary.textContent = 'Wallet e ecossistema';
    wallet.textContent = `${contact.ecosystem} · ${contact.address}`;
    details.append(summary, wallet);
    li.append(p, details);
    if (kind === 'incoming')
      li.append(
        button('Aceitar', async () => {
          await contacts.respond(contact.accountId, true);
          await refresh();
          status = 'Contato aprovado nos dois sentidos.';
        }),
        button('Rejeitar', async () => {
          await contacts.respond(contact.accountId, false);
          await refresh();
          status =
            'Solicitação rejeitada. A mesma identidade não pode repetir este pedido.';
        }),
      );
    li.append(
      button('Salvar na minha agenda', async () => selectPeer(contact)),
      button('Bloquear', async () => {
        await contacts.block(contact, true);
        await refresh();
        status = 'Wallet bloqueada; aprovação retirada nos dois sentidos.';
      }),
    );
    if (kind === 'approved')
      li.append(
        button('Verificar identidade', async () => verifyIdentity(contact)),
      );
    if (kind === 'outgoing')
      li.append(
        button('Cancelar solicitação', async () => {
          await contacts.api('cancel', {
            revision: contacts.state.revision,
            target: contact.accountId,
          });
          await refresh();
          status = 'Solicitação pendente cancelada.';
        }),
      );
    return li;
  }
  function renderBlocks(): void {
    const list = node('[data-contact-list="blocked"]');
    if (!list) return;
    list.replaceChildren();
    for (const hash of contacts.pages.get('blocked')?.blocks ?? []) {
      const li = document.createElement('li'),
        p = document.createElement('p');
      p.textContent = 'Referência do bloqueio: ' + hash;
      li.append(
        p,
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
      list.append(li);
    }
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
    await Promise.resolve();
  }
  async function knownIdentity(
    contact: Peer,
  ): Promise<
    Pick<AddressBookEntry, 'identity' | 'directory' | 'identityRevision'>
  > {
    if (!sync.complete)
      throw new Error(
        'Confira o índice completo da agenda antes de verificar a identidade.',
      );
    const heads = sync.heads(await walletEntity(contact));
    if (heads.length > 16)
      throw new Error(
        'Resolva os conflitos da agenda antes de verificar este contato.',
      );
    let known: Pick<
      AddressBookEntry,
      'identity' | 'directory' | 'identityRevision'
    > = { identity: null, directory: null, identityRevision: 0 };
    for (const head of heads) {
      const { contact: stored } = await book.open(head.commit.id);
      if (
        known.identity &&
        stored.identity &&
        known.identity !== stored.identity
      )
        throw new Error(
          'Referências de identidade conflitantes na agenda. Compare com o contato antes de resolver.',
        );
      if (stored.identityRevision >= known.identityRevision && stored.identity)
        known = stored;
    }
    return known;
  }
  async function verifyIdentity(contact: Peer): Promise<void> {
    const known = await knownIdentity(contact);
    identityResult = await contacts.identity(contact.accountId, known);
    identityPeer = contact;
    status =
      'Cadeia de chaves verificada. Compare o fingerprint por um canal independente antes de guardar a referência.';
  }
  async function pinVersion(selected: Peer): Promise<BookVersion | null> {
    if (
      editing &&
      (editing.contact.ecosystem !== selected.ecosystem ||
        editing.contact.address !== selected.address)
    )
      throw new Error(
        'Abra o contato correspondente na agenda antes de guardar a identidade.',
      );
    const heads = sync.heads(await walletEntity(selected));
    if (heads.length > 1 && !parents)
      throw new Error(
        'Resolva o conflito deste contato na agenda antes de atualizar a referência de identidade.',
      );
    if (editing) return editing;
    const first = heads[0];
    return first ? book.open(first.commit.id) : null;
  }
  async function pin(): Promise<void> {
    if (!identityResult || !identityPeer)
      throw new Error('Confira um contato aprovado primeiro.');
    const selected = identityPeer,
      result = identityResult;
    const previous = await pinVersion(selected);
    const contact: AddressBookEntry = {
      version: 1,
      ecosystem: selected.ecosystem,
      address: selected.address,
      alias: previous?.contact.alias ?? selected.name,
      accountId: selected.accountId,
      identity: result.fingerprint,
      directory: result.directory,
      identityRevision: result.revision,
      removed: false,
    };
    await book.save(contact, previous, parents);
    status = sync.pending
      ? 'Referência cifrada como rascunho; retome no cofre.'
      : 'Referência de identidade confirmada no cofre.';
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
      ? 'Convite ativo; cópia cifrada ainda é rascunho. Retome o envio no cofre.'
      : 'Novo convite ativo e preservado no cofre. O anterior foi invalidado.';
  }
  async function inspectInvite(): Promise<void> {
    received = readInvitation(
      value('[data-contact-received]'),
      location.origin,
    );
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
    target?.append(
      p,
      button('Solicitar conversa com esta wallet', async () => {
        await contacts.request(selected.accountId, invite.token);
        await refresh();
        status = 'Solicitação enviada pelo convite. Aguarde consentimento.';
      }),
    );
  }
  const actions: Record<string, () => Promise<void>> = {
    refresh,
    local: async () => {
      await sync.openLocal();
      contacts.clear();
      ownLink = null;
      status =
        'Agenda local aberta. Permissões e revogações atuais não foram consultadas; novas alterações ficam cifradas como rascunho.';
    },
    new: async () => {
      resetEditor();
      await Promise.resolve();
    },
    discover,
    'own-identity': async () => {
      ownIdentity = await contacts.ownIdentity();
      status =
        'Identidade pública conferida. Compare por um canal independente.';
    },
    pin,
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
    'block-wallet': async () => {
      await contacts.block(
        walletContact({
          ecosystem: value('[data-book-network]'),
          address: value('[data-book-address]').trim(),
        }),
        true,
      );
      await refresh();
      status = 'Wallet bloqueada, mesmo se ainda não estiver cadastrada.';
    },
    'book-more': async () => {
      offset =
        offset + 16 < book.versions(value('[data-book-search]')).length
          ? offset + 16
          : 0;
      await Promise.resolve();
    },
    'book-load': async () => {
      await sync.refresh();
      status = sync.complete
        ? 'Índice da agenda conferido.'
        : 'Parte do índice carregada; continue para conferir.';
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
    contacts.clear();
    ownLink = null;
    ownIdentity = null;
    identityResult = null;
    identityPeer = null;
    editing = null;
    parents = undefined;
    found = null;
    invitePeer = null;
    mounted?.querySelectorAll<HTMLInputElement>('input').forEach((n) => {
      n.value = '';
    });
    node('[data-contact-invite-peer]')?.replaceChildren();
    node('[data-contact-discovery-actions]')?.replaceChildren();
    for (const selector of [
      '[data-contact-invite-qr]',
      '[data-contact-identity-qr]',
      '[data-contact-own-identity-qr]',
    ]) {
      const qr = node(selector);
      qr?.replaceChildren();
      if (qr) delete qr.dataset['qrPayload'];
    }
    status = 'Reabra a agenda para conferir a autorização.';
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
  return {
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
      !value('[data-book-address]') &&
      !value('[data-contact-received]'),
    mount(container: HTMLElement): void {
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
      container.innerHTML = template;
      restoreForm(formValues);
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
        ['[data-contact-invite-form]', inspectInvite],
      ] as const)
        node<HTMLFormElement>(selector)?.addEventListener('submit', (event) => {
          event.preventDefault();
          void run(action);
        });
      node('[data-book-search]')?.addEventListener('input', () => {
        offset = 0;
        renderBook();
      });
      render();
    },
  };
}

export { Contacts, checkPinnedIdentity } from './controller.ts';
export { AddressBook, walletEntity } from './agenda.ts';
export type { BookVersion } from './agenda.ts';
