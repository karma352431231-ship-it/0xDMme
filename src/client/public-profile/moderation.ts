import { t, currentLanguage } from '../../shared/i18n/index.ts';
// SPDX-License-Identifier: GPL-3.0-only
import type {
  PublicModerationNotice,
  PublicModerationStatus,
} from '../../shared/public-moderation/index.ts';

const labels: Record<PublicModerationStatus, string> = {
  pending: t('Awaiting analysis. The file remains restricted.'),
  analyzing: t('Analysis in progress. The file remains restricted.'),
  approved: t('Analysis completed: content allowed.'),
  rejected: t(
    'Analysis rejected this file because it detected explicit content.',
  ),
  held: t(
    'Analysis uncertain. The file remains restricted and can be appealed.',
  ),
  failed: t('Could not complete analysis. The file remains restricted.'),
  discarding: t('Deadline passed. The file is being discarded.'),
  expired: t('The unapproved file was discarded at the deadline.'),
  removed: t('Analysis ended due to replacement, removal or a rule update.'),
};
const kinds = {
  avatar: t('Profile photo'),
  'profile-banner': t('Profile banner'),
  'community-photo': t('Community photo'),
  'community-banner': t('Community banner'),
  'post-media': t('Post or reply media'),
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
        'Warning recorded: your video was removed from public view for inappropriate content.',
      );
      article.append(warning);
    }
    if (notice.appeal) {
      const appeal = document.createElement('p');
      appeal.textContent = t('Appeal: {0}', [notice.appeal]);
      article.append(appeal);
    }
    if (notice.decision) {
      const decision = document.createElement('p');
      decision.textContent = t('Revision: {0}', [notice.decision]);
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
            'Without approval by {0}, the video stops being public and the file will be discarded.',
            [date],
          )
        : t('Without approval, the file will be discarded by {0}.', [date]);
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
    return t('Video uploaded. Background analysis pending.');
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
  label.textContent = t('Explain why this file follows the public rules');
  input.required = true;
  input.maxLength = 2_000;
  input.disabled = options.busy;
  label.append(input);
  button.type = 'submit';
  button.textContent = t('Appeal analysis');
  button.disabled = options.busy;
  form.append(label, button);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!options.busy && form.reportValidity())
      options.appeal(notice.id, input.value);
  });
  return form;
}
