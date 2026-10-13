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
      'A análise automática indicou conteúdo explícito, proibido pela política pública. Você pode contestar a análise no Perfil.',
    ),
    held: t(
      'A análise ficou incerta. O conteúdo fica fora do público até uma aprovação. Você pode contestar no Perfil.',
    ),
    failed: t(
      'Não foi possível concluir a análise com segurança. O conteúdo fica fora do público enquanto não houver aprovação.',
    ),
    discarding: t(
      'O prazo de sete dias terminou sem aprovação. O arquivo está sendo descartado.',
    ),
    expired: t(
      'O arquivo foi descartado ao terminar o prazo de sete dias sem aprovação.',
    ),
  };
  const reason = reasons[notice.status];
  if (!reason) return null;
  const titles = {
    'post-media': t('Sua postagem ou resposta foi retirada do público'),
    avatar: t('Sua foto de perfil ficou fora do público'),
    'profile-banner': t('Seu banner ficou fora do público'),
    'community-photo': t('A foto da comunidade ficou fora do público'),
    'community-banner': t('O banner da comunidade ficou fora do público'),
  };
  return {
    id: `${notice.id}:${notice.status}`,
    review: notice.id,
    read: false,
    title: titles[notice.kind],
    reason: notice.decision
      ? t('{0} Revisão: {1}', [reason, notice.decision])
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
      throw new Error('Avisos de análise inválidos.');
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
