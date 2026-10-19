import { t } from '../../shared/i18n/index.ts';
import { keys, object } from '../../shared/account/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';
import { pushPreferences } from '../../shared/daily/index.ts';
import type { PushPreferences } from '../../shared/daily/index.ts';
import { isTheme } from '../appearance/index.ts';
import type { Theme } from '../appearance/index.ts';
import type { PreferenceChange } from '../preference-events/index.ts';

/**
 * Choices that would otherwise stay on one device; the account copy lives in
 * the encrypted vault. Privacy and discovery already
 * belong to the account (encrypted profile and server) and are not repeated here.
 */
export interface AccountSettings {
  version: 1;
  theme: Theme;
  sound: boolean;
  externalMedia: boolean;
  push: { enabled: boolean } & PushPreferences;
}
export interface PrivacyChoices {
  online: boolean;
  lastSeen: boolean;
  readReceipts: boolean;
  backupReminder: boolean;
}
/** Everything Configurações iniciais sets at once. */
export interface SettingsPack {
  settings: AccountSettings;
  privacy: PrivacyChoices;
  discovery: DiscoveryMode;
}

function flag(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid account settings.');
  return value;
}

export function accountSettings(value: unknown): AccountSettings {
  const data = object(value);
  keys(data, ['version', 'theme', 'sound', 'externalMedia', 'push']);
  if (data['version'] !== 1 || !isTheme(data['theme']))
    throw new Error('Invalid account settings.');
  const push = object(data['push']);
  keys(push, ['enabled', 'messages', 'calls', 'showCalls']);
  const { enabled, ...kinds } = push;
  return {
    version: 1,
    theme: data['theme'],
    sound: flag(data['sound']),
    externalMedia: flag(data['externalMedia']),
    push: { enabled: flag(enabled), ...pushPreferences(kinds) },
  };
}

/** A change made in Configurações, applied over the account copy. */
export function withChange(
  current: AccountSettings,
  change: PreferenceChange,
): AccountSettings {
  return {
    ...current,
    theme: isTheme(change.theme) ? change.theme : current.theme,
    sound: change.sound ?? current.sound,
    externalMedia: change.externalMedia ?? current.externalMedia,
    push: {
      ...current.push,
      ...change.push,
      enabled: change.pushEnabled ?? current.push.enabled,
    },
  };
}

export function sameSettings(a: AccountSettings, b: AccountSettings): boolean {
  return (
    JSON.stringify(accountSettings(a)) === JSON.stringify(accountSettings(b))
  );
}

export type PresetId = 'reserved' | 'balanced' | 'social';
interface Preset {
  id: PresetId;
  label: string;
  hint: string;
  externalMedia: boolean;
  push: AccountSettings['push'];
  privacy: Omit<PrivacyChoices, 'backupReminder'>;
  discovery: DiscoveryMode;
}
/** Starting points only: the person reviews every option before anything is saved. */
export const presets: readonly Preset[] = [
  {
    id: 'reserved',
    label: t('Reserved'),
    hint: t(
      'Minimal exposure: invitation only, no presence, GIFs as links and no push.',
    ),
    externalMedia: false,
    push: { enabled: false, messages: true, calls: true, showCalls: false },
    privacy: { online: false, lastSeen: false, readReceipts: false },
    discovery: 'invite',
  },
  {
    id: 'balanced',
    label: t('Balanced'),
    hint: t(
      'Alerts and GIFs enabled, presence hidden and read receipts enabled.',
    ),
    externalMedia: true,
    push: { enabled: true, messages: true, calls: true, showCalls: true },
    privacy: { online: false, lastSeen: false, readReceipts: true },
    discovery: 'wallet',
  },
  {
    id: 'social',
    label: t('Social'),
    hint: t(
      'Everything on: online status, read receipts, GIFs and full alerts.',
    ),
    externalMedia: true,
    push: { enabled: true, messages: true, calls: true, showCalls: true },
    privacy: { online: true, lastSeen: false, readReceipts: true },
    discovery: 'wallet',
  },
];

/** Theme, sound and the backup reminder are taste and safety, so presets keep them. */
export function presetPack(id: PresetId, current: SettingsPack): SettingsPack {
  const preset = presets.find((item) => item.id === id) ?? presets[0]!;
  return {
    settings: {
      ...current.settings,
      externalMedia: preset.externalMedia,
      push: { ...preset.push },
    },
    privacy: {
      ...preset.privacy,
      backupReminder: current.privacy.backupReminder,
    },
    discovery: preset.discovery,
  };
}
