import { t, translatedError } from '../../shared/i18n/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import { Backups } from './controller.ts';

export function startBackups(
  access: VaultAccess,
  sync: VaultSync,
  playback: VoicePlayback,
  options: {
    reminder: () => boolean;
    confirmWallet: () => void;
    profile: () => string | null;
  },
) {
  const controller = new Backups(access, sync, options.profile);
  let mounted: HTMLElement | null = null,
    busy = false,
    armed = false;
  let status = t(
    'O backup completo inclui conversas, áudios, imagens e arquivos.',
  );
  let downloadUrl: string | null = null;
  let session: AccountSession | null = null;
  function renderDownload(): void {
    const link = mounted?.querySelector<HTMLAnchorElement>(
      '[data-backup-download]',
    );
    if (!link) return;
    link.hidden = busy || !downloadUrl;
    if (!downloadUrl) {
      link.removeAttribute('href');
      return;
    }
    link.href = downloadUrl;
    link.download = `0xDMme-backup-${new Date().toISOString().slice(0, 10)}.0xdm`;
  }
  function render(): void {
    renderDownload();
    const message = mounted?.querySelector('[data-backup-status]');
    if (message) message.textContent = status;
    mounted?.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
      button.disabled = busy && !button.hasAttribute('data-backup-cancel');
    });
    const clean = mounted?.querySelector<HTMLButtonElement>(
      '[data-backup-clean]',
    );
    if (clean) {
      clean.disabled = busy || controller.cleanupCount === 0;
      clean.textContent = armed
        ? t('Confirmar reset do cofre')
        : t('Resetar cofre');
    }
    const cancel = mounted?.querySelector<HTMLElement>('[data-backup-cancel]');
    if (cancel) cancel.hidden = !busy;
  }
  function clearDownload(): void {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }
  async function run(work: () => Promise<void>): Promise<void> {
    if (busy) return;
    busy = true;
    render();
    try {
      await work();
    } catch (error: unknown) {
      status =
        error instanceof Error
          ? translatedError(error.message)
          : t('Não foi possível concluir o backup.');
    } finally {
      busy = false;
      render();
    }
  }
  async function save(): Promise<void> {
    clearDownload();
    armed = false;
    status = t('Preparando o backup completo…');
    render();
    const report = await controller.generateComplete();
    const file = controller.file;
    if (!file) throw new Error('Arquivo não concluído.');
    downloadUrl = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `0xDMme-backup-${new Date().toISOString().slice(0, 10)}.0xdm`;
    link.click();
    status = report.omitted.length
      ? t(
          'Backup incompleto: {0} itens indisponíveis. O reset permanece bloqueado; tente salvar novamente.',
          [report.omitted.length],
        )
      : t(
          'Backup preparado. Guarde o arquivo e use “Validar arquivo” para conferir a cópia salva.',
        );
  }
  async function validate(): Promise<void> {
    armed = false;
    const file =
      mounted?.querySelector<HTMLInputElement>('[data-backup-file]')
        ?.files?.[0];
    if (!file) return;
    status = t('Validando e importando o histórico cifrado…');
    render();
    const reader = await controller.open(file);
    status = reader.complete
      ? t(
          'Arquivo íntegro e completo. Histórico importado para Conversas neste aparelho.',
        )
      : t(
          'Arquivo íntegro, com conteúdo incompleto. Os itens presentes foram importados; o reset permanece bloqueado.',
        );
  }
  async function reset(): Promise<void> {
    if (session?.walletConfirmed !== true) {
      armed = false;
      status = t(
        'Confirme sua wallet uma vez nesta sessão e volte ao Cofre para concluir o reset.',
      );
      options.confirmWallet();
      return;
    }
    if (!armed) {
      armed = true;
      status = t(
        'Resetar os dados preservados neste backup somente do seu cofre no servidor? Mensagens posteriores e cópias de outras pessoas permanecem.',
      );
      return;
    }
    armed = false;
    const result = await controller.cleanup();
    status = t(
      'Cofre resetado: {0} MB liberados. O histórico importado continua neste aparelho.',
      [(result.released / 1_000_000).toFixed(2)],
    );
  }
  window.addEventListener('0xdmme-backup-progress', (event) => {
    const detail = (event as CustomEvent<{ done: number; total: number }>)
      .detail;
    status = t('Preparando backup: {0} itens.', [detail.done]);
    render();
  });
  window.addEventListener('pagehide', () => {
    controller.cancel();
    clearDownload();
  });
  async function checkReminder(): Promise<void> {
    if (!mounted || busy || !session || !options.reminder()) return;
    await run(async () => {
      const last = await controller.reminder();
      if (last) status = last;
    });
  }
  window.addEventListener('0xdmme-profile-preferences', () => {
    void checkReminder();
  });
  return {
    leave(): void {
      mounted = null;
    },
    canActivate: () => !busy,
    setSession(next: AccountSession | null): void {
      controller.setSession(next);
      const changed =
        session?.accountId !== next?.accountId ||
        session?.deviceId !== next?.deviceId;
      session = next;
      if (!changed) {
        render();
        return;
      }
      armed = false;
      playback.close();
      clearDownload();
      render();
      void checkReminder();
    },
    mount(container: HTMLElement): void {
      mounted = container;
      container.innerHTML = t('html.eedc51d31423');
      container
        .querySelector('[data-backup-save]')
        ?.addEventListener('click', () => {
          void run(save);
        });
      container
        .querySelector('[data-backup-validate]')
        ?.addEventListener('click', () => {
          container
            .querySelector<HTMLInputElement>('[data-backup-file]')
            ?.click();
        });
      container
        .querySelector('[data-backup-file]')
        ?.addEventListener('change', () => {
          void run(validate);
        });
      container
        .querySelector('[data-backup-clean]')
        ?.addEventListener('click', () => {
          void run(reset);
        });
      container
        .querySelector('[data-backup-cancel]')
        ?.addEventListener('click', () => {
          controller.cancel();
          armed = false;
          status = t(
            'Operação interrompida. Se o reset já foi enviado, confira o armazenamento antes de repetir.',
          );
          render();
        });
      render();
      void checkReminder();
    },
  };
}
export { Backups } from './controller.ts';
