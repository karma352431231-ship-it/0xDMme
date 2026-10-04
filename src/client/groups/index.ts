import type { AccountSession } from '../../shared/account/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import { voiceDuration, voiceRate } from '../../shared/voice/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import { VoiceRecording } from '../voice-recording/index.ts';
import { AttachmentUi } from '../attachment-ui/index.ts';
import { EmojiPicker, emojiIntoComposer, emojiText } from '../emoji/index.ts';
import { messageChecks } from '../message-status/index.ts';
import type { Daily, PeerState } from '../daily/index.ts';
import { GroupController } from './controller.ts';
import type { GroupSummary } from './controller.ts';
import type { GroupView } from './reader.ts';
export type { GroupSummary, GroupView };
export { GroupBackups } from './backup.ts';
interface GroupOptions {
  playback: VoicePlayback;
  daily: Daily;
  run: (work: () => Promise<void>) => Promise<void>;
  changed: () => void;
  select: () => void;
  isBusy: () => boolean;
  alert: () => void;
  peers: () => readonly Peer[];
}
export function startGroups(
  access: VaultAccess,
  sync: VaultSync,
  options: GroupOptions,
) {
  const controller = new GroupController(access, sync),
    emoji = new EmojiPicker(),
    attachments = new AttachmentUi(options.playback, voiceStatus);
  let session: AccountSession | null = null,
    host: HTMLElement | null = null,
    aside: HTMLElement | null = null,
    notice = 'Abra um grupo para conversar.';
  let states = new Map<string, PeerState>(),
    creating = false;
  let vault: Awaited<ReturnType<GroupController['vault']>> | null = null;
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
  function node<T extends HTMLElement>(selector: string): T | null {
    return host?.querySelector<T>(selector) ?? null;
  }
  function sidebar<T extends HTMLElement>(selector: string): T | null {
    return aside?.querySelector<T>(selector) ?? null;
  }
  function voiceStatus(): void {
    const label = node('[data-voice-status]');
    if (label)
      label.textContent =
        voice.state.notice +
        (voice.active
          ? ` ${voiceDuration({ samples: voice.state.samples, sampleRate: voiceRate })} / 1:30`
          : '');
    const stop = node<HTMLButtonElement>('[data-voice-stop]');
    if (stop) stop.hidden = !voice.active;
    const start = node<HTMLButtonElement>('[data-voice-record]');
    if (start)
      start.disabled =
        options.isBusy() || voice.active || attachments.selected !== null;
    const file = node<HTMLInputElement>('[data-attachment-file]');
    if (file) file.disabled = voice.active || !!attachments.selected?.voice;
  }
  function status(): void {
    const label = node('[data-group-notice]');
    if (label) label.textContent = notice;
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
      ...options.peers().map((p) => p.accountId),
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
  async function open(group: GroupSummary): Promise<void> {
    if (voice.active || attachments.selected?.voice)
      throw new Error(
        'Envie ou remova a prévia de voz antes de trocar de conversa.',
      );
    options.select();
    attachments.clearSelection();
    emoji.close();
    if (host) host.hidden = false;
    await controller.open(group.state.groupId, false, !!group.localOnly);
    await refreshVault();
    notice = controller.warning || 'Grupo aberto.';
    render();
    await pending();
  }
  function renderHistory(): void {
    attachments.clearMedia();
    const history = node('[data-group-history]');
    if (!history) return;
    history.replaceChildren();
    for (const view of controller.views) renderView(history, view);
    const older = node('[data-group-older]');
    if (older) older.hidden = controller.before === null;
  }
  function renderView(history: HTMLElement, view: GroupView): void {
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
      article.append(text);
    }
    const checks = messageChecks({
      own: view.own,
      ...(view.delivery ? { delivery: view.delivery } : {}),
      read: view.read ?? false,
    });
    if (checks) {
      const state = document.createElement('span');
      state.textContent = checks.text;
      state.className = `message-checks ${checks.color}`;
      state.setAttribute(
        'aria-label',
        view.read
          ? 'Vista pelos destinatários com confirmação de leitura'
          : checks.label,
      );
      article.append(state);
    }
    if (view.localOnly) {
      const local = document.createElement('small');
      local.textContent = 'Cópia local · conteúdo indisponível no cofre remoto';
      article.append(local);
    }
    history.append(article);
  }
  function render(): void {
    const group = controller.selected;
    if (!group) {
      if (host) host.hidden = true;
      return;
    }
    const heading = node('[data-group-title]');
    if (heading) heading.textContent = group.title;
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
      '[data-group-archive]',
      '[data-group-pin]',
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
            `Oferecer a propriedade a ${name(member.accountId)}? Ele precisa aceitar e ser elegível. Você ficará como membro comum após o aceite.`,
          )
        )
          return;
        await controller.propose(member.accountId, 'transfer');
        notice =
          'Transferência oferecida. A propriedade muda após o aceite e a conferência de elegibilidade.';
      }),
    );
  }
  function renderInvites(): void {
    const select = node<HTMLSelectElement>('[data-group-invite-target]'),
      group = controller.selected,
      form = node('[data-group-invite]');
    if (form)
      form.hidden =
        !group ||
        !!group.localOnly ||
        !session ||
        !groupManager(group.state, session.accountId);
    if (!select || !group) return;
    select.replaceChildren();
    for (const peer of options
      .peers()
      .filter(
        (p) => !group.state.members.some((m) => m.accountId === p.accountId),
      )) {
      const option = document.createElement('option');
      option.value = peer.accountId;
      option.textContent = peer.name || peer.address;
      select.append(option);
    }
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
        ? `Texto e administração: ${(vault.textBytes / 1_000_000).toFixed(2)} / 250 MB · mídia: ${(vault.mediaBytes / 1_000_000).toFixed(2)} / 750 MB`
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
          : `${name(consent.actor)} ofereceu a propriedade de um grupo. É necessário aceitar e comprovar elegibilidade.`;
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
        controller.mode === 'fixture'
          ? 'Teste local: criação usa saldo sintético.'
          : controller.mode === 'unavailable'
            ? 'A criação de grupos será liberada quando o token do projeto estiver configurado.'
            : '';
    const toggle = sidebar<HTMLButtonElement>('[data-group-new]');
    if (toggle)
      toggle.disabled = options.isBusy() || controller.mode === 'unavailable';
    const form = sidebar('[data-group-create]');
    if (form) form.hidden = !creating;
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
          if (input) input.value = '';
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
    bind('[data-voice-record]', () => {
      if (!options.isBusy() && !voice.active && !attachments.selected)
        void voice.start();
    });
    bind('[data-voice-stop]', () => void voice.stop());
    bind('[data-voice-cancel]', () => voice.cancel());
    bind(
      '[data-group-archive]',
      () =>
        void run(async () => {
          const id = controller.selected?.state.groupId;
          if (!id) return;
          await options.daily.organize(id, {
            archived: !options.daily.conversation(id).archived,
          });
          await refresh();
        }),
    );
    bind(
      '[data-group-pin]',
      () =>
        void run(async () => {
          const id = controller.selected?.state.groupId;
          if (!id) return;
          await options.daily.organize(id, {
            pinned: !options.daily.conversation(id).pinned,
          });
          options.changed();
        }),
    );
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
    node<HTMLFormElement>('[data-group-invite]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void run(async () => {
          const target = node<HTMLSelectElement>(
            '[data-group-invite-target]',
          )?.value;
          if (!target) throw new Error('Selecione um contato aprovado.');
          await controller.propose(target, 'invite');
          notice = 'Convite enviado. O contato precisa aceitar para entrar.';
        });
      },
    );
  }
  function bindAside(): void {
    sidebar('[data-group-new]')?.addEventListener('click', () => {
      creating = !creating;
      renderCreation();
    });
    sidebar<HTMLFormElement>('[data-group-create]')?.addEventListener(
      'submit',
      (event) => {
        event.preventDefault();
        void run(async () => {
          const title =
            sidebar<HTMLInputElement>('[data-group-name]')?.value ?? '';
          const id = await controller.create(title);
          creating = false;
          await refresh();
          const group = controller.entries.find((g) => g.state.groupId === id);
          if (group) await open(group);
          notice = controller.warning || 'Grupo criado.';
        });
      },
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
    if (voice.active)
      void voice.stop(
        'Navegação interrompeu a gravação. Confira o trecho ao voltar.',
      );
    attachments.clearMedia();
    attachments.pausePreview();
    emoji.close();
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
    refresh,
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
      controller.setSession(value);
      voice.cancel();
      attachments.clearSelection();
      attachments.clearMedia();
      emoji.reset();
      states.clear();
      vault = null;
      render();
    },
    suspend(revoked = false): void {
      controller.hide();
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
      sidebarContainer.innerHTML = `<button data-group-new type="button">Novo grupo</button><p data-group-mode></p><form data-group-create hidden><label>Nome do grupo<input data-group-name maxlength="160" required></label><button type="submit">Criar grupo</button></form><button data-group-cancel-create type="button" hidden>Descartar pedido local de criação</button><details><summary>Convites e transferências de grupos</summary><div data-group-incoming></div><button data-group-more-incoming type="button" hidden>Mais convites</button></details>`;
      container.innerHTML = `<h3 data-group-title></h3><p data-group-count></p><p data-group-notice role="status"></p><button data-group-archive type="button">Arquivar/desarquivar</button><button data-group-pin type="button">Fixar/desfixar</button><div data-group-history class="chat-history"></div><button data-group-older type="button">Mensagens anteriores</button><form data-group-compose><label>Mensagem<textarea data-group-text rows="3"></textarea></label><button data-group-emoji type="button">Escolher emoji</button><label>Enviar como<select data-attachment-mode><option value="photo">Foto otimizada</option><option value="file">Arquivo original (até 3 MB)</option></select></label><label>Foto ou arquivo<input data-attachment-file type="file"></label><button data-voice-record type="button">Gravar voz</button><button data-voice-stop type="button" hidden>Parar e conferir</button><button data-voice-cancel type="button" hidden>Cancelar gravação</button><p data-voice-status role="status"></p><p>Voz: até 90 segundos. Ouça a prévia e toque em Enviar.</p><div data-attachment-preview></div><button data-attachment-clear type="button">Remover seleção</button><button class="primary" type="submit">Enviar</button></form><ul data-group-pending></ul><details><summary>Participantes e administração</summary><ul data-group-members></ul><form data-group-invite><label>Convidar contato<select data-group-invite-target></select></label><button type="submit">Enviar convite</button></form><p data-group-owner-note>Para sair, ofereça a propriedade a outro membro e aguarde o aceite. Ele precisa ter saldo e vaga para assumir.</p><button data-group-leave type="button">Sair do grupo</button><button data-group-delete type="button">Excluir grupo</button></details><details data-group-vault><summary>Cofre do grupo</summary><p data-group-usage></p><p data-group-cleanup-warning role="status"></p><ul data-group-cleanup-items></ul><button data-group-cleanup-more type="button" hidden>Próximas mídias selecionadas</button><p><a href="#cofre">Salvar um backup cifrado</a> para conservar uma cópia das mídias antes da limpeza. Status não entra no backup.</p><button data-group-clear type="button">Limpar cofre remoto</button></details>`;
      attachments.mount(container, run);
      bindChat();
      bindAside();
      renderCreation();
      renderIncoming();
    },
  };
}
