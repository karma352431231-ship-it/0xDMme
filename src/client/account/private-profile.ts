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
  sealProfile,
  validatePhoto,
} from '../account-profile/index.ts';
import type {
  PrivateProfile,
  ProfilePreferences,
} from '../account-profile/index.ts';
import { api, node } from './core.ts';
import type { AccountCore } from './core.ts';

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

/**
 * The encrypted private profile of the session: its key, preferences, photo
 * and the drafts of the name and preference forms. Opened only with a key
 * from this device; cleared on logout, expiry and account changes.
 */
export class AccountPrivateProfile {
  private profile: PrivateProfile | null = null;
  private key: CryptoKey | null = null;
  private photoUrl: string | undefined;
  private dirtyName = false;
  private dirtyProfile = false;
  private draftName: string | null = null;
  private readonly core: AccountCore;
  private readonly options: ProfileOptions;
  private readonly host: {
    setSession: (session: AccountSession | null) => void;
    render: () => void;
    renderSidebar: () => void;
    operation: (work: () => Promise<void>) => Promise<void>;
  };
  constructor(
    core: AccountCore,
    options: ProfileOptions,
    host: AccountPrivateProfile['host'],
  ) {
    this.core = core;
    this.options = options;
    this.host = host;
  }
  get loaded(): boolean {
    return this.profile !== null;
  }
  /** No unsaved name or preference draft. */
  get clean(): boolean {
    return !this.dirtyName && !this.dirtyProfile;
  }
  clear(): void {
    this.key = null;
    this.profile?.photo?.bytes.fill(0);
    this.profile = null;
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    this.photoUrl = undefined;
    this.dirtyName = false;
    this.dirtyProfile = false;
    this.draftName = null;
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
      this.core.status =
        'Sessão conectada. Abra sua conta em Perfil → Aparelhos.';
      this.core.profileStatus =
        'Perfil bloqueado. Autorize este aparelho por vinculação ou recuperação.';
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
      this.core.session?.accountId !== current.accountId ||
      this.core.disposed
    ) {
      opened.photo?.bytes.fill(0);
      return;
    }
    this.key = localKey;
    this.profile = opened;
    window.dispatchEvent(new Event('0xdmme-profile-preferences'));
    this.core.status = 'Conta pronta.';
    this.core.profileStatus = 'Perfil disponível.';
  }
  /** Reloads the session and profile unless a form has an unsaved draft. */
  async refresh(): Promise<void> {
    if (!this.core.session || this.core.busy || !this.clean) return;
    const current = accountSession(await api('session'));
    this.host.setSession(current);
    await this.load(current);
    this.host.render();
  }
  bind(): void {
    this.find('[data-name-form]')?.addEventListener('submit', (event) => {
      void this.saveName(event);
    });
    this.find('[data-preferences]')?.addEventListener('submit', (event) => {
      void this.savePreferences(event);
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
        this.profile.preferences[name as keyof ProfilePreferences] =
          target.checked;
      this.dirtyProfile = true;
    });
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
        if (checkbox) checkbox.checked = this.profile.preferences[name];
      }
    this.renderPhoto();
  }
  renderPhoto(): void {
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    const photo = this.profile?.photo;
    this.photoUrl = photo
      ? URL.createObjectURL(new Blob([photo.bytes], { type: photo.type }))
      : undefined;
    for (const avatar of [
      document.getElementById('account-avatar'),
      this.find('[data-profile-avatar]'),
    ]) {
      if (!avatar) continue;
      avatar.replaceChildren();
      if (this.photoUrl) {
        const image = document.createElement('img');
        image.src = this.photoUrl;
        image.alt = 'Sua foto de perfil';
        avatar.append(image);
      } else avatar.textContent = this.core.session?.name.slice(0, 1) || '#';
    }
  }
  async selectPhoto(): Promise<void> {
    const file =
      document.querySelector<HTMLInputElement>('#account-photo')?.files?.[0];
    const currentProfile = this.profile;
    if (!file || !currentProfile || file.size > 3_000_000) {
      this.core.status = 'Selecione uma foto de até 3 MB.';
      this.host.render();
      return;
    }
    await this.host.operation(async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      validatePhoto(file.type, bytes);
      if (this.profile !== currentProfile) {
        bytes.fill(0);
        return;
      }
      const previous = currentProfile.photo;
      currentProfile.photo = { type: file.type, bytes };
      const session = this.core.session;
      if (!session || !this.key)
        throw new Error('Abra sua conta para alterar a foto.');
      try {
        await this.persist(session, this.key, currentProfile);
        previous?.bytes.fill(0);
      } catch (error: unknown) {
        currentProfile.photo = previous;
        bytes.fill(0);
        throw error;
      }
      this.renderPhoto();
    });
  }
  /** Configurações iniciais: the same encrypted profile save as the form, with errors raised to the caller. */
  async savePrivacy(changes: Partial<ProfilePreferences>): Promise<void> {
    const current = this.core.session,
      currentKey = this.key,
      profile = this.profile;
    if (
      !current ||
      !currentKey ||
      !profile ||
      this.core.busy ||
      this.dirtyProfile
    )
      throw new Error(
        'Privacidade não aplicada: o perfil está carregando ou com edição aberta.',
      );
    const preferences = { ...profile.preferences, ...changes };
    if (JSON.stringify(preferences) === JSON.stringify(profile.preferences))
      return;
    this.core.busy = true;
    try {
      await this.persist(current, currentKey, { ...profile, preferences });
      if (this.profile === profile) profile.preferences = preferences;
    } finally {
      this.core.busy = false;
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
    if (!this.profile || this.dirtyProfile) return null;
    const { online, lastSeen, readReceipts } = this.profile.preferences;
    return { online, lastSeen, readReceipts };
  }
  shared(): {
    name: string;
    revision: number;
    photo: PrivateProfile['photo'];
  } | null {
    const session = this.core.session;
    return session && this.profile
      ? {
          name: session.name,
          revision: session.profileRevision,
          photo: this.profile.photo,
        }
      : null;
  }
  private find<T extends HTMLElement>(selector: string): T | null {
    return node<T>(this.core, selector);
  }
  private updateRevision(stored: unknown, current: AccountSession): void {
    const session = this.core.session;
    if (stored === null || session?.accountId !== current.accountId) return;
    const revision = profileEnvelope(stored).revision;
    if (session.profileRevision !== revision)
      this.host.setSession({ ...session, profileRevision: revision });
  }
  private async saveName(event: Event): Promise<void> {
    event.preventDefault();
    const current = this.core.session;
    const name = this.find<HTMLInputElement>(
      'input[name="display-name"]',
    )?.value;
    if (!current || name === undefined) return;
    await this.host.operation(async () => {
      const renamed = accountSession(
        await api('name', { input: { name }, csrf: current.csrf }),
      );
      if (this.core.session?.accountId === current.accountId)
        this.host.setSession(renamed);
      this.core.status = 'Nome salvo.';
      this.dirtyName = false;
      this.draftName = null;
    });
  }
  private async savePreferences(event: Event): Promise<void> {
    event.preventDefault();
    const current = this.core.session;
    const currentKey = this.key;
    const profile = this.profile;
    if (!current || !currentKey || !profile) return;
    await this.host.operation(() => this.persist(current, currentKey, profile));
  }
  private async persist(
    current: AccountSession,
    currentKey: CryptoKey,
    profile: PrivateProfile,
  ): Promise<void> {
    const revision = current.profileRevision + 1;
    const envelope = await sealProfile({
      profile,
      key: currentKey,
      accountId: current.accountId,
      revision,
    });
    if (this.options.saveProfile)
      await this.options.saveProfile(current, envelope, currentKey);
    else await api('profile', { input: envelope, csrf: current.csrf });
    if (this.core.session?.accountId === current.accountId)
      this.host.setSession({ ...current, profileRevision: revision });
    await this.options.privacyChanged?.(profile.preferences);
    this.core.status = 'Perfil salvo.';
    this.dirtyProfile = false;
    window.dispatchEvent(new Event('0xdmme-profile-preferences'));
    this.host.renderSidebar();
  }
}
