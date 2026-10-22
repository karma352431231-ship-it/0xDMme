import type { PublicActionAccess } from '../public-action-guidance/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import { hasPostDraft, confirmComposerDiscard } from './composer-draft.ts';
import { bindComposerBackdrop } from './composer-backdrop.ts';
export { hasPostDraft } from './composer-draft.ts';
import { postState, tagPage } from '../../shared/community-posts/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { showToast } from '../toast/index.ts';
import { communityRead, type Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { composerCommunityIdentity } from './post-composer-community.ts';
import { postForm } from './post-forms.ts';

/** One composer owns its draft and abort lifecycle, independent of the feed. */
export class PostComposer {
  private dialog: HTMLDialogElement | null = null;
  private abort = new AbortController();
  private stage = new AbortController();
  private busy = false;
  private opening: AbortController | null = null;
  private readonly disabledNodes = new Map<HTMLElement, boolean>();
  private draft: HTMLElement | null = null;
  private feedback: HTMLElement | null = null;
  private readonly controller: Communities;
  private readonly privacy: ExternalMediaConsent;
  private readonly participation: PublicActionAccess;
  constructor(
    controller: Communities,
    privacy: ExternalMediaConsent,
    participation: PublicActionAccess,
  ) {
    this.controller = controller;
    this.privacy = privacy;
    this.participation = participation;
  }
  bind(): void {
    document.addEventListener('click', (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[data-community-compose]')
      )
        return;
      event.preventDefault();
      this.open();
    });
  }

  open(community?: string): void {
    if (this.dialog || this.busy || this.opening) return;
    const opening = new AbortController();
    this.opening = opening;
    const pending = { once: true, signal: opening.signal };
    window.addEventListener('hashchange', () => opening.abort(), pending);
    window.addEventListener('popstate', () => opening.abort(), pending);
    window.addEventListener('pagehide', () => opening.abort(), pending);
    void this.participation
      .allow('post', opening.signal)
      .then((allowed) => {
        if (allowed && !opening.signal.aborted) this.show(community);
      })
      .catch((error: unknown) => {
        if (!opening.signal.aborted)
          showToast(
            error instanceof Error
              ? translatedError(error.message)
              : t('Post unavailable.'),
          );
      })
      .finally(() => {
        opening.abort();
        if (this.opening === opening) this.opening = null;
      });
  }

  private show(community?: string): void {
    this.abort = new AbortController();
    const dialog = el('dialog', '', 'community-scope post-composer-dialog');
    this.dialog = dialog;
    const header = el('header', '', 'post-composer-heading');
    const heading = el('div', '', 'post-composer-heading-copy');
    heading.append(
      el('h2', t('Create post')),
      el('p', t('Share with a community.')),
    );
    header.append(heading);
    button(header, t('Close'), () => {
      this.requestClose();
      return Promise.resolve();
    });
    this.feedback = el('p', '', 'community-feedback');
    this.feedback.setAttribute('role', 'status');
    this.draft = el('div', '', 'post-composer-content');
    dialog.setAttribute('aria-label', t('Create post'));
    dialog.append(header, this.feedback, this.draft);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.requestClose();
    });
    bindComposerBackdrop(dialog, {
      signal: this.abort.signal,
      requestClose: () => this.requestClose(),
    });
    window.addEventListener(
      'beforeunload',
      (event) => {
        if (this.draft && hasPostDraft(this.draft)) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      { signal: this.abort.signal },
    );
    document.body.append(dialog);
    dialog.showModal();
    void this.run(() =>
      community ? this.compose(community) : this.choose(null),
    );
  }
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    const current = this.dialog;
    this.busy = true;
    this.disable(true);
    this.feedback?.classList.remove('is-error');
    try {
      await work();
    } catch (error: unknown) {
      if (current === this.dialog && this.feedback) {
        this.feedback.classList.add('is-error');
        this.feedback.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Post unavailable.');
      }
    } finally {
      this.busy = false;
      if (current === this.dialog) this.disable(false);
    }
  }
  private disable(value: boolean): void {
    this.dialog
      ?.querySelectorAll<
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement
      >('button,input,textarea,select')
      .forEach((node) => {
        if (value) {
          this.disabledNodes.set(node, node.disabled);
          node.disabled = true;
        } else if (this.disabledNodes.has(node)) {
          node.disabled = this.disabledNodes.get(node)!;
        }
      });
    if (!value) this.disabledNodes.clear();
  }
  private async choose(after: string | null): Promise<void> {
    const lifetime = this.abort;
    this.stage.abort();
    this.stage = new AbortController();
    const page = await this.controller.list('following', after);
    if (lifetime.signal.aborted || !this.draft) return;
    this.draft.replaceChildren(el('h3', t('Your followed communities')));
    for (const group of page.items) this.choice(group);
    if (!page.items.length)
      this.draft.append(
        el('p', t('Follow a community in Explore to find it here.')),
      );
    if (page.next)
      button(this.draft, t('More communities'), () =>
        this.run(() => this.choose(page.next)),
      );
  }
  private choice(group: Community): void {
    if (!this.draft) return;
    const pick = button(this.draft, '', () =>
      this.run(() => this.compose(group.id)),
    );
    pick.className = 'post-composer-community';
    pick.append(
      composerCommunityIdentity(
        group,
        AbortSignal.any([this.abort.signal, this.stage.signal]),
      ),
    );
    pick.append(el('span', '›', 'post-composer-choice-arrow'));
    pick.setAttribute('aria-label', group.name);
    if (group.archived) {
      pick.disabled = true;
      pick.dataset['archived'] = 'true';
    }
  }
  private signal(): AbortSignal {
    return AbortSignal.any([this.abort.signal, AbortSignal.timeout(8000)]);
  }
  private async compose(id: string): Promise<void> {
    const lifetime = this.abort;
    const state = await this.controller.state(id);
    if (lifetime.signal.aborted) return;
    if (!state.canPost)
      throw new Error(
        'You cannot post in this community. Check whether it is archived or your participation is restricted.',
      );
    const tags = tagPage(
      await communityRead(`/api/communities/${id}/tags`, this.signal()),
    );
    if (lifetime.signal.aborted || !this.draft) return;
    this.stage.abort();
    this.stage = new AbortController();
    const selected = el('div', '', 'post-composer-selected');
    selected.append(
      composerCommunityIdentity(
        state.community,
        AbortSignal.any([lifetime.signal, this.stage.signal]),
      ),
    );
    this.draft.replaceChildren(selected);
    const content = postForm(
      this.draft,
      { title: '', text: '', tags: [] },
      {
        page: tags,
        run: (work) => this.run(work),
        load: async (after) =>
          tagPage(
            await communityRead(
              `/api/communities/${id}/tags${after ? '?after=' + encodeURIComponent(after) : ''}`,
              this.signal(),
            ),
          ),
      },
      {
        community: id,
        request: (operation, payload) =>
          this.controller.request(operation, payload),
        valid: () => !lifetime.signal.aborted,
        signal: lifetime.signal,
        privacy: this.privacy,
      },
    );
    const post = crypto.randomUUID();
    const footer = el('footer', '', 'post-composer-footer');
    this.draft.append(footer);
    const publish = button(footer, t('Publish post'), () =>
      this.run(async () => {
        const value = await content();
        postState(
          await this.controller.request('post-create', {
            id,
            post,
            content: value,
          }),
        );
        if (lifetime.signal.aborted) return;
        this.close();
        showToast(t('Post published.'), { success: true });
      }),
    );
    publish.className = 'post-composer-publish';
  }
  private requestClose(): void {
    if (this.busy || !this.dialog) return;
    if (!this.draft || !hasPostDraft(this.draft)) {
      this.close();
      return;
    }
    confirmComposerDiscard(this.dialog, {
      draft: this.draft,
      label: t('Discard post?'),
      close: () => this.close(),
    });
  }

  close(): void {
    this.opening?.abort();
    this.opening = null;
    this.abort.abort();
    this.stage.abort();
    this.dialog?.close();
    this.dialog?.remove();
    this.dialog = null;
    this.draft = null;
    this.feedback = null;
  }
  canActivate(): boolean {
    return this.dialog === null;
  }
}
