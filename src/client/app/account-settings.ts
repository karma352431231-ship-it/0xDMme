import { AccountSettingsController } from '../account-settings/index.ts';
import type { SettingsPorts } from '../account-settings/index.ts';
import type { ProfilePreferences } from '../account-profile/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';
import type { Theme } from '../appearance/index.ts';
import { Daily } from '../daily/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import {
  applySoundPreference,
  storedSoundPreference,
} from '../notification-sound/index.ts';
import type { VaultAccess } from '../vault-authority/index.ts';
import { applyLanguage } from '../language/index.ts';
import { currentLanguage } from '../../shared/i18n/index.ts';

/** Connects Initial settings to the modules that own each setting. */
export function startAccountSettings(input: {
  languageBlocked: () => string | null;
  access: VaultAccess;
  sync: SettingsPorts['sync'] & ConstructorParameters<typeof Daily>[1];
  appearance: { current: () => Theme; set: (theme: Theme) => void };
  externalMedia: ExternalMediaConsent;
  account: {
    privacyPreferences: () => Pick<
      ProfilePreferences,
      'online' | 'lastSeen' | 'readReceipts'
    > | null;
    backupReminder: () => boolean;
    savePrivacy: (changes: Partial<ProfilePreferences>) => Promise<void>;
  };
  contacts: {
    discovery: () => Promise<DiscoveryMode>;
    setDiscovery: (mode: DiscoveryMode) => Promise<void>;
  };
}): AccountSettingsController {
  const { access, sync, appearance, externalMedia, account, contacts } = input;
  return new AccountSettingsController({
    sync,
    language: {
      set: async (language) => {
        const prior = currentLanguage();
        await applyLanguage(language);
        if (prior === language) return;
        if (!input.languageBlocked()) location.reload();
      },
      blocked: input.languageBlocked,
    },
    theme: appearance,
    sound: {
      current: () => storedSoundPreference(),
      set: (enabled) => applySoundPreference(enabled),
    },
    externalMedia: {
      current: () => externalMedia.accountChoice(),
      set: (choice) => externalMedia.applyAccountChoice(choice),
    },
    // Its own instance: push calls carry no conversation state.
    push: new Daily(access, sync),
    privacy: {
      current: () => {
        const preferences = account.privacyPreferences();
        return preferences
          ? { ...preferences, backupReminder: account.backupReminder() }
          : null;
      },
      save: (choices) => account.savePrivacy(choices),
    },
    discovery: {
      current: () => contacts.discovery(),
      set: (mode) => contacts.setDiscovery(mode),
    },
  });
}
