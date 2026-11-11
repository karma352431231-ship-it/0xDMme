import type { SubmittedMedia } from './attachment-submissions.ts';
import { t } from '../../shared/i18n/index.ts';
import type { AttachmentUi } from '../attachment-ui/index.ts';
import { messageTime } from '../message-presentation/index.ts';
import { messageChecks, checksIcon } from '../message-status/index.ts';
import { uploadRing } from '../upload-progress/index.ts';

/** Presentation only. The submission owns metadata/state, AttachmentUi owns
 * preview URLs and per-row abort cleanup, and the outbox owns ciphertext. */
export function submittedMediaRows(input: {
  drafts: readonly SubmittedMedia[];
  shown: ReadonlySet<string>;
  attachments: Pick<AttachmentUi, 'render'>;
  load: (
    row: SubmittedMedia,
    thumbnail: boolean,
    signal: AbortSignal,
  ) => Promise<Uint8Array<ArrayBuffer>>;
  retry: () => void;
}) {
  return input.drafts
    .filter((draft) => !input.shown.has(draft.id))
    .map((draft) => ({
      id: draft.id,
      key: JSON.stringify(['submitted-media', draft.id, draft.content]),
      sentAt: draft.createdAt,
      render: (signal: AbortSignal) => bubble({ ...input, draft, signal }),
    }));
}
function bubble(
  input: Parameters<typeof submittedMediaRows>[0] & {
    draft: SubmittedMedia;
    signal: AbortSignal;
  },
): HTMLElement {
  const { draft, signal } = input;
  const article = document.createElement('article');
  article.className = 'chat-message own';
  article.dataset['message'] = draft.id;
  article.dataset['outgoingMedia'] = draft.id;
  article.setAttribute('aria-label', t('Message sent by you'));
  if (draft.content)
    input.attachments.render({
      article,
      signal,
      content: draft.content,
      view: { id: draft.id, peer: draft.peer, text: '' },
      load: (_view, thumbnail) => input.load(draft, thumbnail, signal),
      run: (work) => work(),
    });
  else {
    const label = document.createElement('p');
    label.textContent = draft.viewOnce
      ? t('View-once message')
      : t('upload.processing');
    article.append(label);
  }
  article.append(metadata(draft, input.retry));
  return article;
}
/** Keep the preview and its abort/resource lifetime stable during progress. */
export function updateSubmittedMediaStates(
  history: HTMLElement,
  drafts: readonly SubmittedMedia[],
  retry: () => void,
): void {
  const states = new Map(drafts.map((draft) => [draft.id, draft]));
  for (const row of history.querySelectorAll<HTMLElement>(
    '[data-outgoing-media]',
  )) {
    const draft = states.get(row.dataset['outgoingMedia'] ?? '');
    if (draft)
      row.querySelector('.message-meta')?.replaceWith(metadata(draft, retry));
  }
}
function metadata(draft: SubmittedMedia, retry: () => void): HTMLElement {
  const meta = document.createElement('small');
  meta.className = 'message-meta';
  const time = messageTime(draft.createdAt);
  if (time) meta.append(time);
  if (draft.phase === 'accepted')
    meta.append(
      checksIcon(
        messageChecks({ own: true, delivery: 'accepted', read: false })!,
      ),
    );
  else if (draft.phase === 'failed') {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '✕';
    button.setAttribute('aria-label', t('chat.retry-send'));
    button.addEventListener('click', retry);
    meta.append(button);
  } else {
    const progress = uploadRing();
    progress.set(draft.progress);
    meta.append(progress.element);
  }
  return meta;
}
