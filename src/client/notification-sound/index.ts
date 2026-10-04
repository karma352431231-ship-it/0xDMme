export const soundPreferenceKey = '0xdmme:sound-enabled';
const pushPreferenceCache = '0xdmme-device-preferences';
const pushPreferencePath = '/.0xdmme/sound-preference';
/** One non-identifying boolean, separate from public shell caches and never fetched over the network. */
export async function pushSoundEnabled(): Promise<boolean> {
  const cache = await caches.open(pushPreferenceCache);
  const response = await cache.match(
    new URL(pushPreferencePath, globalThis.location.origin).href,
  );
  if (!response) return true;
  const value = await response.text();
  if (value !== 'true' && value !== 'false')
    throw new Error('Preferência de som do push inválida.');
  return value === 'true';
}
export async function savePushSoundPreference(enabled: boolean): Promise<void> {
  const cache = await caches.open(pushPreferenceCache);
  const url = new URL(pushPreferencePath, globalThis.location.origin).href;
  const prior = await cache.match(url);
  if (prior && (await prior.text()) === String(enabled)) return;
  await cache.put(
    url,
    new Response(String(enabled), {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    }),
  );
}
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
type SoundAudio = Pick<
  AudioContext,
  | 'state'
  | 'resume'
  | 'close'
  | 'createOscillator'
  | 'createGain'
  | 'currentTime'
  | 'destination'
>;
const browserStorage: PreferenceStorage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
};

/** Device preference is independent of account sessions; it contains no user data. */
export class NotificationSound {
  private readonly storage: PreferenceStorage;
  private readonly createAudio: () => SoundAudio;
  private audio: SoundAudio | null = null;
  private resuming = false;
  private lastSound = 0;
  private active = true;
  private problem = '';
  private changed: () => void = () => {};
  constructor(
    storage = browserStorage,
    createAudio: () => SoundAudio = () => new AudioContext(),
  ) {
    this.storage = storage;
    this.createAudio = createAudio;
    this.reload();
  }
  get enabled(): boolean {
    return this.active;
  }
  get notice(): string {
    return this.problem;
  }
  observe(changed: () => void): void {
    this.changed = changed;
  }
  reload(): void {
    try {
      const value = this.storage.getItem(soundPreferenceKey);
      this.active = value !== 'false';
      this.problem =
        value === null || value === 'true' || value === 'false'
          ? ''
          : 'Preferência de som inválida. Som ativado nesta abertura; escolha novamente nas configurações.';
    } catch {
      this.problem =
        'Não foi possível carregar a preferência de som. A escolha atual vale nesta abertura.';
    }
    this.changed();
  }
  async setEnabled(value: boolean): Promise<void> {
    this.active = value;
    try {
      this.storage.setItem(soundPreferenceKey, String(value));
    } catch {
      this.problem =
        'Preferência de som alterada só nesta abertura: o navegador não permitiu salvá-la.';
      this.changed();
      throw new Error(this.problem);
    }
    this.problem = '';
    this.changed();
    if (value) this.unlock();
    else await this.dispose();
  }
  prepare(): boolean {
    if (!this.active) return false;
    try {
      this.audio ??= this.createAudio();
    } catch {
      this.problem =
        'Som ativado, mas este navegador não conseguiu preparar o áudio.';
      this.changed();
      return false;
    }
    if (this.audio.state !== 'running') {
      this.problem =
        'Som ativado. O navegador pode aguardar um toque para liberar a reprodução.';
      this.changed();
    }
    return true;
  }
  /** Call synchronously on an ordinary user gesture; never turn a blocked resume into an opt-out. */
  unlock(): void {
    if (this.resuming || !this.prepare() || !this.audio) return;
    if (this.audio.state === 'running') return;
    this.resuming = true;
    void this.resume(this.audio);
  }
  private async resume(audio: SoundAudio): Promise<void> {
    try {
      await audio.resume();
      if (this.audio === audio)
        this.problem =
          audio.state === 'running'
            ? ''
            : 'Som ativado, mas a reprodução está bloqueada pelo navegador ou sistema.';
    } catch {
      if (this.audio === audio)
        this.problem =
          'Som ativado, mas a reprodução está bloqueada pelo navegador ou sistema.';
    } finally {
      this.resuming = false;
      this.changed();
    }
  }
  beep(): void {
    if (
      !this.active ||
      !this.audio ||
      this.audio.state !== 'running' ||
      Date.now() - this.lastSound < 3000
    )
      return;
    this.lastSound = Date.now();
    const oscillator = this.audio.createOscillator(),
      gain = this.audio.createGain(),
      at = this.audio.currentTime;
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.05, at);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.12);
    oscillator.connect(gain);
    gain.connect(this.audio.destination);
    oscillator.start();
    oscillator.stop(at + 0.13);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
  }
  async dispose(): Promise<void> {
    const audio = this.audio;
    this.audio = null;
    await audio?.close();
  }
}
