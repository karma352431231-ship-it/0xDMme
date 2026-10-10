// SPDX-License-Identifier: GPL-3.0-only
import type {
  PublicModerationNotice,
  PublicModerationStatus,
} from '../../shared/public-moderation/index.ts';

const labels: Record<PublicModerationStatus, string> = {
  pending: 'Aguardando análise. O arquivo continua restrito.',
  analyzing: 'Análise em andamento. O arquivo continua restrito.',
  approved: 'Análise concluída: conteúdo permitido.',
  rejected:
    'A análise recusou este arquivo por indicação de conteúdo explícito.',
  held: 'Análise incerta. O arquivo continua restrito e pode ser contestado.',
  failed: 'Não foi possível concluir a análise. O arquivo continua restrito.',
  discarding: 'Prazo encerrado. O arquivo está sendo descartado.',
  expired: 'O arquivo não aprovado foi descartado ao encerrar o prazo.',
  removed: 'Análise encerrada por troca, remoção ou atualização da regra.',
};
const kinds = {
  avatar: 'Foto do perfil',
  'profile-banner': 'Banner do perfil',
  'community-photo': 'Foto da comunidade',
  'post-media': 'Mídia de post ou resposta',
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
    status.textContent = labels[notice.status];
    article.append(title, status);
    if (notice.appeal) {
      const appeal = document.createElement('p');
      appeal.textContent = `Contestação: ${notice.appeal}`;
      article.append(appeal);
    }
    if (notice.decision) {
      const decision = document.createElement('p');
      decision.textContent = `Revisão: ${notice.decision}`;
      article.append(decision);
    }
    if (
      ['pending', 'analyzing', 'held', 'failed', 'rejected'].includes(
        notice.status,
      )
    ) {
      const deadline = document.createElement('p');
      deadline.textContent = `Sem aprovação, o arquivo será descartado até ${new Date(notice.expiresAt).toLocaleString('pt-BR')}.`;
      article.append(deadline);
    }
    if (canAppeal(notice)) article.append(appealForm(notice, options));
    container.append(article);
  }
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
  label.textContent = 'Explique por que este arquivo atende às regras públicas';
  input.required = true;
  input.maxLength = 2_000;
  input.disabled = options.busy;
  label.append(input);
  button.type = 'submit';
  button.textContent = 'Contestar análise';
  button.disabled = options.busy;
  form.append(label, button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!options.busy && form.reportValidity())
      options.appeal(notice.id, input.value);
  });
  return form;
}
