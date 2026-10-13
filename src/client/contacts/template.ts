import { t } from '../../shared/i18n/index.ts';
import { chatIcon } from '../chat-ui/index.ts';

const inviteForm = t('html.801287f32cb5');

const ownInvite = t('html.597746d2b14a', [chatIcon('close')]);

export const template = t('html.b5f3eff2a293', [
  chatIcon('close'),
  inviteForm,
  ownInvite,
]);

export const settingsTemplate = t('html.77e1353773c1');
