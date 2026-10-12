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
      'a entrada na conta ou a edição do perfil privado em Perfil',
      features.account.canActivate,
    ],
    [
      'a autorização do aparelho em Perfil → Dispositivos conectados',
      features.devices.canActivate,
    ],
  ];
  if (features.authenticated())
    checks.push(
      [
        'a operação do cofre em Perfil → Cofre e backup',
        features.vault.canActivate,
      ],
      ['o backup em Perfil → Cofre e backup', features.backups.canActivate],
      ['a edição em Contatos', features.contacts.canActivate],
      ['o envio ou gravação em Conversas', features.messages.canActivate],
      ['a publicação em Meu status', features.statuses.canActivate],
      [
        'a operação em Organizações e representantes',
        features.representatives.canActivate,
      ],
      ['a operação em Atividade', features.activity.canActivate],
      [
        'a edição do perfil público em Perfil → Perfil público',
        features.publicProfiles.canActivate,
      ],
      ['a operação ou edição em Comunidades', features.communities.canActivate],
      ['a chamada em andamento', () => !features.calls.active()],
    );
  const pending = checks.find(([, ready]) => !ready());
  return pending
    ? `Conclua ou cancele ${pending[0]} antes de atualizar.`
    : null;
}
