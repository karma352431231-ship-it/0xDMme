import type { Daily } from '../daily/index.ts';

/** Preferences belong to this authorized account/device; browser permission remains explicit. */
export function mountPushSettings(host: HTMLElement, daily: Daily) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'push-preferences';
  fieldset.innerHTML = `<legend>O que notificar</legend><label><input type="checkbox" data-push-messages checked> Mensagens e respostas</label><label><input type="checkbox" data-push-calls checked> Chamadas</label><label><input type="checkbox" data-push-show-calls checked> Identificar aviso como chamada de voz</label><p>Desligue a última opção para um aviso genérico. O nome do contato nunca aparece; tela bloqueada e som dependem do sistema.</p><button type="button">Salvar preferências de push</button>`;
  host.append(fieldset);
  const messages = fieldset.querySelector<HTMLInputElement>(
      '[data-push-messages]',
    )!,
    calls = fieldset.querySelector<HTMLInputElement>('[data-push-calls]')!,
    showCalls = fieldset.querySelector<HTMLInputElement>(
      '[data-push-show-calls]',
    )!;
  const notice = document.createElement('p'),
    retry = document.createElement('button');
  notice.setAttribute('role', 'status');
  retry.type = 'button';
  retry.textContent = 'Tentar carregar preferências';
  retry.hidden = true;
  host.append(notice, retry);
  let loaded = false,
    busy = false,
    generation = 0;
  fieldset.disabled = true;
  async function refresh(): Promise<void> {
    if (loaded || busy || !host.isConnected) return;
    busy = true;
    const current = generation;
    try {
      const preferences = await daily.pushPreferences();
      if (current !== generation) return;
      messages.checked = preferences.messages;
      calls.checked = preferences.calls;
      showCalls.checked = preferences.showCalls;
      loaded = true;
      retry.hidden = true;
      notice.textContent = '';
    } catch (error: unknown) {
      if (current === generation) {
        notice.textContent =
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar preferências.';
        retry.hidden = false;
      }
    } finally {
      if (current === generation) {
        busy = false;
        fieldset.disabled = !loaded;
      }
    }
  }
  async function save(): Promise<void> {
    if (!loaded || busy) return;
    busy = true;
    fieldset.disabled = true;
    const current = generation;
    try {
      await daily.configurePush({
        messages: messages.checked,
        calls: calls.checked,
        showCalls: showCalls.checked,
      });
      if (current === generation)
        notice.textContent = 'Preferências de push salvas neste aparelho.';
    } catch (error: unknown) {
      if (current === generation)
        notice.textContent =
          error instanceof Error
            ? error.message
            : 'Não foi possível salvar preferências.';
    } finally {
      if (current === generation) {
        busy = false;
        fieldset.disabled = false;
      }
    }
  }
  retry.addEventListener('click', () => {
    void refresh();
  });
  fieldset.querySelector('button')?.addEventListener('click', () => {
    void save();
  });
  void refresh();
  return {
    refresh,
    reset() {
      generation++;
      busy = false;
      loaded = false;
      fieldset.disabled = true;
    },
  };
}
