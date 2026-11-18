import { t } from '../../shared/i18n/index.ts';
import { settingsGlyph } from '../settings-ui/index.ts';
// Authored markup only: no session, profile or server value enters it.
export const accountTemplate = t('html.6c0fbe0bf86d', [
  settingsGlyph('upload'),
  settingsGlyph('trash'),
]);
