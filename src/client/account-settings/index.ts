import { t, translatedError } from '../../shared/i18n/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';
import { defaultPushPreferences } from '../../shared/daily/index.ts';
import type { PushPreferences } from '../../shared/daily/index.ts';
import type { Theme } from '../appearance/index.ts';
import type { Daily } from '../daily/index.ts';
import { onPreference } from '../preference-events/index.ts';
import type { PreferenceChange } from '../preference-events/index.ts';
import { showToast } from '../toast/index.ts';
import { offerPushOnDevice } from './push-offer.ts';
import { sameSettings, withChange } from './record.ts';
import type {
  AccountSettings,
  PrivacyChoices,
  SettingsPack,
} from './record.ts';
import { SettingsRecord } from './vault-record.ts';
import { SettingsCompletion } from './completion.ts';
import type { SettingsSync } from './vault-record.ts';
import { openSettingsWizard } from './wizard.ts';
import { currentLanguage } from '../../shared/i18n/index.ts';
import type { AppLanguage } from '../../shared/i18n/index.ts';
import { LanguageRecord } from '../language-record/index.ts';

/** What each owning module lets account-settings read and apply. */
export interface SettingsPorts {
  language?: {
    set: (value: AppLanguage) => Promise<void>;
    blocked?: () => string | null;
  };
  sync: SettingsSync;
  theme: { current: () => Theme; set: (theme: Theme) => void };
  sound: { current: () => boolean; set: (enabled: boolean) => Promise<void> };
  externalMedia: {
    current: () => boolean | null;
    set: (choice: boolean) => void;
  };
  push: Pick<
    Daily,
    | 'setSession'
    | 'enablePush'
    | 'disablePush'
    | 'configurePush'
    | 'pushPreferences'
    | 'pushSubscribed'
  >;
  privacy: {
    current: () => PrivacyChoices | null;
    save: (choices: PrivacyChoices) => Promise<void>;
  };
  discovery: {
    current: () => Promise<DiscoveryMode>;
    set: (mode: DiscoveryMode) => Promise<void>;
  };
}

// Load failures are retried on later readiness calls, up to this many per account.
const loadAttempts = 3;
const pendingLimit = 32;
const offerKey = (accountId: string) => `0xdmme:push-offer:${accountId}`;

function failure(label: string, error: unknown): string {
  return t('{0}: {1}', [
    label,
    error instanceof Error ? translatedError(error.message) : t('not applied.'),
  ]);
}
function pushKinds(push: AccountSettings['push']): PushPreferences {
  return {
    messages: push.messages,
    calls: push.calls,
    showCalls: push.showCalls,
  };
}
function samePush(a: PushPreferences, b: PushPreferences): boolean {
  return (
    a.messages === b.messages &&
    a.calls === b.calls &&
    a.showCalls === b.showCalls
  );
}

/**
 * Initial settings and the account copy of device choices.
 * The copy lives in the encrypted vault; the
 * server only stores ciphertext, like every other vault record.
 */
