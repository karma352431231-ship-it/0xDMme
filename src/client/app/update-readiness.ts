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
      t('account sign-in or private profile editing in Profile'),
      features.account.canActivate,
    ],
    [
      t('device authorization in Profile → Connected devices'),
      features.devices.canActivate,
    ],
  ];
  if (features.authenticated())
    checks.push(
      [
        t('the vault operation in Profile → Vault and backup'),
        features.vault.canActivate,
      ],
      [
        t('the backup in Profile → Vault and backup'),
        features.backups.canActivate,
      ],
      [t('editing in Contacts'), features.contacts.canActivate],
      [
        t('sending, recording or unsent text in Conversations'),
        features.messages.canActivate,
      ],
      [t('publishing in My status'), features.statuses.canActivate],
      [
        t('the operation in Organizations and representatives'),
        features.representatives.canActivate,
      ],
      [t('the operation in Activity'), features.activity.canActivate],
      [
        t('public profile editing in Profile → Public profile'),
        features.publicProfiles.canActivate,
      ],
      [
        t('the operation or editing in Communities'),
        features.communities.canActivate,
      ],
      [t('the ongoing call'), () => !features.calls.active()],
    );
  const pending = checks.find(([, ready]) => !ready());
  return pending
    ? t('Complete or cancel {0} before updating.', [pending[0]])
    : null;
}
