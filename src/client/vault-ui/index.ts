import type { AccountSession } from '../../shared/account/index.ts';
import { vaultQuota } from '../../shared/vault/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { VaultSync } from '../vault-sync/index.ts';
import { rememberLocator } from '../vault-storage/index.ts';

export function startVault(access: VaultAccess) {
  const sync = new VaultSync(access);
  let mounted: HTMLElement | null = null;
  let busy = false;
  let known = false;
  let message = 'Entre na sua conta para consultar o armazenamento.';
  function render(): void {
    const status = mounted?.querySelector('[data-vault-status]');
    if (status) status.textContent = message;
    const usage =
      mounted?.querySelector<HTMLProgressElement>('[data-vault-usage]');
    renderUsage(usage ?? null);
    const quota = mounted?.querySelector('[data-vault-quota]');
    if (quota)
      quota.textContent = known
        ? `${(sync.state.used / 1_000_000).toFixed(2)} MB usados · ${(Math.max(0, vaultQuota - sync.state.used) / 1_000_000).toFixed(2)} MB disponíveis de ${vaultQuota / 1_000_000} MB`
        : 'Consultando uso da conta…';
    const retry =
      mounted?.querySelector<HTMLButtonElement>('[data-vault-retry]');
    if (retry) retry.disabled = busy;
  }
  function renderUsage(usage: HTMLProgressElement | null): void {
    if (!usage) return;
    if (known) usage.value = sync.state.used;
    else usage.removeAttribute('value');
  }
  function canRefresh(): boolean {
    return (
      !busy && mounted !== null && sync.session !== null && navigator.onLine
    );
  }
  function retryVisible(show: boolean): void {
    const retry = mounted?.querySelector<HTMLElement>('[data-vault-retry]');
    if (retry) retry.hidden = !show;
  }
  async function refresh(): Promise<void> {
    if (!canRefresh()) return;
    busy = true;
    message = 'Consultando armazenamento…';
    render();
    try {
      await sync.refresh();
      known = true;
      if (sync.pending) await sync.retry();
      message =
        sync.state.used >= vaultQuota * 0.9
          ? 'Seu armazenamento está próximo do limite.'
          : 'Conversas e arquivos ficam cifrados. Salvar um backup não libera espaço automaticamente.';
      retryVisible(false);
    } catch (error: unknown) {
      message =
        error instanceof Error
          ? error.message
          : 'Não foi possível consultar o armazenamento.';
      retryVisible(true);
    } finally {
      busy = false;
      render();
    }
  }
  window.addEventListener('online', () => {
    void refresh();
  });
  window.addEventListener('0xdmme-personal-cleanup', () => {
    sync.clear();
    void refresh();
  });
  return {
    sync,
    setSession(session: AccountSession | null): void {
      if (sync.session?.accountId !== session?.accountId) known = false;
      sync.setSession(session);
      if (session) {
        void rememberLocator({
          accountId: session.accountId,
          deviceId: session.deviceId,
        }).catch(() => {
          message = 'Não foi possível guardar o acesso local neste aparelho.';
          render();
        });
        void refresh();
      } else {
        message = 'Entre na sua conta para consultar o armazenamento.';
        render();
      }
    },
    ready: refresh,
    canActivate: () => !busy,
    leave(): void {
      mounted = null;
    },
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = `<article class="card vault-card"><h2>Armazenamento da conta</h2><progress data-vault-usage max="${vaultQuota}" value="0" aria-label="Uso do armazenamento"></progress><p data-vault-quota></p><p data-vault-status role="status"></p><button data-vault-retry type="button" hidden>Tentar novamente</button></article>`;
      container
        .querySelector('[data-vault-retry]')
        ?.addEventListener('click', () => {
          void refresh();
        });
      render();
      void refresh();
    },
  };
}
