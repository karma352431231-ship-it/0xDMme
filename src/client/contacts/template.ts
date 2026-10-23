import { t } from '../../shared/i18n/index.ts';
import { chatIcon } from '../chat-ui/index.ts';

const inviteForm = t('html.801287f32cb5');

const ownInvite = t('html.597746d2b14a', [chatIcon('close')]);

export const template = t('html.c6799e4dff82', [ownInvite]);

/** Lives outside the Contacts page so it can open over any view. */
export const editorTemplate = t('html.628f1388b464', [
  chatIcon('close'),
  inviteForm,
]);

export const settingsTemplate = t('html.77e1353773c1');
