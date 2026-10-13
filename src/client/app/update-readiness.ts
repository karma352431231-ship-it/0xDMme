import { t } from '../../shared/i18n/index.ts';
interface Readiness {
  canActivate: () => boolean;
}
interface UpdateFeatures {
  authenticated: () => boolean;
  account: Readiness;
  devices: Readiness & { updateBlockReason: () => string | null };
  vault: Readiness;
  backups: Readiness;
  contacts: Readiness;
  messages: Readiness;
  statuses: Readiness;
  representatives: Readiness;
  activity: Readiness;
  publicProfiles: Readiness;
  communities: Readiness;
  calls: { active: () => boolean };
}
/** Report the actual owner of a pending operation; disconnected views have no drafts. */
export function updateBlockReason(features: UpdateFeatures): string | null {
  const device = features.devices.updateBlockReason();
  if (device) return device;
  const checks: [string, () => boolean][] = [
    [
      t('a entrada na conta ou a edição do perfil privado em Perfil'),
      features.account.canActivate,
    ],
    [
      t('a autorização do aparelho em Perfil → Dispositivos conectados'),
      features.devices.canActivate,
    ],
  ];
  if (features.authenticated())
    checks.push(
      [
        t('a operação do cofre em Perfil → Cofre e backup'),
        features.vault.canActivate,
      ],
      [t('o backup em Perfil → Cofre e backup'), features.backups.canActivate],
      [t('a edição em Contatos'), features.contacts.canActivate],
      [t('o envio ou gravação em Conversas'), features.messages.canActivate],
      [t('a publicação em Meu status'), features.statuses.canActivate],
      [
        t('a operação em Organizações e representantes'),
        features.representatives.canActivate,
      ],
      [t('a operação em Atividade'), features.activity.canActivate],
      [
        t('a edição do perfil público em Perfil → Perfil público'),
        features.publicProfiles.canActivate,
      ],
      [
        t('a operação ou edição em Comunidades'),
        features.communities.canActivate,
      ],
      [t('a chamada em andamento'), () => !features.calls.active()],
    );
  const pending = checks.find(([, ready]) => !ready());
  return pending
    ? t('Conclua ou cancele {0} antes de atualizar.', [pending[0]])
    : null;
}