export class AccountSettingsController {
  private readonly ports: SettingsPorts;
  private readonly record: SettingsRecord;
  private readonly completion: SettingsCompletion;
  private readonly languageRecord: LanguageRecord;
  private savedLanguage: AppLanguage | null = null;
  private languageReady = false;
  private session: AccountSession | null = null;
  private generation = 0;
  private context = new AbortController();
  private state: 'idle' | 'loading' | 'done' = 'idle';
  private attempts = 0;
  /** The account copy once loaded; null while missing or not loaded. */
  private saved: AccountSettings | null = null;
  private pending: PreferenceChange[] = [];
  private applying = false;
  private writes: Promise<void> = Promise.resolve();
  constructor(ports: SettingsPorts, completion = new SettingsCompletion()) {
    this.ports = ports;
    this.completion = completion;
    this.record = new SettingsRecord(ports.sync);
    this.languageRecord = new LanguageRecord(ports.sync);
    onPreference((change) => this.changed(change));
    // The encrypted profile opens after the device key, which is when the
    // account module announces its preferences; readiness is checked again then.
    globalThis.window?.addEventListener('0xdmme-profile-preferences', () => {
      this.ready();
    });
  }
  setSession(session: AccountSession | null): void {
    if (session?.accountId !== this.session?.accountId) {
      this.generation++;
      this.context.abort();
      this.context = new AbortController();
      this.state = 'idle';
      this.attempts = 0;
      this.saved = null;
      this.savedLanguage = null;
      this.languageReady = false;
      this.pending = [];
    }
    this.session = session;
    this.ports.push.setSession(session);
  }
  /** Called whenever the account and device are ready; starts once per account. */
  ready(): void {
    const session = this.session;
    if (!session || this.state !== 'idle' || this.attempts >= loadAttempts)
      return;
    // Wait for the encrypted profile and for any other modal to finish.
    if (!this.ports.privacy.current() || document.querySelector('dialog[open]'))
      return;
    this.state = 'loading';
    this.attempts++;
    void this.start(session, this.generation);
  }
  private async start(session: AccountSession, generation: number) {
    try {
      const value = await this.record.load(session.accountId);
      const language = await this.languageRecord.load(session.accountId);
      if (generation !== this.generation) return;
      this.savedLanguage = language;
      this.languageReady = true;
      if (language) await this.ports.language?.set(language);
      if (generation !== this.generation) return;
      await this.initializeChoices(session, generation, value);
      if (generation === this.generation) this.state = 'done';
    } catch (error: unknown) {
      if (generation !== this.generation) return;
      this.state = 'idle';
      if (this.attempts >= loadAttempts)
        showToast(failure(t('Configurações da conta'), error));
    }
  }
  private async initializeChoices(
    session: AccountSession,
    generation: number,
    value: AccountSettings | null,
  ): Promise<void> {
    if (value) {
      await this.adopt(session, value);
      this.guard(generation);
      this.completion.remember(session.accountId);
      return;
    }
    if (!this.completion.has(session.accountId))
      return this.offerWizard(session, generation);
    const current = (await this.currentPack()).settings;
    this.guard(generation);
    const pending = this.pending.splice(0);
    const next = pending.reduce(withChange, current);
    if (pending.length) this.save(session, next);
    else this.saved = next;
  }
  /** Another device saved the account copy: apply it here, then keep it current. */
  private async adopt(session: AccountSession, value: AccountSettings) {
    const merged = this.pending.reduce(withChange, value);
    this.pending = [];
    this.saved = value;
    await this.applyDevice(merged);
    this.save(session, merged);
    await this.followPush(session, merged.push);
  }
  private async applyDevice(value: AccountSettings): Promise<void> {
    this.applying = true;
    try {
      this.ports.theme.set(value.theme);
      if (this.ports.externalMedia.current() !== value.externalMedia)
        this.ports.externalMedia.set(value.externalMedia);
      if (this.ports.sound.current() !== value.sound)
        await this.ports.sound.set(value.sound);
    } finally {
      this.applying = false;
    }
  }
  /** Push depends on this browser's permission, so it follows the account in steps. */
  private async followPush(
    session: AccountSession,
    push: AccountSettings['push'],
  ): Promise<void> {
    try {
      const subscribed = await this.ports.push.pushSubscribed();
      if (!push.enabled) {
        if (subscribed) await this.ports.push.disablePush();
        return;
      }
      if (!subscribed && !(await this.subscribeDevice(session, push))) return;
      const current = await this.ports.push.pushPreferences();
      if (!samePush(current, pushKinds(push)))
        await this.ports.push.configurePush(pushKinds(push));
    } catch (error: unknown) {
      showToast(failure(t('Notifications on this device'), error));
    }
  }
  /** True when this device is subscribed afterwards. */
  private async subscribeDevice(
    session: AccountSession,
    push: AccountSettings['push'],
  ): Promise<boolean> {
    if (!('Notification' in globalThis)) return false;
    if (Notification.permission === 'granted') {
      await this.ports.push.enablePush();
      return true;
    }
    if (Notification.permission === 'denied' || this.offered(session))
      return false;
    const shown = await offerPushOnDevice({
      enable: async () => {
        await this.ports.push.enablePush();
        await this.ports.push.configurePush(pushKinds(push));
      },
      signal: this.context.signal,
    });
    if (shown) this.markOffered(session);
    return false;
  }
  private offered(session: AccountSession): boolean {
    try {
      return localStorage.getItem(offerKey(session.accountId)) === '1';
    } catch {
      return false;
    }
  }
  private markOffered(session: AccountSession): void {
    try {
      localStorage.setItem(offerKey(session.accountId), '1');
    } catch {
      // Without storage the offer may appear again on the next visit.
    }
  }
  private async offerWizard(session: AccountSession, generation: number) {
    this.pending = [];
    await openSettingsWizard({
      initial: await this.currentPack(),
      confirm: (pack) => this.confirm(session, generation, pack),
      saveLanguage: (language) => this.saveLanguage(language),
      languageBlocked: () => this.ports.language?.blocked?.() ?? null,
      signal: this.context.signal,
    });
  }
  private async currentPack(): Promise<SettingsPack> {
    const subscribed = await this.ports.push.pushSubscribed();
    const kinds = subscribed
      ? await this.ports.push.pushPreferences()
      : defaultPushPreferences;
    return {
      settings: {
        version: 1,
        theme: this.ports.theme.current(),
        sound: this.ports.sound.current(),
        externalMedia: this.ports.externalMedia.current() ?? false,
        push: { enabled: subscribed, ...kinds },
      },
      privacy: this.ports.privacy.current() ?? {
        online: false,
        lastSeen: false,
        readReceipts: false,
        backupReminder: false,
      },
      discovery: await this.ports.discovery.current(),
    };
  }
  /** Runs inside the submit gesture: push is requested before any await. */
  private async confirm(
    session: AccountSession,
    generation: number,
    pack: SettingsPack,
  ): Promise<string[]> {
    const pushStarted = pack.settings.push.enabled
      ? this.ports.push.enablePush()
      : this.ports.push
          .pushSubscribed()
          .then((subscribed) =>
            subscribed ? this.ports.push.disablePush() : undefined,
          );
    const problems = await this.applyPack(pack, pushStarted);
    this.guard(generation);
    await this.record.save(session.accountId, pack.settings);
    this.guard(generation);
    await this.saveLanguage(this.savedLanguage ?? currentLanguage());
    this.guard(generation);
    await this.ports.language?.set(this.savedLanguage ?? currentLanguage());
    this.guard(generation);
    this.saved = pack.settings;
    this.completion.remember(session.accountId);
    return problems;
  }
  private async applyPack(
    pack: SettingsPack,
    pushStarted: Promise<void>,
  ): Promise<string[]> {
    const steps: [string, () => Promise<void>][] = [
      [
        t('Push notifications'),
        async () => {
          await pushStarted;
          if (pack.settings.push.enabled)
            await this.ports.push.configurePush(pushKinds(pack.settings.push));
        },
      ],
      [t('Theme, sounds and media'), () => this.applyDevice(pack.settings)],
      [t('Privacy'), () => this.ports.privacy.save(pack.privacy)],
      [
        t('Who can request a conversation'),
        () => this.ports.discovery.set(pack.discovery),
      ],
    ];
    const problems: string[] = [];
    this.applying = true;
    try {
      for (const [label, step] of steps)
        await step().catch((error: unknown) => {
          problems.push(failure(label, error));
        });
    } finally {
      this.applying = false;
    }
    return problems;
  }
  /** A change made in Settings updates the account copy. */
  private changed(change: PreferenceChange): void {
    const session = this.session;
    if (!session || this.applying) return;
    if (this.state === 'loading' && !this.saved) {
      if (this.pending.length < pendingLimit) this.pending.push(change);
      return;
    }
    if (this.saved) this.save(session, withChange(this.saved, change));
  }
  /** Serialized writes; an unchanged copy is not written again. */
  private save(session: AccountSession, next: AccountSettings): void {
    if (this.saved && sameSettings(this.saved, next)) return;
    this.saved = next;
    const generation = this.generation;
    this.writes = this.writes
      .then(() =>
        generation === this.generation
          ? this.record.save(session.accountId, next)
          : undefined,
      )
      .catch((error: unknown) => {
        showToast(
          failure(
            t('Setting applied on this device, but not saved to your account'),
            error,
          ),
        );
      });
  }
  /** Explicit language changes wait for account durability before reloading the UI. */
  async saveLanguage(language: AppLanguage): Promise<void> {
    const session = this.session;
    if (!session || !this.languageReady)
      throw new Error('Open your account to save your language.');
    const generation = this.generation;
    const current = () => this.guard(generation);
    const write = this.writes.then(async () => {
      current();
      if (this.savedLanguage === language) return;
      await this.languageRecord.save(session.accountId, language, current);
      this.savedLanguage = language;
    });
    this.writes = write.catch(() => undefined);
    await write;
  }
  private guard(generation: number): void {
    if (generation !== this.generation)
      throw new Error('The account changed before settings were saved.');
  }
}
