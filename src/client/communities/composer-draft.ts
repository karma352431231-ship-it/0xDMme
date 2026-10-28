import { t } from '../../shared/i18n/index.ts';
const attachedMedia =
  '.media-picker-previews:not([hidden]) > *, .community-media-preview';
export function hasPostDraft(container: HTMLElement): boolean {
  if (
    container.querySelector(
      `.post-tag-chip-list button[aria-pressed="true"], ${attachedMedia}`,
    )
  )
    return true;
  return [
    ...container.querySelectorAll<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >('input,textarea,select'),
  ].some((input) =>
    input instanceof HTMLInputElement && input.type === 'file'
      ? Boolean(input.files?.length)
      : input.value.length > 0,
  );
}
/** A reply needs words or media; whitespace alone is not publishable. */
function hasReplyContent(container: HTMLElement): boolean {
  if (container.querySelector(attachedMedia)) return true;
  return Boolean(container.querySelector('textarea')?.value.trim());
}
/**
 * Both reply composers check content before the request. An empty reply is
 * explained next to its field (marked invalid, described and focused) instead
 * of surfacing the server's rejection; typing clears the explanation.
 */
export function requireReplyContent(
  container: HTMLElement,
  feedback: HTMLElement,
  signal: AbortSignal,
): boolean {
  if (hasReplyContent(container)) return true;
  feedback.textContent = t('Write a reply or add media before publishing.');
  const text = container.querySelector('textarea');
  if (!text) return false;
  feedback.id ||= `reply-feedback-${crypto.randomUUID()}`;
  text.setAttribute('aria-invalid', 'true');
  text.setAttribute('aria-describedby', feedback.id);
  text.addEventListener(
    'input',
    () => {
      text.removeAttribute('aria-invalid');
      text.removeAttribute('aria-describedby');
      feedback.textContent = '';
    },
    { once: true, signal },
  );
  text.focus();
  return false;
}
/** Both public composers use the same explicit discard choice and focus restoration. */
export function confirmComposerDiscard(
  dialog: HTMLDialogElement,
  options: { draft: HTMLElement; label: string; close: () => void },
): void {
  if (dialog.querySelector('.post-discard-confirmation')) return;
  const section = document.createElement('section');
  section.className = 'post-discard-confirmation';
  section.setAttribute('role', 'alertdialog');
  section.setAttribute('aria-label', options.label);
  const heading = document.createElement('h3'),
    copy = document.createElement('p'),
    keep = document.createElement('button'),
    discard = document.createElement('button');
  heading.textContent = options.label;
  copy.textContent = t('Your text and selected attachments will be lost.');
  keep.type = discard.type = 'button';
  keep.textContent = t('Keep editing');
  discard.textContent = t('Discard');
  const content = [...dialog.children].filter(
    (node): node is HTMLElement => node instanceof HTMLElement,
  );
  content.forEach((node) => {
    node.inert = true;
  });
  keep.addEventListener('click', () => {
    section.remove();
    content.forEach((node) => {
      node.inert = false;
    });
    options.draft.querySelector<HTMLElement>('textarea,input')?.focus();
  });
  discard.addEventListener('click', options.close);
  section.append(heading, copy, keep, discard);
  dialog.append(section);
  keep.focus();
}
