import { t, translatedError } from '../../shared/i18n/index.ts';
import { gifUrls } from '../gif-search/index.ts';
import type {
  CommunityPost,
  PostState,
} from '../../shared/community-posts/index.ts';
import type { PostEditorAccess } from './post-editor-media.ts';
import type { Communities } from './controller.ts';
import {
  communityElement as el,
  communityButton as button,
} from './elements.ts';
import { postHeader } from './presentation.ts';
import { postPreviewText } from './post-preview.ts';
import { postText } from './post-text.ts';
import { replyForm } from './post-forms.ts';
import { submitPostReply } from './post-interactions.ts';
import {
  showPublicAvatar,
  showPublicPostMedia,
} from '../public-media/index.ts';
import { hasPostDraft, confirmComposerDiscard } from './composer-draft.ts';
import { bindComposerBackdrop } from './composer-backdrop.ts';
import { showPostExternalMedia } from './post-external-media.ts';

export interface ReplyActions {
  controller: Pick<Communities, 'request'>;
  run: (work: () => Promise<void>) => Promise<void>;
  valid: () => boolean;
  canReply: () => Promise<boolean>;
  media: PostEditorAccess;
  replied: (state: PostState) => Promise<void>;
}
/** The clicked post is always the immediate parent, including a reply in the feed. */
export class ReplyComposer {
  private readonly parent: CommunityPost;
  private readonly access: ReplyActions;
  private readonly trigger: HTMLButtonElement;
  private readonly dialog = el(
    'dialog',
    '',
    'community-scope post-composer-dialog reply-box',
  );
  private readonly draft = el('div', '', 'post-composer-content');
  private readonly feedback = el('p', '', 'community-feedback');
  private readonly abort = new AbortController();
  private readonly id = crypto.randomUUID();
  private busy = false;
  private closed = false;
  constructor(
    parent: CommunityPost,
    access: ReplyActions,
    trigger: HTMLButtonElement,
  ) {
    this.parent = parent;
    this.access = access;
    this.trigger = trigger;
  }
  open(toolbar: HTMLElement): void {
    if (!this.access.valid() || this.access.media.signal.aborted) return;
    const heading = el('header', '', 'post-composer-heading'),
      copy = el('div', '', 'post-composer-heading-copy');
    copy.append(el('h2', t('Reply')), el('p', t('Continue the conversation.')));
    heading.append(copy);
    button(heading, t('Close'), () => {
      this.requestClose();
      return Promise.resolve();
    });
    this.dialog.setAttribute('aria-label', t('Reply to post'));
    this.feedback.setAttribute('role', 'status');
    this.dialog.append(heading, this.context(), this.draft, this.feedback);
    const signal = AbortSignal.any([
      this.abort.signal,
      this.access.media.signal,
    ]);
    const content = replyForm(
      this.draft,
      { title: '', text: '', tags: [] },
      {
        ...this.access.media,
        signal,
        valid: () => !this.closed && this.access.valid(),
      },
    );
    const text = this.draft.querySelector('textarea');
    if (text) text.placeholder = t('Write your reply…');
    const footer = el('footer', '', 'post-composer-footer');
    this.draft.append(footer);
    button(footer, t('Publish reply'), () => this.publish(content)).className =
      'post-composer-publish';
    this.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.requestClose();
    });
    this.dialog.addEventListener('close', () => this.close());
    bindComposerBackdrop(this.dialog, {
      signal: this.abort.signal,
      requestClose: () => this.requestClose(),
    });
    this.access.media.signal.addEventListener('abort', () => this.close(), {
      once: true,
      signal: this.abort.signal,
    });
    window.addEventListener(
      'beforeunload',
      (event) => {
        if (!hasPostDraft(this.draft)) return;
        event.preventDefault();
        event.returnValue = '';
      },
      { signal: this.abort.signal },
    );
    toolbar.after(this.dialog);
    this.dialog.showModal();
    this.trigger.setAttribute('aria-expanded', 'true');
    text?.focus();
  }
  private context(): HTMLElement {
    const context = el('section', '', 'reply-parent-preview');
    context.setAttribute('aria-label', t('The post you are replying to'));
    const avatar = postHeader(
      context,
      this.parent,
      { id: this.parent.community, name: '' },
      'community',
    );
    const signal = AbortSignal.any([
      this.abort.signal,
      this.access.media.signal,
    ]);
    if (this.parent.author?.avatar)
      showPublicAvatar(avatar, {
        kind: 'avatar',
        target: this.parent.author.id,
        reference: this.parent.author.avatar,
        signal,
      });
    if (this.parent.title) context.append(el('h3', this.parent.title));
    const preview = postPreviewText(this.parent.text);
    if (preview)
      context.append(
        postText(
          preview + (preview === this.parent.text ? '' : '…'),
          gifUrls(this.parent.text),
        ),
      );
    if (this.parent.media?.length)
      showPublicPostMedia(context, this.parent.media, signal);
    if (this.access.media.privacy)
      showPostExternalMedia(context, this.parent.text, {
        privacy: this.access.media.privacy,
        signal,
      });
    return context;
  }
  private async publish(
    content: () => Promise<
      import('../../shared/community-posts/index.ts').PostContent
    >,
  ): Promise<void> {
    if (this.busy || this.closed || !this.access.valid()) return;
    this.busy = true;
    this.feedback.textContent = '';
    const controls = [
        ...this.dialog.querySelectorAll<
          HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
        >('button,input,textarea'),
      ],
      previous = controls.map((node) => node.disabled);
    controls.forEach((node) => {
      node.disabled = true;
    });
    try {
      await this.access.run(async () => {
        try {
          if (!(await this.access.canReply()))
            throw new Error('Replies unavailable for your membership.');
          const state = await submitPostReply(
            this.parent,
            { id: this.id, content },
            {
              ...this.access,
              valid: () => !this.closed && this.access.valid(),
            },
          );
          if (!state) return;
          this.close();
          await this.access.replied(state);
        } catch (error: unknown) {
          this.feedback.textContent =
            error instanceof Error
              ? translatedError(error.message)
              : t('Could not publish the reply.');
          throw error;
        }
      });
    } finally {
      this.busy = false;
      controls.forEach((node, index) => {
        node.disabled = previous[index]!;
      });
    }
  }
  private requestClose(): void {
    if (this.busy) return;
    if (!hasPostDraft(this.draft)) {
      this.close();
      return;
    }
    confirmComposerDiscard(this.dialog, {
      draft: this.draft,
      label: t('Discard reply?'),
      close: () => this.close(),
    });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.abort.abort();
    this.dialog.close();
    this.dialog.remove();
    this.trigger.setAttribute('aria-expanded', 'false');
    if (this.trigger.isConnected) this.trigger.focus({ preventScroll: true });
  }
  get active(): boolean {
    return !this.closed && this.dialog.open;
  }
}
