/**
 * The account wants push, but this browser never granted it. Permission prompts
 * need a tap, so the account choice is offered once per device instead of being
 * requested on load. `enable` runs inside that tap. Resolves false when the
 * offer could not be shown.
 */
export function offerPushOnDevice(input: {
  enable: () => Promise<void>;
  signal: AbortSignal;
}): Promise<boolean> {
  const { enable, signal } = input;
  if (signal.aborted) return Promise.resolve(false);
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'settings-pack card';
    dialog.setAttribute('aria-label', 'Notificações neste aparelho');
    // Static authored markup only.
    dialog.innerHTML =
      '<h2>Notificações neste aparelho</h2><p>Sua conta recebe notificações push. Ative também aqui para receber avisos de mensagens e chamadas.</p><p data-push-offer-status role="status"></p><div class="settings-actions"><button type="button" data-push-offer-later>Agora não</button><button type="button" class="primary" data-push-offer-enable>Ativar notificações</button></div>';
    const status = dialog.querySelector('[data-push-offer-status]')!;
    /** Resolves true once the person saw the offer, whatever they chose. */
    const finish = () => {
      signal.removeEventListener('abort', finish);
      dialog.remove();
      resolve(true);
    };
    dialog
      .querySelector('[data-push-offer-later]')!
      .addEventListener('click', finish);
    const button = dialog.querySelector<HTMLButtonElement>(
      '[data-push-offer-enable]',
    )!;
    button.addEventListener('click', () => {
      button.disabled = true;
      enable().then(finish, (error: unknown) => {
        button.disabled = false;
        status.textContent =
          error instanceof Error
            ? error.message
            : 'Não foi possível ativar as notificações.';
      });
    });
    dialog.addEventListener('cancel', finish);
    signal.addEventListener('abort', finish, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch {
      // Another modal is open; the offer comes back on the next visit.
      signal.removeEventListener('abort', finish);
      dialog.remove();
      resolve(false);
    }
  });
}
