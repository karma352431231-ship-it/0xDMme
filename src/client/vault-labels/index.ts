import { t } from '../../shared/i18n/index.ts';
import type { VaultChange } from '../../shared/vault/index.ts';
import { languageRecordLabel } from '../language-record/index.ts';

const settingsLabels = new Set([
  'Configurações da conta',
  'Preferências da conversa',
  'Conversa favorita',
  'Privacidade dos próximos status',
  'Recuperação das DMs pelo @',
  'Chamadas perdidas',
]);

/** Localize reserved system settings labels, preserving stored bytes and user names. */
export function vaultLabel(
  change: Pick<VaultChange, 'kind' | 'label'>,
): string {
  if (change.kind === 'settings' && change.label === languageRecordLabel)
    return t('App language');
  return change.kind === 'settings' && settingsLabels.has(change.label)
    ? t(change.label)
    : change.label;
}
