import { t } from '../../shared/i18n/index.ts';
import { PrivacyControls } from './privacy-controls.ts';
import { accountSession, profileEnvelope } from '../../shared/account/index.ts';
import type {
  AccountSession,
  EncryptedProfile,
} from '../../shared/account/index.ts';
import {
  emptyProfile,
  encodePrivateProfile,
  openProfile,
  profileKey,
  PrivatePhotoDraft,
  PrivatePreferencesDraft,
} from '../account-profile/index.ts';
import type {
  PrivateProfile,
  ProfilePreferences,
} from '../account-profile/index.ts';
import { api, node } from './core.ts';
import type { AccountSnapshot } from './core.ts';
import { writePrivateProfile } from './private-profile-write.ts';
import { savePrivatePhoto } from './private-photo-save.ts';
import { PrivateProfileAvatar } from './private-profile-avatar.ts';
import { avatarCrop, cropImage } from '../image-crop/index.ts';

export interface ProfileOptions {
  privacyChanged?: (preferences: ProfilePreferences) => Promise<void>;
  privateKey?: (
    session: AccountSession,
    walletOpening: 'login' | 'restore',
  ) => Promise<CryptoKey | null>;
  saveProfile?: (
    session: AccountSession,
    profile: EncryptedProfile,
    key: CryptoKey,
  ) => Promise<void>;
}

interface ProfileAccount {
  read: () => Pick<
    AccountSnapshot,
    'session' | 'status' | 'busy' | 'epoch' | 'disposed' | 'mounted'
  >;
  notice: (message: string) => void;
  profileNotice: (message: string) => void;
  withBusy: <T>(work: () => Promise<T>) => Promise<T>;
}

/**
 * The encrypted private profile of the session: its key, preferences, photo
 * and the drafts of the name and preference forms. Opened only with a key
 * from this device; cleared on logout, expiry and account changes.
 */
