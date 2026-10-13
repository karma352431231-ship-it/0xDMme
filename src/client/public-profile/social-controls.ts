import { t } from '../../shared/i18n/index.ts';
import { keys, object } from '../../shared/account/index.ts';
import {
  profileFollow,
  profileNotifications,
  publicBlockState,
} from '../../shared/profile-social/index.ts';
import type {
  PublicBlockState,
  ProfileSummary,
} from '../../shared/profile-social/index.ts';
import type { PublicProfiles } from './controller.ts';
import { communityIcon } from '../communities/index.ts';

function button(
  host: HTMLElement,
  label: string,
  work: () => Promise<void>,
  error: (error: unknown) => void,
): HTMLButtonElement {
  const node = document.createElement('button');
  node.type = 'button';
  node.textContent = label;
  node.addEventListener('click', () => {
    if (node.disabled) return;
    node.disabled = true;
    void work()
      .catch(error)
      .finally(() => {
        node.disabled = node.dataset['inactive'] === 'true';
      });
  });
  host.append(node);
  return node;
}
/** Follow never implies notifications. Blocks reuse the public-DM contract. */
export async function profileSocialControls(
  host: HTMLElement,
  summary: ProfileSummary,
  access: {
    controller: PublicProfiles;
    signal: AbortSignal;
    error: (error: unknown) => void;
    block: PublicBlockState;
    changed: () => Promise<void>;
  },
): Promise<void> {
  const { controller, signal, error } = access,
    target = summary.profile.id;
  let follow = profileFollow(
    await controller.perform('follow-state', { target }),
  );
  let alerts = profileNotifications(
    await controller.perform('notification-state', { target }),
  );
  if (signal.aborted) return;
  const followButton = button(
    host,
    '',
    async () => {
      follow = profileFollow(
        await controller.perform('follow', {
          target,
          following: !follow.following,
          revision: follow.revision,
        }),
      );
      alerts = profileNotifications(
        await controller.perform('notification-state', { target }),
      );
      if (!signal.aborted) paint();
    },
    error,
  );
  const bell = button(
    host,
    '',
    async () => {
      alerts = profileNotifications(
        await controller.perform('notification-set', {
          target,
          enabled: !alerts.enabled,
          revision: alerts.revision,
        }),
      );
      if (!signal.aborted) paint();
    },
    error,
  );
  bell.append(communityIcon('bell'));
  function paint(): void {
    followButton.textContent = follow.following ? t('Seguindo') : t('Seguir');
    followButton.setAttribute('aria-pressed', String(follow.following));
    bell.disabled = !follow.following || access.block.blocked;
    bell.dataset['inactive'] = String(bell.disabled);
    bell.setAttribute('aria-pressed', String(alerts.enabled));
    bell.setAttribute(
      'aria-label',
      alerts.enabled
        ? t('Desativar notificações de posts e respostas')
        : t('Ativar notificações de posts e respostas'),
    );
    bell.title = follow.following
      ? alerts.enabled
        ? t('Notificações ligadas')
        : t('Notificações desligadas')
      : t('Siga para ativar notificações');
  }
  paint();
  const menu = document.createElement('details'),
    summaryNode = document.createElement('summary');
  menu.className = 'post-more';
  const content = document.createElement('div');
  content.className = 'post-more-content';
  summaryNode.setAttribute('aria-label', t('Opções do usuário'));
  summaryNode.append(communityIcon('more'));
  menu.append(summaryNode, content);
  host.append(menu);
  const block = button(
    content,
    access.block.blocked ? t('Desbloquear usuário') : t('Bloquear usuário'),
    async () => {
      const saved = publicBlockState(
        await controller.perform('block', {
          target,
          blocked: !access.block.blocked,
          revision: access.block.revision,
        }),
      );
      if (signal.aborted) return;
      window.dispatchEvent(
        new CustomEvent('0xdmme-public-block', {
          detail: { target, blocked: saved.blocked },
        }),
      );
      await access.changed();
    },
    error,
  );
  block.prepend(communityIcon('block'));
  if (!access.block.blocked) block.classList.add('post-menu-danger');
  const form = document.createElement('details'),
    heading = document.createElement('summary');
  form.className = 'post-report';
  heading.textContent = t('Denunciar usuário');
  heading.prepend(communityIcon('flag'));
  form.append(heading);
  content.append(form);
  const label = document.createElement('label'),
    reason = document.createElement('textarea');
  reason.maxLength = 1000;
  label.textContent = t('Motivo da denúncia');
  label.append(reason);
  form.append(label);
  const record = crypto.randomUUID(),
    status = document.createElement('p');
  status.setAttribute('role', 'status');
  form.append(status);
  button(
    form,
    t('Guardar denúncia'),
    async () => {
      const result = object(
        await controller.perform('public-report', {
          record,
          target,
          kind: 'profile',
          reason: reason.value,
        }),
      );
      keys(result, ['saved']);
      if (result['saved'] !== true) throw new Error('Denúncia não confirmada.');
      if (!signal.aborted)
        status.textContent = t('Denúncia guardada no backend do app.');
    },
    error,
  );
}
