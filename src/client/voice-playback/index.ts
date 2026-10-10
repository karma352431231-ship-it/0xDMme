import { AccountError } from '../../shared/account/index.ts';
import { validateVoice, voiceDuration } from '../../shared/voice/index.ts';
import type { VoiceMetadata } from '../../shared/voice/index.ts';

interface PlayerState {
  id: string;
  playing: boolean;
  current: number;
  duration: number;
}
const icons = {
  play: '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause: '<path d="M7.5 5h3v14h-3zM13.5 5h3v14h-3z"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
} as const;
function icon(name: keyof typeof icons): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
}
function seconds(voice: VoiceMetadata): number {
  return voice.samples / voice.sampleRate;
}
function clock(value: number): string {
  const whole = Math.max(0, Math.floor(value));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/** Reflects the shared playback on one bubble or preview control. */
function paintPlayer(host: HTMLElement, state: PlayerState | null): void {
  const toggle = host.querySelector<HTMLButtonElement>('.voice-toggle'),
    progress = host.querySelector<HTMLInputElement>('.voice-progress'),
    time = host.querySelector<HTMLElement>('.voice-time');
  if (!toggle || !progress || !time) return;
  const shown = state ?? {
    playing: false,
    current: 0,
    duration: Number(host.dataset['duration'] ?? 0),
  };
  host.dataset['state'] = playerPhase(host, state);
  toggle.innerHTML = icon(shown.playing ? 'pause' : 'play');
  toggle.setAttribute(
    'aria-label',
    shown.playing ? 'Pausar mensagem de voz' : 'Ouvir mensagem de voz',
  );
  paintProgress(progress, {
    total: shown.duration,
    current: shown.current,
    loaded: state !== null,
  });
  // Idle shows the length; playing or partway shows the elapsed time.
  time.textContent = clock(
    shown.playing || shown.current > 0 ? shown.current : shown.duration,
  );
}
function playerPhase(host: HTMLElement, state: PlayerState | null): string {
  if (state) return state.playing ? 'playing' : 'paused';
  return host.dataset['state'] === 'loading' ? 'loading' : 'idle';
}
function paintProgress(
  progress: HTMLInputElement,
  value: { total: number; current: number; loaded: boolean },
): void {
  progress.disabled = !value.loaded;
  progress.max = String(value.total);
  progress.value = String(value.current);
  const share = value.total ? Math.min(1, value.current / value.total) : 0;
  progress.style.setProperty('--progress', `${share * 100}%`);
}

/**
 * Owns a single deliberate playback outside the chat DOM: a refresh or the
 * removal of a bubble never stops it. Bubbles are controls painted from it;
 * while the playing voice has no visible bubble a small dock keeps control.
 */
export class VoicePlayback {
  private audio: HTMLAudioElement | null = null;
  private url: string | null = null;
  private generation = 0;
  private identity: {
    id: string;
    peer: string | null;
    voice: VoiceMetadata;
  } | null = null;
  private dock: HTMLElement | null = null;
  private checking: Promise<void> | null = null;
  private recheck = false;
  /** Separates the controls of independent playbacks on the same page. */
  private readonly owner = crypto.randomUUID();
  get open(): boolean {
    return this.audio !== null;
  }
  pause(): void {
    this.audio?.pause();
  }
  get peer(): string | null {
    return this.identity?.peer ?? null;
  }
  /** Plays a verified voice; the voice already loaded resumes instead. */
  play(input: {
    bytes: Uint8Array<ArrayBuffer>;
    voice: VoiceMetadata;
    id: string;
    peer: string | null;
  }): void {
    validateVoice(input.bytes, input.voice);
    if (
      this.identity?.id === input.id &&
      this.identity.peer === input.peer &&
      this.audio
    ) {
      void this.resume();
      return;
    }
    this.close();
    const audio = document.createElement('audio');
    audio.preload = 'auto';
    this.url = URL.createObjectURL(
      new Blob([input.bytes], { type: 'audio/wav' }),
    );
    audio.src = this.url;
    for (const event of ['play', 'pause', 'timeupdate', 'loadedmetadata'])
      audio.addEventListener(event, () => {
        this.paint();
      });
    audio.addEventListener('ended', () => {
      // A docked voice has no bubble to replay from; it simply finishes.
      if (this.dock) this.close();
      else audio.currentTime = 0;
    });
    this.audio = audio;
    this.identity = { id: input.id, peer: input.peer, voice: input.voice };
    void this.resume();
  }
  /** Play/pause for the loaded voice; false when `id` is not loaded. */
  toggle(id: string): boolean {
    if (!this.audio || this.identity?.id !== id) return false;
    if (this.audio.paused) void this.resume();
    else this.audio.pause();
    return true;
  }
  /** Stops the playback when it belongs to `id` (a discarded preview). */
  release(id: string): void {
    if (this.identity?.id === id) this.close();
  }
  private async resume(): Promise<void> {
    const audio = this.audio;
    try {
      await audio?.play();
    } catch {
      // Autoplay refused after decryption: it stays paused and the next tap,
      // a direct gesture on the loaded voice, plays it.
      if (audio === this.audio) this.paint();
    }
  }
  private state(): PlayerState | null {
    const audio = this.audio,
      identity = this.identity;
    if (!audio || !identity) return null;
    return {
      id: identity.id,
      playing: !audio.paused,
      current: audio.currentTime,
      duration: Number.isFinite(audio.duration)
        ? audio.duration
        : seconds(identity.voice),
    };
  }
  private paint(): void {
    const state = this.state();
    let visible = false;
    document
      .querySelectorAll<HTMLElement>(
        `.voice-message[data-voice-owner="${this.owner}"]`,
      )
      .forEach((host) => {
        const mine = state !== null && host.dataset['voiceId'] === state.id;
        paintPlayer(host, mine ? state : null);
        if (mine && !this.dock?.contains(host)) visible = true;
      });
    this.syncDock(
      state !== null && !visible && (state.playing || this.dock !== null),
    );
  }
  private syncDock(show: boolean): void {
    if (!show) {
      this.dock?.remove();
      this.dock = null;
      return;
    }
    if (this.dock || !this.identity) return;
    const dock = document.createElement('aside'),
      close = document.createElement('button');
    dock.className = 'voice-dock';
    dock.setAttribute('aria-label', 'Mensagem de voz em reprodução');
    close.type = 'button';
    close.className = 'voice-dock-close';
    close.innerHTML = icon('close');
    close.setAttribute('aria-label', 'Fechar áudio');
    close.addEventListener('click', () => {
      this.close();
    });
    dock.append(
      this.element({
        id: this.identity.id,
        voice: this.identity.voice,
        load: () => Promise.resolve(),
      }),
      close,
    );
    document.body.append(dock);
    this.dock = dock;
  }
  /** Bubble or preview control; bytes are loaded only when the user plays. */
  element(input: {
    id: string;
    voice: VoiceMetadata;
    load: () => Promise<void>;
  }): HTMLElement {
    const host = document.createElement('div'),
      toggle = document.createElement('button'),
      progress = document.createElement('input'),
      time = document.createElement('span');
    host.className = 'voice-message';
    host.dataset['voiceOwner'] = this.owner;
    host.dataset['voiceId'] = input.id;
    host.dataset['duration'] = String(seconds(input.voice));
    host.setAttribute(
      'aria-label',
      `Mensagem de voz · ${voiceDuration(input.voice)}`,
    );
    toggle.type = 'button';
    toggle.className = 'voice-toggle';
    progress.type = 'range';
    progress.className = 'voice-progress';
    progress.min = '0';
    progress.step = '0.1';
    progress.setAttribute('aria-label', 'Posição do áudio');
    time.className = 'voice-time';
    toggle.addEventListener('click', () => {
      if (this.toggle(input.id)) return;
      host.dataset['state'] = 'loading';
      toggle.disabled = true;
      input
        .load()
        .catch(() => {
          host.title =
            'Não foi possível carregar o áudio. Toque para tentar de novo.';
        })
        .finally(() => {
          toggle.disabled = false;
          host.dataset['state'] = 'idle';
          paintPlayer(
            host,
            this.identity?.id === input.id ? this.state() : null,
          );
        });
    });
    progress.addEventListener('input', () => {
      if (this.audio && this.identity?.id === input.id)
        this.audio.currentTime = Number(progress.value);
    });
    host.append(toggle, progress, time);
    paintPlayer(host, this.identity?.id === input.id ? this.state() : null);
    return host;
  }
  check(allowed: (peer: string) => Promise<boolean>): Promise<void> {
    this.recheck = true;
    if (this.checking) return this.checking;
    const check = async () => {
      while (this.recheck) {
        this.recheck = false;
        const peer = this.peer,
          generation = this.generation;
        if (!peer) return;
        await this.verifyPermission(allowed, { peer, generation });
        // A later source must never inherit the result for the previous source.
        if (generation !== this.generation && this.peer) this.recheck = true;
      }
    };
    this.checking = check().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }
  private async verifyPermission(
    allowed: (peer: string) => Promise<boolean>,
    context: { peer: string; generation: number },
  ): Promise<void> {
    try {
      const valid = await allowed(context.peer);
      if (context.generation === this.generation && !valid) this.close();
    } catch (error: unknown) {
      if (context.generation !== this.generation) return;
      // A stale directory can also return 403; only a verified session end or
      // a negative block check ends playback here. Revocation has its own event.
      if (error instanceof AccountError && error.status === 401) this.close();
      else
        this.dock?.setAttribute(
          'aria-description',
          'Não foi possível conferir a autorização agora. Uma nova atualização tentará novamente.',
        );
    }
  }
  close(): void {
    this.generation++;
    this.recheck = false;
    const audio = this.audio;
    this.audio = null;
    this.identity = null;
    audio?.pause();
    audio?.removeAttribute('src');
    audio?.load();
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
    if (typeof document !== 'undefined') this.paint();
  }
}
