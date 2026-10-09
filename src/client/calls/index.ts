import type { AccountSession } from '../../shared/account/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import type { VaultSync } from '../vault-sync/index.ts';
import type { VoicePlayback } from '../voice-playback/index.ts';
import {
  NotificationSound,
  soundPreferenceKey,
} from '../notification-sound/index.ts';
import { VoiceCalls } from './controller.ts';
import type { CallHistory, CallUiState } from './controller.ts';
export { VoiceCalls } from './controller.ts';
export { VoiceConnection, iceConfiguration } from './rtc.ts';
export { CallSecurity } from './security.ts';
export { verifyCallDescription } from './security.ts';

export function startCalls(options: {
  access: VaultAccess;
  sync: VaultSync;
  playback: VoicePlayback;
  before: () => void;
  label: (peer: string) => string;
  history?: CallHistory;
}) {
  let state: CallUiState | null = null;
  let settings: HTMLElement | null = null;
  const dock = document.createElement('aside');
  dock.className = 'call-dock card';
  dock.hidden = true;
  dock.setAttribute('aria-label', 'Chamada de voz');
  const title = document.createElement('strong'),
    notice = document.createElement('p'),
    duration = document.createElement('p'),
    buttons = document.createElement('div');
  notice.setAttribute('role', 'status');
  buttons.className = 'call-actions';
  const accept = button('Atender', () => calls.accept()),
    reject = button('Recusar', () => calls.end('Chamada recusada.')),
    hangup = button('Encerrar', () => calls.end()),
    mute = button('Silenciar microfone', () => {
      calls.mute();
      return Promise.resolve();
    }),
    play = button('Ouvir chamada', () => calls.play()),
    close = button('Fechar aviso', () => {
      dock.hidden = true;
      return Promise.resolve();
    });
  buttons.append(accept, reject, hangup, mute, play, close);
  accept.classList.add('primary');
  dock.append(title, notice, duration, buttons);
  document.body.append(dock);
  const sound = new NotificationSound();
  sound.prepare();
  const events = new AbortController();
  document.addEventListener('pointerdown', () => sound.unlock(), {
    capture: true,
    signal: events.signal,
  });
  document.addEventListener('keydown', () => sound.unlock(), {
    capture: true,
    signal: events.signal,
  });
  window.addEventListener(
    'storage',
    (event) => {
      if (event.key === soundPreferenceKey || event.key === null)
        sound.reload();
    },
    { signal: events.signal },
  );
  let lastRing = 0;
  const calls = new VoiceCalls({
    ...options,
    publish: (next) => {
      state = next;
      render();
      if (
        next.call &&
        !next.call.caller &&
        next.call.phase === 'ringing' &&
        Date.now() - lastRing >= 3000
      ) {
        lastRing = Date.now();
        sound.beep();
      }
    },
  });
  function button(label: string, work: () => Promise<void>): HTMLButtonElement {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.addEventListener('click', () => {
      void work().catch(() => {
        notice.textContent = 'Não foi possível concluir a operação de chamada.';
      });
    });
    return element;
  }
  function render(): void {
    if (!state) return;
    const active = state.call !== null;
    if (active || state.busy) dock.hidden = false;
    title.textContent = state.call
      ? `Chamada de voz · ${options.label(state.call.peer)}`
      : 'Chamada de voz';
    notice.textContent = state.notice;
    duration.textContent = state.connected
      ? `${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, '0')}`
      : '';
    renderControls(state, active);
    renderSettings(state);
  }
  function renderControls(state: CallUiState, active: boolean): void {
    const incoming =
      state.call && !state.call.caller && state.call.phase === 'ringing';
    accept.hidden = !incoming;
    reject.hidden = !incoming;
    hangup.hidden = (!active && !state.busy) || !!incoming;
    hangup.textContent = active ? 'Encerrar' : 'Cancelar chamada';
    mute.hidden = !state.connected;
    play.hidden = !state.autoplay;
    close.hidden = active || state.busy;
    mute.textContent = state.muted
      ? 'Reativar microfone'
      : 'Silenciar microfone';
    mute.setAttribute('aria-pressed', String(state.muted));
    for (const b of [accept, reject, mute, play]) b.disabled = state.busy;
  }
  function renderSettings(state: CallUiState): void {
    const toggle =
      settings?.querySelector<HTMLButtonElement>('[data-call-toggle]');
    if (toggle) {
      toggle.textContent = state.enabled
        ? 'Desativar recebimento de chamadas'
        : 'Ativar recebimento de chamadas';
      toggle.setAttribute('aria-pressed', String(state.enabled));
      toggle.disabled = state.busy;
    }
    const status = settings?.querySelector('[data-call-status]');
    if (status) status.textContent = state.notice;
  }
  function suspend(): void {
    void calls.end('Chamada encerrada ao sair desta página.');
  }
  window.addEventListener('online', () => calls.ready(), {
    signal: events.signal,
  });
  document.addEventListener('visibilitychange', () => calls.ready(), {
    signal: events.signal,
  });
  window.addEventListener(
    'pagehide',
    (event) => {
      suspend();
      if (!event.persisted) {
        calls.dispose();
        events.abort();
        void sound.dispose().catch(() => undefined);
        dock.remove();
      }
    },
    { signal: events.signal },
  );
  window.addEventListener(
    'beforeunload',
    (event) => {
      if (calls.active) {
        event.preventDefault();
        event.returnValue = '';
      }
    },
    { signal: events.signal },
  );
  return {
    setSession: (session: AccountSession | null) => calls.setSession(session),
    ready: () => calls.ready(),
    active: () => calls.active,
    start: (peer: string) => calls.start(peer),
    event: (event: string) => {
      if (event === 'revoked' || event === 'ended' || event === 'invalidated')
        void calls.end('Chamada encerrada: autorização mudou.');
      else if (event === 'authorization') calls.ready();
    },
    mountSettings: (host: HTMLElement) => {
      settings = host;
      host.innerHTML =
        '<article class="card call-settings"><h2>Chamadas de voz</h2><p>Receba chamadas de contatos aprovados com o app aberto e conectado. Conversas silenciadas ou arquivadas não tocam. Não há histórico de chamadas.</p><button data-call-toggle type="button" aria-pressed="true">Desativar recebimento de chamadas</button><p data-call-status role="status"></p></article>';
      host
        .querySelector('[data-call-toggle]')
        ?.addEventListener('click', () => {
          if (state) void calls.configure(!state.enabled);
        });
      render();
    },
  };
}
