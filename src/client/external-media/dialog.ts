import type { MediaScope } from './preferences.ts';
export const externalMediaNotice =
  'GIFs e vídeos externos conectam você aos provedores, que recebem seu IP e podem coletar buscas, dados do navegador, cookies e dados de reprodução. A criptografia das conversas permanece; o app não envia sua wallet, chaves ou histórico de conversas a eles.';
export const klipyNotice =
  'Ao buscar ou carregar GIFs, seu aparelho se conecta ao KLIPY, que recebe seu IP e pode coletar suas buscas, GIFs acessados e dados do navegador. O app não envia sua wallet, chaves ou histórico de conversas ao KLIPY.';

/** No provider resources are present in this dialog. Closing is not consent. */
export function mediaConsentDialog(
  scope: MediaScope,
  signal: AbortSignal,
): Promise<boolean | null> {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'external-media-consent card';
    dialog.setAttribute('aria-label', 'Privacidade de mídias externas');
    const title = document.createElement('h2'),
      notice = document.createElement('p'),
      detail = document.createElement('small'),
      actions = document.createElement('div');
    title.textContent = scope === 'all' ? 'Mídias externas' : 'GIFs do KLIPY';
    notice.textContent = scope === 'all' ? externalMediaNotice : klipyNotice;
    detail.textContent =
      'Sua escolha vale neste navegador e pode ser alterada no Perfil.';
    actions.className = 'settings-actions';
    const finish = (choice: boolean | null) => {
      signal.removeEventListener('abort', cancel);
      dialog.remove();
      resolve(choice);
    };
    const cancel = () => finish(null);
    for (const [choice, label] of [
      [true, scope === 'all' ? 'Permitir mídias externas' : 'Permitir GIFs'],
      [false, 'Manter somente links'],
    ] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      button.addEventListener('click', () => finish(choice), { once: true });
      actions.append(button);
    }
    dialog.append(title, notice, detail, actions);
    dialog.addEventListener('cancel', cancel, { once: true });
    signal.addEventListener('abort', cancel, { once: true });
    document.body.append(dialog);
    try {
      dialog.showModal();
    } catch (error: unknown) {
      signal.removeEventListener('abort', cancel);
      dialog.remove();
      reject(
        error instanceof Error
          ? error
          : new Error('Aviso de privacidade indisponível.'),
      );
    }
  });
}
