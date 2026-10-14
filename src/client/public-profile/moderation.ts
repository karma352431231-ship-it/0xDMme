import { t, currentLanguage } from '../../shared/i18n/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
import type {
  PublicModerationNotice,
  PublicModerationStatus,
} from '../../shared/public-moderation/index.ts';

const labels: Record<PublicModerationStatus, string> = {
  pending: t('Aguardando análise. O arquivo continua restrito.'),
  analyzing: t('Análise em andamento. O arquivo continua restrito.'),
  approved: t('Análise concluída: conteúdo permitido.'),
  rejected: t(
    'A análise recusou este arquivo por indicação de conteúdo explícito.',
  ),
  held: t(
    'Análise incerta. O arquivo continua restrito e pode ser contestado.',
  ),
  failed: t(
    'Não foi possível concluir a análise. O arquivo continua restrito.',
  ),
  discarding: t('Prazo encerrado. O arquivo está sendo descartado.'),
  expired: t('O arquivo não aprovado foi descartado ao encerrar o prazo.'),
  removed: t('Análise encerrada por troca, remoção ou atualização da regra.'),
};
const kinds = {
  avatar: t('Foto do perfil'),
  'profile-banner': t('Banner do perfil'),
  'community-photo': t('Foto da comunidade'),
  'community-banner': t('Banner da comunidade'),
  'post-media': t('Mídia de post ou resposta'),
};
export function renderModeration(
  container: HTMLElement | null,
  options: {
    notices: PublicModerationNotice[];
    busy: boolean;
    appeal: (id: string, reason: string) => void;
  },
): void {
  if (!container) return;
  container.replaceChildren();
  for (const notice of options.notices) {
    const article = document.createElement('article'),
      title = document.createElement('strong'),
      status = document.createElement('p');
    title.textContent = kinds[notice.kind];
    status.textContent = moderationLabel(notice);
    article.append(title, status);
    if (notice.warning) {
      const warning = document.createElement('p');
      warning.textContent = t(
        'Advertência registrada: seu vídeo foi removido do público por conteúdo impróprio.',
      );
      article.append(warning);
    }
    if (notice.appeal) {
      const appeal = document.createElement('p');
      appeal.textContent = t('Contestação: {0}', [notice.appeal]);
      article.append(appeal);
    }
    if (notice.decision) {
      const decision = document.createElement('p');
      decision.textContent = t('Revisão: {0}', [notice.decision]);
      article.append(decision);
    }
    if (
      ['pending', 'analyzing', 'held', 'failed', 'rejected'].includes(
        notice.status,
      )
    ) {
      const deadline = document.createElement('p');
      const date = new Date(notice.expiresAt).toLocaleString(currentLanguage());
      deadline.textContent = notice.afterPublication
        ? t(
            'Sem aprovação até {0}, o vídeo deixa de ficar público e o arquivo será descartado.',
            [date],
          )
        : t('Sem aprovação, o arquivo será descartado até {0}.', [date]);
      article.append(deadline);
    }
    if (canAppeal(notice)) article.append(appealForm(notice, options));
    container.append(article);
  }
}
function moderationLabel(notice: PublicModerationNotice): string {
  if (notice.unreviewed && notice.status === 'approved')
    return t('community.publication.unreviewed');
  if (
    notice.afterPublication &&
    ['pending', 'analyzing'].includes(notice.status)
  )
    return t('Vídeo enviado. Análise em segundo plano pendente.');
  return labels[notice.status];
}
function canAppeal(notice: PublicModerationNotice): boolean {
  return (
    ['held', 'failed', 'rejected'].includes(notice.status) &&
    notice.appeal === null &&
    Date.parse(notice.expiresAt) > Date.now()
  );
}
function appealForm(
  notice: PublicModerationNotice,
  options: {
    busy: boolean;
    appeal: (id: string, reason: string) => void;
  },
): HTMLFormElement {
  const form = document.createElement('form'),
    label = document.createElement('label'),
    input = document.createElement('textarea'),
    button = document.createElement('button');
  label.textContent = t(
    'Explique por que este arquivo atende às regras públicas',
  );
  input.required = true;
  input.maxLength = 2_000;
  input.disabled = options.busy;
  label.append(input);
  button.type = 'submit';
  button.textContent = t('Contestar análise');
  button.disabled = options.busy;
  form.append(label, button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!options.busy && form.reportValidity())
      options.appeal(notice.id, input.value);
  });
  return form;
}
