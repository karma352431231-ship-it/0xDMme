import { keys, object } from '../../shared/account/index.ts';
import type { DiscoveryMode } from '../../shared/contacts/index.ts';
import { pushPreferences } from '../../shared/daily/index.ts';
import type { PushPreferences } from '../../shared/daily/index.ts';
import { isTheme } from '../appearance/index.ts';
import type { Theme } from '../appearance/index.ts';
import type { PreferenceChange } from '../preference-events/index.ts';

/**
 * Choices that would otherwise stay on one device; the account copy lives in
 * the encrypted vault (docs/UI_CONFIGURACOES.md). Privacy and discovery already
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
  if (typeof value !== 'boolean')
    throw new Error('Configuração da conta inválida.');
  return value;
}

export function accountSettings(value: unknown): AccountSettings {
  const data = object(value);
  keys(data, ['version', 'theme', 'sound', 'externalMedia', 'push']);
  if (data['version'] !== 1 || !isTheme(data['theme']))
    throw new Error('Configuração da conta inválida.');
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
    label: 'Reservado',
    hint: 'O mínimo de exposição: só convite, sem presença, GIFs como link e sem push.',
    externalMedia: false,
    push: { enabled: false, messages: true, calls: true, showCalls: false },
    privacy: { online: false, lastSeen: false, readReceipts: false },
    discovery: 'invite',
  },
  {
    id: 'balanced',
    label: 'Equilibrado',
    hint: 'Avisos e GIFs ligados, presença escondida e confirmação de leitura.',
    externalMedia: true,
    push: { enabled: true, messages: true, calls: true, showCalls: true },
    privacy: { online: false, lastSeen: false, readReceipts: true },
    discovery: 'wallet',
  },
  {
    id: 'social',
    label: 'Social',
    hint: 'Tudo ligado: online, leitura, GIFs e avisos completos.',
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