export class AccountPrivateProfile {
  private profile: PrivateProfile | null = null;
  private key: CryptoKey | null = null;
  private readonly avatar = new PrivateProfileAvatar();
  private dirtyName = false;
  private dirtyProfile = false;
  private draftName: string | null = null;
  private readonly photoDraft = new PrivatePhotoDraft();
  private readonly preferencesDraft = new PrivatePreferencesDraft();
  private readonly privacyControls: PrivacyControls;
  private readonly account: ProfileAccount;
  private readonly options: ProfileOptions;
  private readonly host: {
    setSession: (session: AccountSession | null) => void;
    render: () => void;
    renderSidebar: () => void;
    operation: (work: () => Promise<void>) => Promise<void>;
  };
  constructor(
    account: ProfileAccount,
    options: ProfileOptions,
    host: AccountPrivateProfile['host'],
  ) {
    this.account = account;
    this.options = options;
    this.host = host;
    this.privacyControls = new PrivacyControls({
      value: () =>
        this.profile
          ? this.preferencesDraft.value(this.profile.preferences)
          : null,
      busy: () => this.state.busy,
      status: () => this.state.status,
      change: (name, value) => {
        if (!this.profile) return;
        this.preferencesDraft.set(this.profile.preferences, name, value);
        this.dirtyProfile = true;
      },
      confirm: (event) => this.confirmChanges(event),
    });
  }
  private get state(): ReturnType<ProfileAccount['read']> {
    return this.account.read();
  }
  get loaded(): boolean {
    return this.profile !== null;
  }
  /** No unsaved name or preference draft. */
  get clean(): boolean {
    const nameChanged =
      this.dirtyName && this.draftName !== this.state.session?.name;
    const preferencesChanged =
      this.profile &&
      JSON.stringify(this.preferencesDraft.value(this.profile.preferences)) !==
        JSON.stringify(this.profile.preferences);
    return !nameChanged && !this.photoDraft.dirty() && !preferencesChanged;
  }
  clear(): void {
    this.photoDraft.clear();
    this.preferencesDraft.clear();
    this.key = null;
    this.profile?.photo?.bytes.fill(0);
    this.profile = null;
    this.avatar.clear();
    this.dirtyName = false;
    this.dirtyProfile = false;
    this.draftName = null;
    this.privacyControls.render();
  }
  async load(
    current: AccountSession,
    walletOpening: 'login' | 'restore' = 'restore',
  ): Promise<void> {
    this.clear();
    const localKey = this.options.privateKey
      ? await this.options.privateKey(current, walletOpening)
      : await profileKey(current.accountId, current.profileRevision === 0);
    if (!localKey) {
      this.account.notice(
        t('Session connected. Open your account in Profile → Devices.'),
      );
      this.account.profileNotice(
        t('Profile locked. Authorize this device through linking or recovery.'),
      );
      return;
    }
    const stored = await api('profile');
    this.updateRevision(stored, current);
    const opened =
      stored === null
        ? emptyProfile()
        : await openProfile({
            envelope: profileEnvelope(stored),
            key: localKey,
            accountId: current.accountId,
          });
    if (
      this.state.session?.accountId !== current.accountId ||
      this.state.disposed
    ) {
      opened.photo?.bytes.fill(0);
      return;
    }
    this.key = localKey;
    this.profile = opened;
    window.dispatchEvent(new Event('0xdmme-profile-preferences'));
    this.account.notice(t('Account ready.'));
    this.account.profileNotice(t('Profile available.'));
  }
  /** Reloads the session and profile unless a form has an unsaved draft. */
  async refresh(): Promise<void> {
    if (!this.state.session || this.state.busy || !this.clean) return;
    const current = accountSession(await api('session'));
    this.host.setSession(current);
    await this.load(current);
    this.host.render();
  }
  bind(): void {
    this.find('[data-private-photo-remove]')?.addEventListener('click', () => {
      void this.changePhoto(() => {
        this.photoDraft.remove();
        return Promise.resolve();
      });
    });
    this.find('[data-name-form]')?.addEventListener('submit', (event) => {
      void this.confirmChanges(event);
    });
    this.find('[data-preferences]')?.addEventListener('submit', (event) => {
      void this.confirmChanges(event);
    });
    this.find('[data-name-form]')?.addEventListener('input', () => {
      this.dirtyName = true;
      this.draftName =
        this.find<HTMLInputElement>('input[name="display-name"]')?.value ??
        null;
    });
    this.find('[data-preferences]')?.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || !this.profile) return;
      const name = target.name;
      if (Object.hasOwn(this.profile.preferences, name))
        this.preferencesDraft.set(
          this.profile.preferences,
          name as keyof ProfilePreferences,
          target.checked,
        );
      this.dirtyProfile = true;
    });
  }
  mountPrivacy(host: HTMLElement): void {
    this.privacyControls.mount(host);
  }
  /** The name field, preference boxes and photo of the open form. */
  renderForm(current: AccountSession): void {
    const name = this.find<HTMLInputElement>('input[name="display-name"]');
    if (name && document.activeElement !== name)
      name.value = this.draftName ?? current.name;
    if (this.profile)
      for (const name of Object.keys(
        this.profile.preferences,
      ) as (keyof ProfilePreferences)[]) {
        const checkbox = this.find<HTMLInputElement>(`input[name="${name}"]`);
        if (checkbox)
          checkbox.checked = this.preferencesDraft.value(
            this.profile.preferences,
          )[name];
      }
    this.renderPhoto();
    this.privacyControls.render();
  }
  renderPhoto(): void {
    this.avatar.render({
      hosts: [
        document.getElementById('account-avatar'),
        this.find('[data-profile-avatar]'),
        ...document.querySelectorAll<HTMLElement>('[data-private-avatar]'),
      ].filter((host): host is HTMLElement => host !== null),
      photo: this.photoDraft.value(this.profile?.photo ?? null),
      session: this.state.session,
    });
  }
  async selectPhoto(): Promise<void> {
    const input = document.querySelector<HTMLInputElement>('#account-photo');
    const chosen = input?.files?.[0];
    // Frame first (16/10/2026), on this device; cancel keeps the current photo.
    const file = chosen ? await this.framed(chosen, input) : null;
    if (chosen && !file) return;
    if (!file || !this.profile || file.size > 3_000_000) {
      this.account.notice(t('Select a photo no larger than 3 MB.'));
      this.host.render();
      return;
    }
    try {
      await this.changePhoto(() => this.photoDraft.choose(file));
    } finally {
      if (input) input.value = '';
    }
  }
  private async framed(
    file: File,
    input: HTMLInputElement | null,
  ): Promise<File | null> {
    try {
      const framed = await cropImage(file, avatarCrop);
      if (!framed && input) input.value = '';
      return framed;
    } catch {
      // A picture the browser cannot open still reaches the photo
      // validation below, which explains the refusal.
      return file;
    }
  }
  private async changePhoto(stage: () => Promise<void>): Promise<void> {
    const session = this.state.session,
      profile = this.profile,
      key = this.key,
      epoch = this.state.epoch;
    if (!session || !profile || !key) return;
    await this.host.operation(async () => {
      const revision = await savePrivatePhoto({
        session,
        profile,
        key,
        draft: this.photoDraft,
        stage,
        current: () =>
          this.state.session?.csrf === session.csrf &&
          this.profile === profile &&
          this.key === key &&
          this.state.epoch === epoch &&
          !this.state.disposed,
        ...(this.options.saveProfile ? { save: this.options.saveProfile } : {}),
      });
      if (revision === null) return;
      this.dirtyProfile =
        JSON.stringify(this.preferencesDraft.value(profile.preferences)) !==
        JSON.stringify(profile.preferences);
      this.host.setSession({ ...session, profileRevision: revision });
      this.account.notice(t('Profile saved.'));
      this.renderPhoto();
      this.host.renderSidebar();
    });
  }
  /** Initial settings: the same encrypted profile save as the form, with errors raised to the caller. */
  async savePrivacy(changes: Partial<ProfilePreferences>): Promise<void> {
    const current = this.state.session,
      currentKey = this.key,
      profile = this.profile;
    if (
      !current ||
      !currentKey ||
      !profile ||
      this.state.busy ||
      this.dirtyProfile
    )
      throw new Error(
        'Privacy settings not applied: the profile is loading or being edited.',
      );
    const preferences = { ...profile.preferences, ...changes };
    if (JSON.stringify(preferences) === JSON.stringify(profile.preferences))
      return;
    try {
      await this.account.withBusy(async () => {
        await this.persist(current, currentKey, { ...profile, preferences });
        if (this.profile === profile) profile.preferences = preferences;
      });
    } finally {
      this.host.render();
    }
  }
  backup(): string | null {
    return this.profile ? encodePrivateProfile(this.profile) : null;
  }
  backupReminder(): boolean {
    return this.profile?.preferences.backupReminder ?? false;
  }
  /** Saved choices only: a preference draft is not shared yet. */
  privacyPreferences(): Pick<
    ProfilePreferences,
    'online' | 'lastSeen' | 'readReceipts'
  > | null {
    if (!this.profile) return null;
    const { online, readReceipts } = this.profile.preferences;
    return { online, lastSeen: false, readReceipts };
  }
  shared(): {
    name: string;
    revision: number;
    photo: PrivateProfile['photo'];
  } | null {
    const session = this.state.session;
    return session && this.profile
      ? {
          name: session.name,
          revision: session.profileRevision,
          photo: this.profile.photo,
        }
      : null;
  }
  private find<T extends HTMLElement>(selector: string): T | null {
    return node<T>(this.state, selector);
  }
  private updateRevision(stored: unknown, current: AccountSession): void {
    const session = this.state.session;
    if (stored === null || session?.accountId !== current.accountId) return;
    const revision = profileEnvelope(stored).revision;
    if (session.profileRevision !== revision)
      this.host.setSession({ ...session, profileRevision: revision });
  }
  private async confirmChanges(event: Event): Promise<void> {
    event.preventDefault();
    const original = this.state.session,
      currentKey = this.key,
      profile = this.profile;
    if (!original) return;
    const name = this.find<HTMLInputElement>(
      'input[name="display-name"]',
    )?.value;
    await this.host.operation(async () => {
      if (this.dirtyProfile && (!currentKey || !profile))
        throw new Error('Open your account to confirm the profile.');
      await this.confirmName(original, name);
      await this.confirmContent(original, currentKey, profile);
      this.account.notice(t('Changes confirmed.'));
    });
  }
  private async confirmName(
    original: AccountSession,
    name: string | undefined,
  ): Promise<void> {
    if (!this.dirtyName || name === undefined) return;
    const renamed = accountSession(
      await api('name', { input: { name }, csrf: original.csrf }),
    );
    if (this.state.session?.csrf !== original.csrf) return;
    this.host.setSession(renamed);
    this.dirtyName = false;
    this.draftName = null;
  }
  private async confirmContent(
    original: AccountSession,
    currentKey: CryptoKey | null,
    profile: PrivateProfile | null,
  ): Promise<void> {
    const current = this.state.session;
    if (
      !this.dirtyProfile ||
      !currentKey ||
      !profile ||
      current?.accountId !== original.accountId
    )
      return;
    await this.persist(current, currentKey, profile);
  }
  private async persist(
    current: AccountSession,
    currentKey: CryptoKey,
    profile: PrivateProfile,
  ): Promise<void> {
    const visible = this.profile;
    const revision = await writePrivateProfile({
      session: current,
      value: {
        ...profile,
        photo: this.photoDraft.value(profile.photo),
        preferences: this.preferencesDraft.value(profile.preferences),
      },
      key: currentKey,
      current: () =>
        this.state.session?.csrf === current.csrf &&
        this.profile === visible &&
        !this.state.disposed,
      ...(this.options.saveProfile ? { save: this.options.saveProfile } : {}),
    });
    if (this.state.session?.csrf !== current.csrf || this.profile !== visible)
      return;
    this.photoDraft.commit(profile);
    this.preferencesDraft.commit(profile);
    this.host.setSession({ ...current, profileRevision: revision });
    await this.options.privacyChanged?.(profile.preferences);
    this.account.notice(t('Profile saved.'));
    this.dirtyProfile = false;
    window.dispatchEvent(new Event('0xdmme-profile-preferences'));
    this.host.renderSidebar();
  }
}
