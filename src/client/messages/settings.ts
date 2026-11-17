import { t } from '../../shared/i18n/index.ts';
import { settingRow, settingSwitch } from '../settings-ui/index.ts';

/** The Sounds row of Notifications and calls; the second line shows only problems. */
export function soundSettings(): string {
  return settingRow({
    icon: 'sound',
    label: t('Sounds'),
    tip: t(
      'Message and call sounds in this browser, kept when you switch accounts. Volume and lock screen sounds follow your system.',
    ),
    for: 'settings-sound',
    metaAttributes: 'data-sound-status role="status"',
    control: settingSwitch({
      id: 'settings-sound',
      attributes: 'data-sound-toggle',
    }),
  });
}
