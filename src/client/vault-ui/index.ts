import type { AccountSession } from '../../shared/account/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
import type { VaultChange } from '../../shared/vault/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { VaultSync } from '../vault-sync/index.ts';
import { storageEstimate, rememberLocator } from '../vault-storage/index.ts';
const template = `<article class="card vault-card"><span class="eyebrow">COFRE PESSOAL</span><h2>Uma cópia que você pode recuperar.</h2>
<p>Agenda privada, configurações e dados de teste ficam cifrados. Conversas e anexos serão integrados nas próximas etapas. Confirmado no cofre significa que o conteúdo está preservado remotamente; salvo só neste aparelho ainda precisa sincronizar.</p>
<p data-vault-status role="status">Conecte e autorize este aparelho para abrir o cofre.</p><progress data-vault-usage max="300000000" value="0" aria-label="Uso do cofre"></progress><p data-vault-quota>300 MB pessoais · uso ainda não conferido</p><p data-vault-local></p>
<button data-vault-action="sync" class="primary" type="button">Abrir / sincronizar cofre</button><button data-vault-action="local" type="button">Abrir somente cópia local</button><button data-vault-action="persist" type="button">Solicitar persistência local</button>
<div data-vault-pending hidden><p>Rascunho cifrado salvo neste aparelho. Ainda não confirmado no cofre.</p><button data-vault-action="retry" type="button">Retomar envio</button><button data-vault-action="discard" type="button">Descartar rascunho incompleto</button></div><div data-vault-reservations></div>
<form data-vault-form><h3 data-vault-editor-title>Novo item privado</h3><label for="vault-kind">Tipo</label><select id="vault-kind" data-vault-kind><option value="contact">Contato privado</option><option value="settings">Configuração</option><option value="test">Dado de teste</option></select><label>Nome privado<input data-vault-label maxlength="80" required autocomplete="off"></label><label>Conteúdo privado<textarea data-vault-value required maxlength="200000" rows="5" spellcheck="false"></textarea></label><p>Salvar um contato aqui preserva sua agenda particular. Isso não envia convite nem autoriza mensagens.</p><button class="primary" type="submit">Salvar no cofre</button><button data-vault-action="new" type="button">Criar outro item</button></form>
<h3>Versões preservadas</h3><p data-vault-index></p><ul data-vault-list class="vault-list"></ul><button data-vault-action="more" type="button">Mostrar mais versões carregadas</button><p class="detail">Nenhuma versão confirmada expira automaticamente. Apagar todos os dados deste navegador exige autorizar ou recuperar novamente. Sem checkpoint independente, uma restauração limpa verifica integridade, mas não prova que o servidor mostrou a versão mais recente.</p></article>`;
export function startVault(access: VaultAccess) {
  const sync = new VaultSync(access);
  let mounted: HTMLElement | null = null;
  let busy = false;
  let message = 'Conecte e autorize este aparelho para abrir o cofre.';
  let editing: Pick<VaultChange, 'entity' | 'kind' | 'parents'> | null = null;
  let displayed = 0;
  let discardArmed = false;
  const channel =
    typeof BroadcastChannel === 'function'
      ? new BroadcastChannel('0xdmme-vault-changes')
      : null;
  function node<T extends HTMLElement>(selector: string): T | null {
    return mounted?.querySelector<T>(selector) ?? null;
  }
  function text(selector: string, value: string): void {
    const target = node(selector);
    if (target) target.textContent = value;
  }
  function value(selector: string): string {
    return (
      node<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)
        ?.value ?? ''
    );
  }
  function storageSize(bytes: number): string {
    if (!bytes) return '0 B';
    return bytes < 1_000_000
      ? (bytes / 1000).toFixed(1) + ' KB'
      : (bytes / 1_000_000).toFixed(2) + ' MB';
  }
  function render(): void {
    text('[data-vault-status]', message);
    text(
      '[data-vault-quota]',
      sync.complete || sync.state.sequence || sync.state.used
        ? `${storageSize(sync.state.used)} / 300 MB · inclui versões e envios em andamento${sync.state.used >= vaultQuota * 0.9 ? ' · próximo do limite' : ''}`
        : '300 MB pessoais · uso ainda não conferido',
    );
    const progress = node<HTMLProgressElement>('[data-vault-usage]');
    if (progress) progress.value = sync.state.used;
    const pending = node('[data-vault-pending]');
    if (pending) pending.hidden = !sync.pending;
    const authorized = sync.session !== null || sync.localOpened;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled =
        busy || (!authorized && button.dataset['vaultAction'] !== 'local');
    });
    text(
      '[data-vault-index]',
      `${sync.entries.size} versões carregadas · ${sync.complete ? 'índice local conferido' : 'continue carregando para conferir o índice'} · blocos abertos sob demanda`,
    );
    renderVersions();
    renderReservations();
  }
  function button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const result = document.createElement('button');
    result.type = 'button';
    result.textContent = label;
    result.disabled = busy;
    result.addEventListener('click', () => {
      void operate(work);
    });
    return result;
  }
  function renderVersions(): void {
    const list = node('[data-vault-list]');
    if (!list) return;
    list.replaceChildren();
    const currentHeads = sync.currentHeads();
    for (const entry of [...sync.entries.values()]
      .reverse()
      .slice(displayed, displayed + 16)) {
      const item = document.createElement('li');
      const title = document.createElement('p');
      const heads = currentHeads.get(entry.change.entity) ?? [];
      title.textContent = `${entry.change.label} · versão ${entry.commit.sequence} · ${heads.length > 1 ? 'conflito: ' + heads.length + ' edições preservadas' : heads.some((e) => e.commit.id === entry.commit.id) ? 'atual' : 'histórica'} · confirmado no cofre`;
      item.append(
        title,
        button('Abrir / editar esta versão', () =>
          edit(entry.commit.id, false),
        ),
      );
      if (heads.length > 1)
        item.append(
          button('Resolver conflito usando esta versão', () =>
            edit(entry.commit.id, true),
          ),
        );
      list.append(item);
    }
  }
  function renderReservations(): void {
    const list = node('[data-vault-reservations]');
    if (!list) return;
    list.replaceChildren();
    for (const pending of sync.remotePending.filter(
      (c) => c.id !== sync.pending?.commit.id,
    )) {
      const row = document.createElement('p');
      row.textContent =
        'Upload remoto incompleto, sem confirmação de recuperabilidade. ';
      row.append(
        button('Liberar reserva incompleta', async () => {
          if (
            !window.confirm(
              'Descartar este upload incompleto? Versões confirmadas serão preservadas.',
            )
          )
            return;
          await sync.discard(pending.id);
          message = 'Reserva incompleta liberada.';
        }),
      );
      list.append(row);
    }
  }
  async function edit(id: string, resolve: boolean): Promise<void> {
    const entry = sync.entries.get(id);
    if (!entry) return;
    const content = await sync.open(id);
    editing = {
      entity: entry.change.entity,
      kind: entry.change.kind,
      parents: resolve ? resolveParents(entry.change.entity, id) : [id],
    };
    const label = node<HTMLInputElement>('[data-vault-label]');
    const input = node<HTMLTextAreaElement>('[data-vault-value]');
    const kind = node<HTMLSelectElement>('[data-vault-kind]');
    if (label) label.value = entry.change.label;
    if (input) input.value = content;
    if (kind) {
      kind.value = entry.change.kind;
      kind.disabled = true;
    }
    text(
      '[data-vault-editor-title]',
      resolve
        ? 'Resolver as versões escolhidas'
        : 'Editar esta versão preservada',
    );
    message = resolve
      ? 'Confira o conteúdo antes de salvar a resolução de até 16 versões. As anteriores continuam preservadas; se restarem conflitos, resolva a próxima etapa.'
      : 'Conteúdo aberto apenas neste aparelho. Salvar criará outra versão.';
  }
  function resolveParents(entity: string, selected: string): string[] {
    const ids = sync.heads(entity).map((entry) => entry.commit.id);
    const chosen = ids.includes(selected)
      ? [selected, ...ids.filter((id) => id !== selected)]
      : ids;
    return chosen.slice(0, 16);
  }
  async function estimate(): Promise<void> {
    const local = await storageEstimate();
    text(
      '[data-vault-local]',
      `Armazenamento deste navegador: ${local.usage === null ? 'estimativa indisponível' : (local.usage / 1_000_000).toFixed(1) + ' MB usados'}${local.quota === null ? '' : ' / aproximadamente ' + (local.quota / 1_000_000).toFixed(0) + ' MB'} · ${local.persistent ? 'persistência concedida' : 'sujeito a remoção pelo navegador'}.`,
    );
  }
  async function operate(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      await work();
      await estimate();
    } catch (error: unknown) {
      message =
        error instanceof Error
          ? error.message
          : 'Cofre indisponível. Confira o estado antes de repetir.';
    } finally {
      busy = false;
      render();
    }
  }
  function resetEditor(): void {
    editing = null;
    node<HTMLFormElement>('[data-vault-form]')?.reset();
    const kind = node<HTMLSelectElement>('[data-vault-kind]');
    if (kind) kind.disabled = false;
    text('[data-vault-editor-title]', 'Novo item privado');
  }
  async function action(name: string): Promise<void> {
    if (name === 'local') {
      await sync.openLocal();
      message =
        'Cópia local aberta com as chaves deste aparelho. Sessão e revogações remotas não foram conferidas; sincronizar exige login válido.';
      return;
    }
    if (name === 'new') {
      resetEditor();
      return;
    }
    if (name === 'more') {
      displayed = displayed + 16 < sync.entries.size ? displayed + 16 : 0;
      return;
    }
    if (name === 'persist') {
      await navigator.storage.persist();
      message =
        'Pedido de persistência concluído. Confira a resposta do navegador abaixo.';
      return;
    }
    if (name === 'discard') {
      if (!discardArmed) {
        discardArmed = true;
        message =
          'Clique novamente em descartar para excluir apenas o rascunho incompleto e liberar sua reserva.';
        return;
      }
      await sync.discard();
      discardArmed = false;
      message =
        'Rascunho incompleto descartado. Versões confirmadas preservadas.';
      return;
    }
    if (name === 'retry') {
      await sync.retry();
      message = 'Envio retomado. Confira as versões confirmadas.';
      channel?.postMessage('changed');
      return;
    }
    await synchronize();
  }
  async function synchronize(): Promise<void> {
    await sync.refresh();
    message =
      navigator.onLine && sync.session
        ? sync.complete
          ? 'Índice cifrado verificado. Conteúdo confirmado pode ser recuperado em outro aparelho autorizado.'
          : 'Parte do índice foi carregada. Clique novamente para continuar.'
        : 'Cópia local verificada. Sem conexão, novos dados ficam somente neste aparelho até sincronizar.';
  }
  async function save(): Promise<void> {
    const kind = value('[data-vault-kind]') as VaultChange['kind'];
    const change: VaultChange = {
      version: 1,
      entity: editing?.entity ?? crypto.randomUUID(),
      kind: editing?.kind ?? kind,
      parents: editing?.parents ?? [],
      label: value('[data-vault-label]').trim(),
    };
    await sync.save({ change, value: value('[data-vault-value]') });
    message = sync.pending
      ? 'Rascunho cifrado salvo neste aparelho. Retome o envio quando houver conexão.'
      : 'Versão confirmada no cofre remoto. Recuperável por aparelhos autorizados.';
    resetEditor();
    channel?.postMessage('changed');
  }
  window.addEventListener('pagehide', () => {
    sync.clear();
    resetEditor();
    message = 'Reabra o cofre para conferir a autorização.';
    render();
  });
  channel?.addEventListener('message', () => {
    if (!busy) {
      message = 'O cofre mudou em outra aba. Sincronize antes de continuar.';
      render();
    }
  });
  function rememberSession(
    session: AccountSession | null,
    previous: AccountSession | null,
  ): void {
    // Session expiry/logout closes remote access, not the encrypted copy or its native keys.
    if (!session || !sessionChanged(previous, session)) return;
    const locator = {
      accountId: session.accountId,
      deviceId: session.deviceId,
    };
    void rememberLocator(locator).catch(() => {
      message =
        'Não foi possível guardar o acesso à cópia local. Verifique armazenamento do navegador.';
      render();
    });
  }
  function sessionChanged(
    previous: AccountSession | null,
    next: AccountSession | null,
  ): boolean {
    return (
      previous?.accountId !== next?.accountId ||
      previous?.deviceId !== next?.deviceId ||
      previous?.csrf !== next?.csrf
    );
  }
  return {
    setSession(session: AccountSession | null): void {
      const previous = sync.session;
      sync.setSession(session);
      rememberSession(session, previous);
      if (sessionChanged(previous, session)) {
        resetEditor();
        message = 'Conecte e autorize este aparelho para abrir o cofre.';
      }
      render();
    },
    canActivate: () => !busy && !value('[data-vault-value]'),
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = template;
      container
        .querySelectorAll<HTMLButtonElement>('[data-vault-action]')
        .forEach((b) =>
          b.addEventListener('click', () => {
            void operate(() => action(b.dataset['vaultAction'] ?? ''));
          }),
        );
      node<HTMLFormElement>('[data-vault-form]')?.addEventListener(
        'submit',
        (event) => {
          event.preventDefault();
          void operate(save);
        },
      );
      render();
    },
  };
}
