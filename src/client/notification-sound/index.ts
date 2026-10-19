import { t } from '../../shared/i18n/index.ts';
import { announcePreference } from '../preference-events/index.ts';
import { playTone, type NotificationTone } from './tones.ts';

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
    throw new Error('Invalid push sound preference.');
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

export function storedSoundPreference(
  storage: PreferenceStorage = browserStorage,
): boolean {
  try {
    return storage.getItem(soundPreferenceKey) !== 'false';
  } catch {
    return true;
  }
}
/**
 * Applies the account's choice to this device (account-settings). Open sound
 * instances reload on `storage` events, which the browser only sends to other
 * tabs, so this tab receives the same event explicitly.
 */
export async function applySoundPreference(
  enabled: boolean,
  storage: PreferenceStorage = browserStorage,
): Promise<void> {
  storage.setItem(soundPreferenceKey, String(enabled));
  globalThis.window?.dispatchEvent(
    new StorageEvent('storage', { key: soundPreferenceKey }),
  );
  await savePushSoundPreference(enabled);
}

/** Kept on this device and copied to the account by account-settings; it contains no user data. */
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
          : t(
              'Invalid sound preference. Sound is on for this visit; choose again in settings.',
            );
    } catch {
      this.problem = t(
        'Could not load sound preferences. The current choice applies for this visit.',
      );
    }
    this.changed();
  }
  async setEnabled(value: boolean): Promise<void> {
    this.active = value;
    try {
      this.storage.setItem(soundPreferenceKey, String(value));
    } catch {
      this.problem = t(
        'Sound preference changed for this visit only: the browser did not allow saving.',
      );
      this.changed();
      throw new Error(this.problem);
    }
    this.problem = '';
    this.changed();
    announcePreference({ sound: value });
    if (value) this.unlock();
    else await this.dispose();
  }
  prepare(): boolean {
    if (!this.active) return false;
    try {
      this.audio ??= this.createAudio();
    } catch {
      this.problem = t(
        'Sound enabled, but this browser could not prepare audio.',
      );
      this.changed();
      return false;
    }
    if (this.audio.state !== 'running') {
      this.problem = t(
        'Sound enabled. The browser may wait for a tap before allowing playback.',
      );
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
            : t(
                'Sound enabled, but playback is blocked by the browser or system.',
              );
    } catch {
      if (this.audio === audio)
        this.problem = t(
          'Sound enabled, but playback is blocked by the browser or system.',
        );
    } finally {
      this.resuming = false;
      this.changed();
    }
  }
  /** One alert per three seconds across all tones, so a burst never stacks sounds. */
  alert(tone: NotificationTone): void {
    if (
      !this.active ||
      !this.audio ||
      this.audio.state !== 'running' ||
      Date.now() - this.lastSound < 3000
    )
      return;
    this.lastSound = Date.now();
    playTone(this.audio, tone);
  }
  async dispose(): Promise<void> {
    const audio = this.audio;
    this.audio = null;
    await audio?.close();
  }
}
