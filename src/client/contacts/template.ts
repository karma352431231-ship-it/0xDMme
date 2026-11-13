import { t } from '../../shared/i18n/index.ts';
import { chatIcon } from '../chat-ui/index.ts';
import { menuIconMarkup } from '../menu-icons/index.ts';

const inviteForm = t('html.801287f32cb5', [
  menuIconMarkup('link'),
  menuIconMarkup('paste'),
  menuIconMarkup('scan'),
  menuIconMarkup('info'),
]);

/** The own invitation is the third tab of the add editor, not its own dialog. */
const ownInvite = t('html.597746d2b14a', [
  menuIconMarkup('link'),
  menuIconMarkup('copy'),
  menuIconMarkup('clock'),
  menuIconMarkup('refresh'),
  menuIconMarkup('block'),
  menuIconMarkup('info'),
]);

export const template = t('html.c6799e4dff82', ['']);

/** Lives outside the Contacts page so it can open over any view. */
export const editorTemplate = t('html.628f1388b464', [
  chatIcon('close'),
  menuIconMarkup('wallet'),
  menuIconMarkup('link'),
  menuIconMarkup('qr'),
  menuIconMarkup('paste'),
  menuIconMarkup('edit'),
  menuIconMarkup('lock'),
  inviteForm,
  ownInvite,
]);

export const settingsTemplate = t('html.77e1353773c1');
