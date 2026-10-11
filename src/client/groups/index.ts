import { GroupActionsUi, showGroupManagement } from './actions-ui.ts';
import { paintAvatar } from '../appearance/index.ts';
import {
  chatIcon,
  chatCollapse,
  chatComposer,
  bindChatComposer,
  updateChatComposer,
  historyPosition,
  resetHistoryPosition,
  bindRecordGesture,
  showRecording,
} from '../chat-ui/index.ts';
import {
  groupTextQuota,
  groupMediaQuota,
} from '../../shared/group-quota/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { EmojiPicker, emojiIntoComposer, emojiText } from '../emoji/index.ts';
import { showExternalVideos } from '../external-video/index.ts';
import { externalVideoIds } from '../../shared/external-video/index.ts';
import { showExternalGif, gifMessageUrl } from '../gif-search/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { ExternalTextHistory } from '../external-media/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import type { Daily, PeerState } from '../daily/index.ts';
import { GroupController } from './controller.ts';
import type { GroupSummary } from './controller.ts';
import type { GroupView } from './reader.ts';
export type { GroupSummary, GroupView };
export { GroupBackups } from './backup.ts';
interface GroupOptions {
  externalMedia?: ExternalMediaConsent | undefined;
  playback: VoicePlayback;
  daily: Daily;
  run: (work: () => Promise<void>) => Promise<void>;
  changed: () => void;
  select: () => void;
  isBusy: () => boolean;
  alert: () => void;
  peers: () => readonly Peer[];
  organizationPeers?: () => readonly string[];
}
export function startGroups(
  access: VaultAccess,
  sync: VaultSync,
  options: GroupOptions,
) {
  const controller = new GroupController(
      access,
      sync,
      () =>
        document.visibilityState === 'visible' &&
        !!host?.getClientRects().length,
    ),
    emoji = new EmojiPicker(),
    attachments = new AttachmentUi(options.playback, voiceStatus);
  let session: AccountSession | null = null,
    host: HTMLElement | null = null,
    aside: HTMLElement | null = null,
    notice = 'Abra um grupo para conversar.';
  let states = new Map<string, PeerState>();
  let vault: Awaited<ReturnType<GroupController['vault']>> | null = null;
  let externalAbort = new AbortController();
  const externalRows = new ExternalTextHistory();
  const voice = new VoiceRecording({
    changed: () => voiceStatus(),
    completed: (selection) => {
      const selected = controller.selected;
      if (!session || !selected) {
        selection.bytes.fill(0);
        return;
      }
      attachments.selectVoice(selection, session.accountId);
      voiceStatus();
    },
  });
  const actions = new GroupActionsUi({
    access,
    controller,
    peers: options.peers,
    refresh,
    open: (id) => open(id),
    isBusy: options.isBusy,
    run: options.run,
  });
  function node<T extends HTMLElement>(selector: string): T | null {
    return host?.querySelector<T>(selector) ?? null;
  }
  function sidebar<T extends HTMLElement>(selector: string): T | null {
    return aside?.querySelector<T>(selector) ?? null;
  }
  function composerStatus(): void {
    updateChatComposer(node('[data-group-compose]'), {
      blocked: options.isBusy() || !controller.selected,
      recording: voice.active,
      attachment: attachments.selected !== null,
    });
  }
  function voiceStatus(): void {
    composerStatus();
    showRecording(node('[data-group-compose]'), voice.state);
    voiceControls();
  }
  function voiceControls(): void {
    const stop = node<HTMLButtonElement>('[data-voice-stop]');
    if (stop) stop.hidden = !voice.active;
    const cancel = node('[data-voice-cancel]');
    if (cancel) cancel.hidden = !voice.active;
    const start = node<HTMLButtonElement>('[data-voice-record]');
    if (start)
      start.disabled =
        options.isBusy() || voice.active || attachments.selected !== null;
    const file = node<HTMLInputElement>('[data-attachment-file]');
    if (file)
      file.disabled =
        options.isBusy() || voice.active || !!attachments.selected?.voice;
  }
  function status(): void {
    const label = node('[data-group-notice]');
    if (label)
      label.textContent = ['Grupo aberto.', 'Mensagem enviada.'].includes(
        notice,
      )
        ? ''
        : notice;
    const compose = node<HTMLFormElement>('[data-group-compose]');
    if (compose) compose.hidden = !!controller.selected?.localOnly;
    voiceStatus();
    renderCreation();
  }
  async function run(work: () => Promise<void>): Promise<void> {
    await options.run(async () => {
      try {
        await work();
      } catch (error: unknown) {
        notice =
          error instanceof Error
            ? error.message
            : 'Não foi possível concluir a operação do grupo.';
        throw error;
      } finally {
        status();
        options.changed();
      }
    });
  }
  function name(account: string): string {
    return account === session?.accountId
      ? 'Você'
      : options.peers().find((p) => p.accountId === account)?.name ||
          `Membro ${account.slice(0, 8)}`;
  }
  function listLabel(group: GroupSummary): string {
    const id = group.state.groupId,
      settings = options.daily.conversation(id),
      state = states.get(id);
    const cleanup = cleanupLabel(state);
    return `${settings.pinned ? '📌 ' : ''}${group.title} · ${group.localOnly ? 'cópia local do grupo' : 'grupo'}${state?.unread ? ` · ${state.unread} não lidas` : ''}${state && state.mutedUntil > Date.now() ? ' · silenciado' : ''}${cleanup}`;
  }
  function cleanupLabel(state: PeerState | undefined): string {
    return state?.cleanup
      ? ` · ⚠ limpeza de mídias em ${new Date(state.cleanup.dueAt).toLocaleString('pt-BR')}`
      : '';
  }
  async function refresh(more = false): Promise<void> {
    const previousGroup = controller.selected,
      selected = previousGroup?.state.groupId;
    await controller.refresh(more);
    updateOwnerNotice(previousGroup);
    options.daily.setGroups(
      controller.entries
        .filter((g) => !g.localOnly)
        .map((g) => ({ id: g.state.groupId, head: g.head })),
    );
    await options.daily.loadSettings([
      ...(options.organizationPeers?.() ??
        options.peers().map((p) => p.accountId)),
      ...controller.entries.map((g) => g.state.groupId),
    ]);
    const previous = states;
    states = navigator.onLine
      ? await options.daily.groupStates()
      : new Map<string, PeerState>();
    for (const [id, state] of states) {
      const old = previous.get(id);
      if (old && state.unread > old.unread && state.mutedUntil <= Date.now())
        options.alert();
    }
    renderIncoming();
    renderCreation();
    options.changed();
    await refreshSelected(selected);
  }
  function updateOwnerNotice(previous: GroupSummary | null): void {
    if (previous && previous.state.owner !== controller.selected?.state.owner)
      notice = 'Propriedade do grupo atualizada.';
  }
  async function refreshSelected(selected: string | undefined): Promise<void> {
    if (
      document.visibilityState !== 'visible' ||
      !host?.getClientRects().length
    )
      return;
    if (
      selected &&
      controller.entries.some((g) => g.state.groupId === selected)
    ) {
      const group = controller.entries.find(
        (g) => g.state.groupId === selected,
      );
      if (group?.localOnly) await controller.open(selected, false, true);
      await resumePending();
      await refreshVault();
      render();
    } else if (selected) {
      controller.close();
      render();
    }
  }
  async function resumePending(): Promise<void> {
    if (await controller.resumePending()) await reopen();
  }
  async function open(group: GroupSummary | string): Promise<void> {
    const id = typeof group === 'string' ? group : group.state.groupId,
      localOnly = typeof group === 'string' ? false : !!group.localOnly;
    if (voice.active || attachments.selected?.voice)
      throw new Error(
        'Envie ou remova a prévia de voz antes de trocar de conversa.',
      );
    if (controller.selected?.state.groupId !== id)
      resetHistoryPosition(node('[data-group-history]'));
    options.select();
    attachments.clearSelection();
    emoji.close();
    if (host) host.hidden = false;
    await controller.open(id, false, localOnly);
    await refreshVault();
    notice = controller.warning || 'Grupo aberto.';
    render();
    await pending();
  }
  function renderHistory(): void {
    attachments.clearMedia();
    const history = node('[data-group-history]');
    if (!history) return;
    const restoreScroll = historyPosition(history);
    externalRows.render(
      history,
      controller.views.map((view) => ({
        id: view.id,
        key:
          view.kind === 'text' && externalVideoIds(view.text).length > 0
            ? JSON.stringify([view.text, view.localOnly, view.sender])
            : null,
        render: (signal) => renderView(view, signal),
      })),
      externalAbort.signal,
    );
    for (const view of controller.views) {
      const row = history.querySelector<HTMLElement>(
        `[data-group-message="${view.id}"]`,
      );
      if (row) renderDelivery(row, view);
    }
    restoreScroll();
    const older = node('[data-group-older]');
    if (older) older.hidden = controller.before === null;
  }
  function renderView(view: GroupView, mediaSignal: AbortSignal): HTMLElement {
    const article = document.createElement('article');
    article.className = view.own ? 'chat-message own' : 'chat-message';
    article.dataset['groupMessage'] = view.id;
    const sender = document.createElement('strong');
    sender.textContent = name(view.sender);
    article.append(sender);
    if (view.kind === 'attachment') {
      attachments.render({
        article,
        view: { id: view.id, text: view.text, peer: view.sender },
        load: (_media, thumbnail) => controller.media(view, thumbnail),
        run,
      });
      if (view.unavailableMedia.length) {
        const unavailable = document.createElement('p');
        unavailable.textContent =
          'Mídia indisponível no cofre remoto. Uma cópia já baixada pode continuar neste aparelho.';
        article.append(unavailable);
      }
    } else {
      const text = document.createElement('p');
      emojiText(text, view.text);
      renderExternal(article, text, view.text, mediaSignal);
      article.append(text);
    }
    renderDelivery(article, view);
    if (view.localOnly) {
      const local = document.createElement('small');
      local.textContent = 'Cópia local · conteúdo indisponível no cofre remoto';
      article.append(local);
    }
    return article;
  }
  function renderDelivery(article: HTMLElement, view: GroupView): void {
    article.querySelector('.message-meta')?.remove();
    const checks = messageChecks({
      own: view.own,
      ...(view.delivery ? { delivery: view.delivery } : {}),
      read: view.read ?? false,
    });
    if (checks) {
      const state = document.createElement('small');
      state.className = 'message-meta';
      state.append(
        checksIcon({
          ...checks,
          label: view.read
            ? 'Vista pelos destinatários com confirmação de leitura'
            : checks.label,
        }),
      );
      article.append(state);
    }
  }
  function renderExternal(
    article: HTMLElement,
    text: HTMLElement,
    value: string,
    mediaSignal: AbortSignal,
  ): void {
    if (!options.externalMedia) return;
    const settings = {
      privacy: options.externalMedia,
      signal: mediaSignal,
    };
    const gif = gifMessageUrl(value);
    if (gif) {
      text.replaceChildren();
      showExternalGif(text, gif, settings);
    }
    showExternalVideos(article, value, settings);
  }
  function render(): void {
    const group = controller.selected;
    if (!group) {
      if (host) host.hidden = true;
      return;
    }
    const heading = node('[data-group-title]');
    if (heading) heading.textContent = group.title;
    const avatar = node('[data-group-avatar]');
    if (avatar)
      paintAvatar(avatar, { label: group.title, seed: group.state.groupId });
    const count = node('[data-group-count]');
    if (count)
      count.textContent = group.localOnly
        ? 'Cópia local independente · sem acesso remoto concedido por esta cópia'
        : `${group.state.members.length} participantes`;
    renderLocalControls(group);
    renderHistory();
    renderMembers();
    renderVault();
    renderInvites();
    status();
  }
  function renderLocalControls(group: GroupSummary): void {
    for (const selector of [
      '[data-group-leave]',
      '[data-group-owner-note]',
      '[data-group-delete]',
      '[data-group-clear]',
    ]) {
      const control = node(selector);
      if (control) control.hidden = !!group.localOnly;
    }
  }
  function button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => void run(work));
    return b;
  }
  function renderMembers(): void {
    const list = node('[data-group-members]'),
      group = controller.selected;
    if (!list || !group || !session) return;
    list.replaceChildren();
    for (const member of group.state.members) {
      const row = document.createElement('li'),
        label = document.createElement('span');
      label.textContent = `${name(member.accountId)} · ${member.role === 'owner' ? 'Dono' : member.role === 'admin' ? 'Administrador' : 'Membro'}`;
      row.append(label);
      renderMemberActions(row, group, member);
      list.append(row);
    }
    renderOwnership(group, session);
  }
  function renderOwnership(group: GroupSummary, session: AccountSession): void {
    const leave = node('[data-group-leave]');
    if (leave)
      leave.hidden =
        !!group.localOnly || group.state.owner === session.accountId;
    const transfer = node('[data-group-owner-note]');
    if (transfer)
      transfer.hidden =
        !!group.localOnly || group.state.owner !== session.accountId;
    const deletion = node('[data-group-delete]');
    if (deletion)
      deletion.hidden =
        !!group.localOnly || group.state.owner !== session.accountId;
  }
  function renderMemberActions(
    row: HTMLElement,
    group: GroupSummary,
    member: GroupSummary['state']['members'][number],
  ): void {
    if (
      !session ||
      group.localOnly ||
      member.role === 'owner' ||
      member.accountId === session.accountId
    )
      return;
    if (groupManager(group.state, session.accountId))
      row.append(
        button('Remover', async () => {
          if (!window.confirm(`Remover ${name(member.accountId)} do grupo?`))
            return;
          await controller.change({ kind: 'remove', target: member.accountId });
          await refresh();
        }),
      );
    if (group.state.owner !== session.accountId) return;
    row.append(
      button(
        member.role === 'admin' ? 'Tornar membro' : 'Tornar administrador',
        async () => {
          await controller.change({
            kind: 'role',
            target: member.accountId,
            role: member.role === 'admin' ? 'member' : 'admin',
          });
          await refresh();
        },
      ),
    );
    row.append(
      button('Oferecer propriedade', async () => {
        if (
          !window.confirm(
            `Oferecer a propriedade a ${name(member.accountId)}? Ele precisa aceitar. Você ficará como membro comum após o aceite.`,
          )
        )
          return;
        await controller.propose(member.accountId, 'transfer');
        notice =
          'Transferência oferecida. A propriedade muda após o aceite do membro escolhido.';
      }),
    );
  }
  function renderInvites(): void {
    showGroupManagement(
      node('[data-group-manage]'),
      controller.selected,
      session?.accountId,
    );
  }
  async function refreshVault(): Promise<void> {
    vault =
      controller.selected?.localOnly ||
      !node<HTMLDetailsElement>('[data-group-vault]')?.open
        ? null
        : await controller.vault();
  }
  function renderVault(): void {
    const value = node('[data-group-usage]');
    if (value)
      value.textContent = vault
        ? `Texto e administração: ${(vault.textBytes / 1_000_000).toFixed(2)} / ${groupTextQuota / 1_000_000} MB · mídia: ${(vault.mediaBytes / 1_000_000).toFixed(2)} / ${groupMediaQuota / 1_000_000} MB`
        : '';
    const warning = node('[data-group-cleanup-warning]');
    if (warning)
      warning.textContent = vault?.notice
        ? `Limpeza de mídias antigas prevista para ${new Date(vault.notice.dueAt).toLocaleString('pt-BR')}. Cerca de ${(vault.notice.bytes / 1_000_000).toFixed(2)} MB selecionados. Textos permanecem.`
        : '';
    const clear = node('[data-group-clear]');
    if (clear) clear.hidden = !canClear();
    renderCleanupItems();
  }
  function canClear(): boolean {
    const group = controller.selected;
    return (
      !!group && !group.localOnly && group.state.owner === session?.accountId
    );
  }
  function renderCleanupItems(): void {
    const more = node('[data-group-cleanup-more]');
    if (more) more.hidden = vault?.next === null || !vault;
    const selected = node('[data-group-cleanup-items]');
    if (selected) {
      selected.replaceChildren();
      for (const item of vault?.items ?? []) {
        const li = document.createElement('li');
        li.textContent = `Mensagem ${item.message.slice(0, 8)} · ${(item.bytes / 1_000_000).toFixed(2)} MB`;
        selected.append(li);
      }
    }
  }
  function renderIncoming(): void {
    const list = sidebar('[data-group-incoming]');
    if (!list) return;
    list.replaceChildren();
    for (const consent of controller.incoming) {
      const row = document.createElement('div'),
        label = document.createElement('p');
      label.textContent =
        consent.kind === 'invite'
          ? `${name(consent.actor)} convidou você para um grupo.`
          : `${name(consent.actor)} ofereceu a propriedade de um grupo. É necessário aceitar para assumir a administração.`;
      row.append(label);
      row.append(
        button(
          consent.kind === 'invite' ? 'Entrar no grupo' : 'Aceitar propriedade',
          async () => {
            await controller.respond(consent, true);
            await refresh();
            const group = controller.entries.find(
              (g) => g.state.groupId === consent.groupId,
            );
            if (group) await open(group);
          },
        ),
      );
      row.append(
        button('Recusar', async () => {
          await controller.respond(consent, false);
          await controller.refreshIncoming();
          renderIncoming();
        }),
      );
      list.append(row);
    }
    const more = sidebar('[data-group-more-incoming]');
    if (more) more.hidden = controller.incomingNext === null;
  }
  function renderCreation(): void {
    const mode = sidebar('[data-group-mode]');
    if (mode)
      mode.textContent =
        controller.mode === 'configured'
          ? 'Criação gratuita, sem limite de quantidade. Até uma criação por minuto e dez por hora.'
          : 'Consultando disponibilidade de grupos…';
    const toggle = sidebar<HTMLButtonElement>('[data-group-new]');
    if (toggle)
      toggle.disabled = options.isBusy() || controller.mode === 'unavailable';
    const cancel = sidebar('[data-group-cancel-create]');
    if (cancel) cancel.hidden = !controller.creationPending;
  }
  async function pending(): Promise<void> {
    const list = node('[data-group-pending]');
    if (!list) return;
    list.replaceChildren();
    for (const draft of await controller.pending()) {
      const row = document.createElement('li');
      row.textContent = `Rascunho ${draft.id.slice(0, 8)} pendente `;
      row.append(
        button('Retomar', async () => {
          await controller.sendPending();
          await reopen();
        }),
      );
      row.append(
        button('Descartar rascunho local', async () => {
          await controller.discard(draft.id);
          await pending();
          notice =
            'Rascunho local descartado. Isso não exclui uma mensagem que já tenha sido aceita.';
        }),
      );
      list.append(row);
    }
  }
  async function reopen(older = false): Promise<void> {
    const id = controller.selected?.state.groupId;
    if (!id) return;
    await controller.open(id, older, !!controller.selected?.localOnly);
    await refreshVault();
    if (controller.warning) notice = controller.warning;
    render();
    await pending();
  }
  function bind(selector: string, handler: () => void): void {
    node(selector)?.addEventListener('click', handler);
  }
  function bindChat(): void {
    node<HTMLDetailsElement>('[data-group-vault]')?.addEventListener(
      'toggle',
      () => {
        if (
          node<HTMLDetailsElement>('[data-group-vault]')?.open &&
          !options.isBusy()
        )
          void run(async () => {
            await refreshVault();
            renderVault();
          });
      },
    );
    bind(
      '[data-group-cleanup-more]',
      () =>
        void run(async () => {
          if (vault?.next === null || !vault) return;
          vault = await controller.vault(vault.next);
          renderVault();
        }),
    );
    node<HTMLFormElement>('[data-group-compose]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void run(async () => {
          const input = node<HTMLTextAreaElement>('[data-group-text]');
          await controller.compose(input?.value ?? '', attachments.selected);
          attachments.clearSelection();
          voice.cancel();
          if (input) {
            input.value = '';
            input.dispatchEvent(new Event('input'));
          }
          await controller.sendPending();
          await reopen();
          notice = 'Mensagem enviada.';
        });
      },
    );
    bind('[data-group-older]', () => void run(() => reopen(true)));
    bind('[data-group-emoji]', () => {
      const anchor = node('[data-group-emoji]'),
        input = node<HTMLTextAreaElement>('[data-group-text]');
      if (!anchor || !input) return;
      void emojiIntoComposer(emoji, anchor, input).catch(() => {
        notice = 'Não foi possível abrir os emojis.';
        status();
      });
    });
    bindRecordGesture(node('[data-voice-record]'), {
      start: () => {
        if (!options.isBusy() && !voice.active && !attachments.selected)
          void voice.start();
      },
      // Releasing before the microphone opens keeps recording hands-free.
      release: () => {
        if (voice.state.phase === 'recording') void voice.stop();
      },
    });
    bind('[data-voice-stop]', () => void voice.stop());
    bind('[data-voice-cancel]', () => voice.cancel());
    bind('[data-attachment-clear]', () => {
      if (!voice.active) voice.cancel();
    });
    bind(
      '[data-group-leave]',
      () =>
        void run(async () => {
          if (
            !window.confirm(
              'Sair do grupo? Você perderá o acesso ao cofre remoto.',
            )
          )
            return;
          await controller.change({
            kind: 'leave',
            target: session?.accountId ?? null,
          });
          await refresh();
          render();
        }),
    );
    bind(
      '[data-group-delete]',
      () =>
        void run(async () => {
          if (
            !window.confirm(
              'Excluir o grupo e iniciar a remoção do cofre remoto para todos? Cópias já conservadas pelos participantes continuam sob controle deles.',
            )
          )
            return;
          await controller.change({ kind: 'delete', target: null });
          await refresh();
          render();
        }),
    );
    bind(
      '[data-group-clear]',
      () =>
        void run(async () => {
          if (
            !window.confirm(
              'Limpar o conteúdo do cofre remoto deste grupo? Mensagens e mídias serão removidas; cópias locais e arquivos já salvos podem permanecer.',
            )
          )
            return;
          await controller.clearVault();
          notice = 'Limpeza do cofre iniciada.';
          await reopen();
        }),
    );
    node('[data-group-manage]')?.addEventListener('click', () =>
      actions.showManage(),
    );
  }
  function bindAside(): void {
    sidebar('[data-group-new]')?.addEventListener('click', () =>
      actions.showCreate(),
    );
    sidebar('[data-group-cancel-create]')?.addEventListener(
      'click',
      () =>
        void run(async () => {
          await controller.cancelCreation();
          notice =
            'Pedido local descartado. Se o servidor já tiver criado o grupo, ele continuará na lista.';
          await refresh();
        }),
    );
    sidebar('[data-group-more-incoming]')?.addEventListener(
      'click',
      () =>
        void run(async () => {
          await controller.refreshIncoming(true);
          renderIncoming();
        }),
    );
  }
  function deselect(): void {
    if (voice.active || attachments.selected?.voice)
      throw new Error(
        'Envie ou remova a prévia de voz antes de trocar de conversa.',
      );
    controller.close();
    attachments.clearSelection();
    attachments.clearMedia();
    emoji.close();
    if (host) host.hidden = true;
  }
  function leave(): void {
    externalRows.clear();
    externalAbort.abort();
    externalAbort = new AbortController();
    if (voice.active)
      void voice.stop(
        'Navegação interrompeu a gravação. Confira o trecho ao voltar.',
      );
    attachments.clearMedia();
    attachments.pausePreview();
    emoji.close();
  }
  function clearSessionPanels(): void {
    for (const container of [host, aside]) {
      container?.querySelectorAll('form').forEach((form) => form.reset());
      container
        ?.querySelectorAll(
          'ul, [data-group-incoming], [data-group-history], [data-attachment-preview]',
        )
        .forEach((list) => list.replaceChildren());
    }
    actions.reset();
    notice = 'Abra um grupo para conversar.';
  }
  window.addEventListener('beforeunload', (event) => {
    if (!voice.active && !attachments.selected?.voice) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && voice.active)
      void voice.stop(
        'O navegador interrompeu a gravação. Confira o trecho preservado ao voltar.',
      );
  });
  return {
    create: () => actions.showCreate(),
    join: (url = '') => actions.showJoin(url),
    get entries(): readonly GroupSummary[] {
      return controller.entries;
    },
    get next(): string | null {
      return controller.next;
    },
    get selected(): GroupSummary | null {
      return controller.selected;
    },
    get recording(): boolean {
      return voice.active || !!attachments.selected?.voice;
    },
    listLabel,
    /** Invitations and ownership offers for Atividade, named as in the group tools. */
    async invites(): Promise<
      readonly { id: string; kind: 'invite' | 'transfer'; actor: string }[]
    > {
      await controller.refreshIncoming();
      return controller.incoming.map((consent) => ({
        id: consent.id,
        kind: consent.kind,
        actor: name(consent.actor),
      }));
    },
    async respondInvite(id: string, accept: boolean): Promise<void> {
      const consent = controller.incoming.find((item) => item.id === id);
      if (!consent) throw new Error('Este convite não está mais disponível.');
      await controller.respond(consent, accept);
      if (accept) await refresh();
      await controller.refreshIncoming();
      renderIncoming();
    },
    unread: (id: string) => states.get(id)?.unread ?? 0,
    search: (query: string, after: string | null) =>
      controller.search(query, after),
    refresh,
    synchronizeAll: (signal: AbortSignal) => controller.synchronizeAll(signal),
    pauseSynchronization: () => controller.pauseSynchronization(),
    resumePending,
    open,
    status,
    deselect,
    historyChanged: () => controller.historyChanged(),
    setSession(value: AccountSession | null): void {
      const identity = (s: AccountSession | null) =>
        s ? [s.accountId, s.deviceId, s.csrf].join(':') : '';
      if (identity(value) === identity(session)) {
        session = value;
        controller.setSession(value);
        return;
      }
      session = value;
      actions.setSession(value);
      externalRows.clear();
      externalAbort.abort();
      externalAbort = new AbortController();
      controller.setSession(value);
      voice.cancel();
      attachments.clearSelection();
      attachments.clearMedia();
      emoji.reset();
      clearSessionPanels();
      states.clear();
      vault = null;
      render();
    },
    suspend(revoked = false): void {
      if (revoked) controller.revokeAuthority();
      else controller.hide();
      attachments.clearMedia();
      renderHistory();
      if (revoked) {
        voice.cancel();
        attachments.clearSelection();
      }
    },
    leave,
    canActivate: () => !voice.active && !attachments.selected,
    mount(container: HTMLElement, sidebarContainer: HTMLElement): void {
      host = container;
      aside = sidebarContainer;
      container.hidden = !controller.selected;
      if (session) container.dataset['voicePeer'] = session.accountId;
      sidebarContainer.innerHTML = `<button data-group-new type="button">Novo grupo</button><p data-group-mode></p><button data-group-cancel-create type="button" hidden>Descartar pedido local de criação</button><details><summary>Convites e transferências de grupos</summary><div data-group-incoming></div><button data-group-more-incoming type="button" hidden>Mais convites</button></details>`;
      container.innerHTML = `<header class="chat-header"><button data-chat-back class="chat-icon chat-mobile-back" type="button" aria-label="Voltar às conversas">${chatIcon('back')}</button><span data-group-avatar class="chat-peer-avatar" aria-hidden="true">#</span><div class="chat-peer"><h3 data-group-title></h3><p data-group-count></p></div><details class="chat-options"><summary class="chat-icon" aria-label="Opções do grupo" title="Opções do grupo">${chatIcon('more')}</summary><div class="chat-popover group-options"><details><summary>Participantes e administração</summary><ul data-group-members></ul><button data-group-manage type="button">Adicionar participantes</button><p data-group-owner-note>Para sair, ofereça a propriedade a outro membro e aguarde o aceite. A propriedade muda somente após o aceite.</p><button data-group-leave type="button">Sair do grupo</button><button data-group-delete type="button">Excluir grupo</button></details><details data-group-vault><summary>Cofre do grupo</summary><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>Próximas mídias selecionadas</button><p><a href="#cofre">Salvar um backup cifrado</a> para conservar uma cópia das mídias antes da limpeza. Status não entra no backup.</p><button data-group-clear type="button">Limpar cofre remoto</button></details></div></details>${chatCollapse()}</header><p data-group-notice class="compose-notice" role="status"></p><div class="chat-thread"><button data-group-older class="chat-older" type="button" hidden>Mensagens anteriores</button><div data-group-history class="chat-history" tabindex="0" aria-label="Mensagens do grupo"></div><ul data-group-pending class="chat-pending" aria-label="Envios pendentes no grupo"></ul></div>${chatComposer('group')}`;
      attachments.mount(container, run);
      const form = node('[data-group-compose]');
      if (form) bindChatComposer(form, composerStatus);
      bindChat();
      bindAside();
      renderCreation();
      renderIncoming();
    },
  };
}
