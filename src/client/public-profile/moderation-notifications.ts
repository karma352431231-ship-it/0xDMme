import { t } from '../../shared/i18n/index.ts';
import { publicModerationNotice } from '../../shared/public-moderation/index.ts';
import type { PublicModerationNotice } from '../../shared/public-moderation/index.ts';
import type { PublicProfiles } from './controller.ts';

export interface ModerationNotification {
  id: string;
  title: string;
  reason: string;
  review: string;
  read: boolean;
}
export function moderationNotification(
  notice: PublicModerationNotice,
): ModerationNotification | null {
  const reasons: Partial<Record<PublicModerationNotice['status'], string>> = {
    rejected: t(
      'Automated analysis detected explicit content, which is prohibited by the public content policy. You can appeal in Profile.',
    ),
    held: t(
      'The analysis was uncertain. The content will not be public until approved. You can appeal in Profile.',
    ),
    failed: t(
      'Could not safely complete analysis. Content will not be public until approved.',
    ),
    discarding: t(
      'The seven-day deadline passed without approval. The file is being discarded.',
    ),
    expired: t('The file was discarded after seven days without approval.'),
  };
  const reason = reasons[notice.status];
  if (!reason) return null;
  const titles = {
    'post-media': t('Your post or reply was removed from public view'),
    avatar: t('Your profile photo was withheld from public view'),
    'profile-banner': t('Your banner was withheld from public view'),
    'community-photo': t('The community photo was withheld from public view'),
    'community-banner': t('The community banner was withheld from public view'),
  };
  return {
    id: `${notice.id}:${notice.status}`,
    review: notice.id,
    read: false,
    title: titles[notice.kind],
    reason: notice.decision
      ? t('{0} Revision: {1}', [reason, notice.decision])
      : reason,
  };
}
/** Durable notices stay server-side; only bounded acknowledgment IDs stay on this device. */
export class ModerationNotifications {
  private readonly controller: PublicProfiles;
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  private account: string | null = null;
  private generation = 0;
  private readIds = new Set<string>();
  constructor(
    controller: PublicProfiles,
    storage: Pick<
      Storage,
      'getItem' | 'setItem'
    > | null = typeof localStorage === 'undefined' ? null : localStorage,
  ) {
    this.controller = controller;
    this.storage = storage;
  }
  private key(): string {
    return `0xdmme:moderation-read:${this.account}`;
  }
  setAccount(account: string | null): void {
    if (account === this.account) return;
    this.generation++;
    this.account = account;
    this.readIds.clear();
    if (!account) return;
    try {
      const value: unknown = JSON.parse(
        this.storage?.getItem(this.key()) ?? '[]',
      );
      if (
        Array.isArray(value) &&
        value.length <= 128 &&
        value.every((id) => typeof id === 'string' && id.length <= 64)
      )
        this.readIds = new Set(value as string[]);
    } catch {
      /* An unavailable acknowledgment store never hides a notice. */
    }
  }
  async read(): Promise<readonly ModerationNotification[]> {
    if (!this.account) return [];
    const old = this.generation;
    const data = await this.controller.perform('moderation-notices', {
      after: null,
    });
    if (old !== this.generation) return [];
    if (!Array.isArray(data) || data.length > 32)
      throw new Error('Invalid analysis notices.');
    return data.map(publicModerationNotice).flatMap((notice) => {
      const item = moderationNotification(notice);
      return item ? [{ ...item, read: this.readIds.has(item.id) }] : [];
    });
  }
  markRead(ids: readonly string[]): void {
    for (const id of ids) this.readIds.add(id);
    this.readIds = new Set([...this.readIds].slice(-128));
    try {
      this.storage?.setItem(this.key(), JSON.stringify([...this.readIds]));
    } catch {
      /* The acknowledgment still applies during this visit. */
    }
  }
}
