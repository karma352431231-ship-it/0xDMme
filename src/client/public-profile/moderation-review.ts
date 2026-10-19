import {
  t,
  translatedError,
  currentLanguage,
} from '../../shared/i18n/index.ts';
import { renderMentions } from '../public-mentions/index.ts';
import { uuid } from '../../shared/account/index.ts';
import { publicModerationPolicy } from '../../shared/public-moderation/index.ts';
import { publicModerationDetails } from '../../shared/moderation-details/index.ts';
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
import type { PublicProfiles } from './controller.ts';
import { renderModeration } from './moderation.ts';
import { showModerationImage } from './moderation-image.ts';

type MediaPreview = (
  host: HTMLElement,
  detail: PublicModerationDetails,
  signal: AbortSignal,
) => void;
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = '',
  className = '',
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (tag === 'h2' || className.includes('moderation-post-text'))
    renderMentions(node, text);
  else node.textContent = text;
  node.className = className;
  return node;
}
function postIdentity(detail: PublicModerationDetails): HTMLElement | null {
  const post = detail.post;
  if (!post)
    return detail.notice.kind === 'post-media'
      ? el(
          'p',
          t(
            'This file is no longer linked to an available post. The analysis record remains below.',
          ),
        )
      : null;
  const section = el('section', '', 'moderation-subject');
  section.append(
    el(
      'small',
      t('{0} in {1}', [
        post.reply ? t('Reply') : t('Post'),
        post.communityName,
      ]),
    ),
  );
  section.append(
    el(
      'h2',
      post.title ||
        (post.reply ? t('Reply in the discussion') : t('Post with media')),
    ),
  );
  if (post.deleted)
    section.append(
      el('p', t('The post was deleted. Its previous content is not retained.')),
    );
  else if (post.text)
    section.append(el('p', post.text, 'community-text moderation-post-text'));
  const link = el('a', t('Open the discussion'));
  link.href = `#communities?id=${post.community}&post=${post.id}`;
  section.append(link);
  return section;
}
function analysisFacts(detail: PublicModerationDetails): HTMLElement {
  const facts = el('section', '', 'moderation-facts');
  const results = {
    allow: t('Allowed'),
    reject: t('Explicit content detected'),
    hold: t('Uncertain result'),
  };
  facts.append(
    el('h2', t('Analysis result')),
    el(
      'p',
      detail.notice.unreviewed
        ? t('community.publication.unreviewed')
        : detail.automaticVerdict
          ? results[detail.automaticVerdict]
          : t('Automated analysis was not completed.'),
    ),
  );
  if (detail.frames !== null)
    facts.append(
      el(
        'p',
        t('{0} {1}.', [
          detail.frames.toLocaleString(currentLanguage()),
          detail.frames === 1 ? t('analyzed frame') : t('analyzed frames'),
        ]),
      ),
    );
  facts.append(
    el(
      'p',
      t('Sent on {0}.', [
        new Date(detail.notice.createdAt).toLocaleString(currentLanguage()),
      ]),
    ),
  );
  facts.append(
    el(
      'p',
      t(
        'The assessment applies to the media identified on this page. An appeal requests a review of this result.',
      ),
    ),
  );
  if (detail.policy !== publicModerationPolicy)
    facts.append(
      el(
        'p',
        t(
          'This record uses an earlier policy version. The review follows the current public rules.',
        ),
      ),
    );
  facts.append(
    el('small', t('File: {0}', [detail.notice.target])),
    el('small', t('Analysis: {0}', [detail.notice.id])),
  );
  return facts;
}
function showFailure(
  container: HTMLElement,
  error: unknown,
  retry: () => void,
): void {
  const status = el(
    'p',
    error instanceof Error
      ? translatedError(error.message)
      : t('Analysis unavailable.'),
    'moderation-feedback',
  );
  status.setAttribute('role', 'alert');
  const back = el('a', t('Back to Activity'));
  back.href = '#activity';
  const button = el('button', t('Try again'));
  button.type = 'button';
  button.addEventListener('click', retry);
  container.replaceChildren(back, status, button);
}
/** A dedicated owner-only route: no notices list or settings tab is used as its destination. */
export function startModerationReview(
  controller: PublicProfiles,
  preview: MediaPreview,
) {
  let host: HTMLElement | null = null;
  let id: string | null = null;
  let detail: PublicModerationDetails | null = null;
  let abort = new AbortController();
  let busy = false;
  let generation = 0;
  const hasDraft = () =>
    Boolean(host?.querySelector<HTMLTextAreaElement>('textarea')?.value);
  function feedback(text: string): void {
    const node = host?.querySelector('[data-review-feedback]');
    if (node) node.textContent = text;
  }
  function disable(value: boolean): void {
    host
      ?.querySelectorAll<HTMLButtonElement | HTMLTextAreaElement>(
        'button,textarea',
      )
      .forEach((node) => {
        node.disabled = value;
      });
  }
  async function appeal(reason: string): Promise<void> {
    if (!detail || busy) return;
    const current = generation;
    busy = true;
    disable(true);
    feedback(t('Recording appeal…'));
    try {
      const result = await controller.perform('moderation-appeal', {
        id: detail.notice.id,
        reason,
      });
      if (current !== generation) return;
      detail = publicModerationDetails({ ...detail, notice: result });
      renderOutcome();
      feedback(t('Appeal recorded for exceptional review.'));
    } catch (error: unknown) {
      if (current === generation)
        feedback(
          error instanceof Error
            ? translatedError(error.message)
            : t('Could not record the appeal.'),
        );
    } finally {
      if (current === generation) {
        busy = false;
        disable(false);
      }
    }
  }
  function renderOutcome(): void {
    const outcome = host?.querySelector<HTMLElement>('[data-review-outcome]');
    if (!detail) return;
    renderModeration(outcome ?? null, {
      notices: [detail.notice],
      busy: false,
      appeal: (_id, reason) => {
        void appeal(reason);
      },
    });
  }
  function render(value: PublicModerationDetails): void {
    if (!host) return;
    abort.abort();
    abort = new AbortController();
    const back = el('a', t('← Back to Activity'), 'moderation-back');
    back.href = '#activity';
    const card = el('article', '', 'moderation-review-card');
    card.append(
      el('h1', t('Content analysis')),
      el(
        'p',
        t('This page is restricted to your account.'),
        'moderation-private',
      ),
    );
    const identity = postIdentity(value);
    if (identity) card.append(identity);
    if (value.notice.kind !== 'post-media')
      showModerationImage(card, value.notice, {
        controller,
        signal: abort.signal,
      });
    if (
      value.post &&
      !value.post.deleted &&
      Date.parse(value.notice.expiresAt) > Date.now()
    )
      preview(card, value, abort.signal);
    card.append(analysisFacts(value));
    const outcome = el('section', '', 'moderation-outcome');
    outcome.dataset['reviewOutcome'] = '';
    const status = el('p', '', 'moderation-feedback');
    status.dataset['reviewFeedback'] = '';
    status.setAttribute('role', 'status');
    card.append(outcome, status);
    host.replaceChildren(back, card);
    renderOutcome();
  }
  async function ready(): Promise<void> {
    const container = host;
    if (!container || !id || busy || hasDraft()) return;
    const current = generation;
    busy = true;
    try {
      const value = publicModerationDetails(
        await controller.perform('moderation-details', { id }),
      );
      if (current !== generation) return;
      detail = value;
      render(value);
    } catch (error: unknown) {
      if (current === generation) {
        detail = null;
        showFailure(container, error, () => {
          void ready();
        });
      }
    } finally {
      if (current === generation) busy = false;
    }
  }
  function leave(): void {
    generation++;
    abort.abort();
    host?.replaceChildren();
    host = null;
    id = null;
    detail = null;
    busy = false;
  }
  function mount(container: HTMLElement, value: unknown): void {
    leave();
    host = container;
    abort = new AbortController();
    host.className = 'moderation-review';
    const status = el('p', t('Loading your analysis…'), 'moderation-feedback');
    status.dataset['reviewFeedback'] = '';
    status.setAttribute('role', 'status');
    const back = el('a', t('← Back to Activity'));
    back.href = '#activity';
    host.replaceChildren(back, status);
    try {
      id = uuid(value);
      void ready();
    } catch {
      feedback(t('Invalid analysis identifier.'));
    }
  }
  return {
    mount,
    leave,
    ready,
    sessionChanged(): void {
      const container = host;
      const selected = id;
      if (container) mount(container, selected);
    },
    canActivate: () => !busy && !hasDraft(),
  };
}
