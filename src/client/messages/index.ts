import { AttachmentUi } from '../attachment-ui/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Contacts } from '../contacts/index.ts';
import { profileCard } from '../message-profile/index.ts';
import { Messages } from './controller.ts';
import type { MessageView } from './controller.ts';
export function startMessages(
  access: VaultAccess,
  sync: VaultSync,
  sharedProfile: () => import('../message-profile/index.ts').ProfileCard | null,
) {
  const contacts = new Contacts(access),
    attachments = new AttachmentUi();
  let mounted: HTMLElement | null = null,
    busy = false,
    selected: Peer | null = null,
    session: AccountSession | null = null,
    rows: readonly MessageView[] | null = null,
    generation = 0,
    refreshRequested = false,
    automaticAttempts = 0,
    lastTransferAttempt = 0;
  let message = 'Entre e autorize este aparelho para conversar.';
  const controller = new Messages(access, sync, (value) => {
    rows = value;
    renderHistory();
  });
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function status(): void {
    const text = node('[data-message-status]');
    if (text) text.textContent = message;
    mounted
      ?.querySelectorAll<
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLSelectElement
        | HTMLTextAreaElement
      >('button,input,select,textarea')
      .forEach((control) => {
        control.disabled = busy;
      });
  }
  function action(label: string, work: () => Promise<void>): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      void run(work);
    });
    return button;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    const current = generation;
    status();
    try {
      await work();
      if (current !== generation) return;
      if (navigator.onLine)
        message = controller.transportPending
          ? 'Histórico verificado pelo cofre; algumas chaves de transporte permanecem pendentes, sem confirmação falsa.'
          : 'Estado atual conferido. Recebimento não é confirmação de leitura.';
    } catch (error: unknown) {
      if (current === generation)
        message =
          error instanceof Error
            ? error.message
            : 'Não foi possível concluir a operação.';
    } finally {
      busy = false;
      if (current === generation) {
        await renderPending().catch(() => {
          message =
            'Não foi possível abrir os envios pendentes deste aparelho.';
        });
        status();
      }
      runQueuedRefresh();
    }
  }
  function runQueuedRefresh(): void {
    if (refreshRequested && mounted?.isConnected && session && navigator.onLine)
      queueMicrotask(() => {
        void run(refresh);
      });
  }
  async function resumePending(): Promise<void> {
    if (automaticAttempts >= 3 || Date.now() - lastTransferAttempt < 60000)
      return;
    lastTransferAttempt = Date.now();
    if (!(await controller.pending()).length) return;
    automaticAttempts++;
    await controller.sendPending();
  }
  function requestRefresh(): void {
    refreshRequested = true;
    automaticAttempts = 0;
    if (!busy && mounted?.isConnected && session && navigator.onLine)
      void run(refresh);
  }
  function peerLabel(): string {
    return (
      selected?.name || selected?.address || 'Selecione um contato aprovado'
    );
  }
  const urls: string[] = [];
  function renderHistory(): void {
    attachments.clearMedia();
    for (const url of urls.splice(0)) URL.revokeObjectURL(url);
    const history = node('[data-message-history]');
    if (!history) return;
    history.replaceChildren();
    history.hidden = rows === null;
    const gate = node('[data-message-gate]');
    if (gate) {
      gate.hidden = rows !== null;
      gate.textContent =
        'Histórico oculto até concluir a sincronização e aplicar as exclusões.';
    }
    const title = node('[data-message-peer]');
    if (title) title.textContent = peerLabel();
    for (const view of rows ?? []) {
      const article = document.createElement('article');
      article.className = view.own ? 'chat-message own' : 'chat-message';
      const text = document.createElement('p');
      renderContent(article, text, view);
      const detail = document.createElement('small');
      detail.textContent = view.state;
      article.append(text, detail);
      if (view.own)
        article.append(
          action('Apagar para ambos', async () => {
            await controller.remove(view);
            await controller.synchronize();
          }),
        );
      history.append(article);
    }
  }
  function renderContent(
    article: HTMLElement,
    text: HTMLElement,
    view: MessageView,
  ): void {
    if (view.kind === 'attachment') {
      attachments.render({
        article,
        view,
        load: (v, thumb) => controller.media(v, thumb),
        run,
      });
    } else if (view.kind === 'profile') {
      const card = profileCard(JSON.parse(view.text) as unknown);
      text.textContent = `Perfil de ${card.name}`;
      if (card.photo) {
        const img = document.createElement('img'),
          url = URL.createObjectURL(
            new Blob([card.photo.bytes], { type: card.photo.type }),
          );
        urls.push(url);
        img.src = url;
        img.alt = 'Foto compartilhada pelo contato';
        img.width = 96;
        img.height = 96;
        article.append(img);
      }
    } else text.textContent = view.text;
  }
  function sameSession(value: AccountSession | null): boolean {
    return (
      value?.accountId === session?.accountId &&
      value?.deviceId === session?.deviceId &&
      value?.csrf === session?.csrf
    );
  }
  async function renderPending(): Promise<void> {
    const list = node('[data-message-pending]');
    if (!list) return;
    const current = generation;
    const pending = await controller.pending();
    if (current !== generation || list !== node('[data-message-pending]'))
      return;
    list.replaceChildren();
    for (const item of pending) {
      const li = document.createElement('li');
      li.textContent = `Envio pendente para ${item.peer.slice(0, 8)} `;
      li.append(
        action('Apagar envio', async () => {
          await controller.discard(item.id);
        }),
      );
      list.append(li);
    }
  }
  function renderContacts(peers: Peer[]): void {
    const list = node('[data-message-contacts]');
    if (!list) return;
    list.replaceChildren();
    for (const peer of peers) {
      list.append(
        action(peer.name || peer.address, async () => {
          selected = peer;
          controller.select(peer.accountId);
          renderHistory();
          if (!navigator.onLine) {
            await controller.openOffline(peer.accountId);
            return;
          }
          await controller.loadPins();
          const card = sharedProfile();
          if (card) await controller.shareProfile(peer.accountId, card);
          await controller.synchronize();
          await controller.savePins();
        }),
      );
    }
  }
  async function refreshContacts(more = false): Promise<void> {
    const page = await contacts.list('approved', more);
    renderContacts(page.items);
    const moreButton = node('[data-message-more-contacts]');
    if (moreButton) moreButton.hidden = page.next === null;
  }
  async function refresh(): Promise<void> {
    refreshRequested = false;
    lastTransferAttempt = Date.now();
    controller.hide();
    await controller.initialize();
    await controller.loadPins();
    await refreshContacts();
    await controller.sendPending();
    if (selected) {
      const card = sharedProfile();
      if (card) await controller.shareProfile(selected.accountId, card);
      await controller.synchronize();
    }
    await controller.savePins();
  }
  async function submit(): Promise<void> {
    const text = node<HTMLTextAreaElement>('[data-message-text]');
    if (!selected || !text || (!text.value.trim() && !attachments.selected))
      throw new Error(
        'Selecione um contato e escreva a mensagem ou escolha um anexo.',
      );
    if (attachments.selected)
      await controller.composeAttachment(
        selected.accountId,
        attachments.selected,
        text.value,
      );
    else await controller.compose(selected.accountId, text.value);
    text.value = '';
    attachments.clearSelection();
    if (navigator.onLine) {
      await controller.sendPending();
      await controller.synchronize();
      await controller.savePins();
    }
  }
  function suspend(): void {
    controller.close();
    rows = null;
    renderHistory();
  }
  window.addEventListener('0xdmme-attachment-progress', (event) => {
    const progress = (event as CustomEvent<{ done: number; total: number }>)
      .detail;
    if (!busy || !mounted?.isConnected) return;
    message = `Enviando anexo: parte ${progress.done} de ${progress.total}. Fechar o app pausa a transferência; o rascunho cifrado permanece.`;
    status();
  });
  window.addEventListener('offline', () => {
    suspend();
    message =
      'Sem conexão. Os envios ficam cifrados neste aparelho. Abra deliberadamente a cópia local para consultar o que já recebeu.';
    status();
  });
  window.addEventListener('online', () => {
    suspend();
    requestRefresh();
  });
  document.addEventListener('visibilitychange', () => {
    suspend();
    if (
      document.visibilityState === 'visible' &&
      mounted?.isConnected &&
      session &&
      navigator.onLine
    )
      requestRefresh();
  });
  const channel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('0xdmme-message-controls');
  channel?.addEventListener('message', () => {
    suspend();
    if (mounted?.isConnected && session && navigator.onLine) void run(refresh);
  });
  window.addEventListener('0xdmme-message-controls', suspend);
  const devicesChannel =
    typeof BroadcastChannel === 'undefined'
      ? null
      : new BroadcastChannel('0xdmme-device-changes');
  devicesChannel?.addEventListener('message', suspend);

  const timer = setInterval(() => {
    if (
      busy ||
      !session ||
      !mounted?.isConnected ||
      !selected ||
      !navigator.onLine ||
      document.visibilityState !== 'visible'
    )
      return;
    void run(async () => {
      await resumePending();
      if (await controller.probe()) {
        await controller.synchronize();
        await controller.savePins();
      }
    });
  }, 15000);
  window.addEventListener('pagehide', (event) => {
    if (!event.persisted) {
      clearInterval(timer);
      channel?.close();
      devicesChannel?.close();
    }
    suspend();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      suspend();
      if (mounted?.isConnected && session && navigator.onLine)
        void run(refresh);
    }
  });
  return {
    setSession(value: AccountSession | null): void {
      if (sameSession(value)) {
        session = value;
        return;
      }
      generation++;
      refreshRequested = false;
      automaticAttempts = 0;
      session = value;
      contacts.setSession(value);
      controller.setSession(value);
      selected = null;
      attachments.clearSelection();

      message = value
        ? 'Abra os contatos e sincronize para conversar.'
        : 'Entre e autorize este aparelho para conversar.';
      renderHistory();
      status();
    },
    ready(): void {
      if (!busy && session && navigator.onLine)
        void run(
          mounted?.isConnected ? refresh : () => controller.initialize(),
        );
    },
    canActivate: () => !busy,
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = `<article class="card chat-panel"><h2>Conversas</h2><p data-message-status role="status"></p><button data-message-refresh type="button">Sincronizar</button><button data-message-resend type="button">Reenviar pendentes</button><button data-message-local type="button">Abrir cópia local offline</button><div class="chat-layout"><aside><h3>Contatos aprovados</h3><div data-message-contacts class="chat-contacts"></div><button data-message-more-contacts type="button" hidden>Mais contatos</button></aside><section><h3 data-message-peer></h3><p data-message-gate></p><div data-message-history class="chat-history" hidden></div><button data-message-older type="button">Mensagens anteriores</button><form data-message-form><label>Mensagem<textarea data-message-text rows="3"></textarea></label><label>Enviar como<select data-attachment-mode><option value="photo">Foto otimizada</option><option value="file">Arquivo original (até 3 MB)</option></select></label><label>Foto ou arquivo<input data-attachment-file type="file"></label><p>Foto: prévia e remoção de metadados no aparelho. Original: pode compartilhar GPS/EXIF. Vídeos ainda não são aceitos.</p><div data-attachment-preview></div><button data-attachment-clear type="button">Remover seleção</button><button class="primary" type="submit">Enviar</button></form><h3>Envios deste aparelho</h3><ul data-message-pending></ul></section></div></article>`;
      attachments.mount(container, run);
      node('[data-message-refresh]')?.addEventListener('click', () => {
        void run(refresh);
      });
      node('[data-message-resend]')?.addEventListener('click', () => {
        void run(async () => {
          await controller.loadPins();
          await controller.sendPending();
          await controller.synchronize();
          await controller.savePins();
        });
      });
      node('[data-message-local]')?.addEventListener('click', () => {
        void run(async () => {
          await controller.openOffline(selected?.accountId ?? null);
          message =
            'Cópia local offline: alterações remotas serão aplicadas antes da próxima abertura online.';
        });
      });
      node('[data-message-more-contacts]')?.addEventListener('click', () => {
        void run(() => refreshContacts(true));
      });
      node('[data-message-older]')?.addEventListener('click', () => {
        void run(async () => {
          if (!selected) return;
          controller.select(selected.accountId, true);
          if (navigator.onLine) await controller.synchronize();
          else await controller.openOffline(selected.accountId);
          await controller.savePins();
        });
      });
      node<HTMLFormElement>('[data-message-form]')?.addEventListener(
        'submit',
        (event) => {
          event.preventDefault();
          void run(submit);
        },
      );
      renderHistory();
      status();
      if (session && navigator.onLine) void run(refresh);
    },
  };
}
export { Messages } from './controller.ts';
