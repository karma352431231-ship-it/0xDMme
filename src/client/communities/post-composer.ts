import { communityPage } from '../../shared/communities/index.ts';
import { postState, tagPage } from '../../shared/community-posts/index.ts';
import type { Community } from '../../shared/communities/index.ts';
import type { ExternalMediaConsent } from '../external-media/index.ts';
import { showToast } from '../toast/index.ts';
import { communityRead, type Communities } from './controller.ts';
import {
  communityButton as button,
  communityElement as el,
} from './elements.ts';
import { postForm } from './post-forms.ts';

export function hasPostDraft(container: HTMLElement): boolean {
  if (
    container.querySelector(
      'button[aria-pressed="true"], .media-picker-previews:not([hidden]) > *, .community-media-preview',
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

/** One composer owns its draft and abort lifecycle, independent of the feed. */
export class PostComposer {
  private dialog: HTMLDialogElement | null = null;
  private abort = new AbortController();
  private busy = false;
  private readonly disabledNodes = new Map<HTMLElement, boolean>();
  private draft: HTMLElement | null = null;
  private feedback: HTMLElement | null = null;
  private readonly controller: Communities;
  private readonly privacy: ExternalMediaConsent;
  constructor(controller: Communities, privacy: ExternalMediaConsent) {
    this.controller = controller;
    this.privacy = privacy;
  }
  bind(signedIn: () => boolean): void {
    document.addEventListener('click', (event) => {
      if (
        !(event.target instanceof Element) ||
        !event.target.closest('[data-community-compose]')
      )
        return;
      event.preventDefault();
      if (signedIn()) this.open();
      else showToast('Entre pelo Perfil para criar uma postagem.');
    });
  }

  open(community?: string): void {
    if (this.dialog || this.busy) return;
    this.abort = new AbortController();
    const dialog = el('dialog', '', 'community-scope post-composer-dialog');
    this.dialog = dialog;
    const header = el('header', '', 'post-composer-heading');
    header.append(el('h2', 'Criar postagem'));
    button(header, 'Fechar', () => {
      this.requestClose();
      return Promise.resolve();
    });
    this.feedback = el('p', '', 'community-feedback');
    this.feedback.setAttribute('role', 'status');
    this.draft = el('div', '', 'post-composer-content');
    dialog.setAttribute('aria-label', 'Criar postagem');
    dialog.append(header, this.feedback, this.draft);
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      this.requestClose();
    });
    let outside = false;
    dialog.addEventListener('pointerdown', (event) => {
      outside = this.outside(event, dialog);
    });
    dialog.addEventListener('click', (event) => {
      if (outside && this.outside(event, dialog)) this.requestClose();
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
      community ? this.compose(community) : this.choose('following', null),
    );
  }
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    const current = this.dialog;
    this.busy = true;
    this.disable(true);
    try {
      await work();
    } catch (error: unknown) {
      if (current === this.dialog && this.feedback)
        this.feedback.textContent =
          error instanceof Error ? error.message : 'Postagem indisponível.';
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
  private async choose(
    kind: 'following' | 'all',
    after: string | null,
  ): Promise<void> {
    const lifetime = this.abort;
    const page =
      kind === 'following'
        ? await this.controller.list(kind, after)
        : communityPage(
            await communityRead(
              `/api/communities${after ? '?after=' + encodeURIComponent(after) : ''}`,
              this.signal(),
            ),
          );
    if (lifetime.signal.aborted || !this.draft) return;
    const tabs = el('nav', '', 'post-toolbar');
    for (const [key, label] of [
      ['following', 'Seguidas'],
      ['all', 'Todas as comunidades'],
    ] as const)
      button(tabs, label, () => this.run(() => this.choose(key, null)));
    this.draft.replaceChildren(el('h3', 'Escolha a comunidade'), tabs);
    for (const group of page.items) this.choice(group);
    if (!page.items.length)
      this.draft.append(
        el('p', 'Nenhuma comunidade nesta lista. Veja Todas as comunidades.'),
      );
    if (page.next)
      button(this.draft, 'Mais comunidades', () =>
        this.run(() => this.choose(kind, page.next)),
      );
  }
  private choice(group: Community): void {
    if (!this.draft) return;
    const pick = button(this.draft, group.name, () =>
      this.run(() => this.compose(group.id)),
    );
    pick.className = 'post-composer-community';
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
        'Você não pode postar nesta comunidade. Confira se ela está arquivada ou se há uma restrição à sua participação.',
      );
    const tags = tagPage(
      await communityRead(`/api/communities/${id}/tags`, this.signal()),
    );
    if (lifetime.signal.aborted || !this.draft) return;
    this.draft.replaceChildren(el('h3', state.community.name));
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
    button(this.draft, 'Publicar postagem', () =>
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
        showToast('Postagem publicada.');
      }),
    );
  }
  private outside(event: MouseEvent, dialog: HTMLDialogElement): boolean {
    const rect = dialog.getBoundingClientRect();
    return (
      event.target === dialog &&
      (event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom)
    );
  }
  private requestClose(): void {
    if (this.busy || !this.dialog) return;
    if (!this.draft || !hasPostDraft(this.draft)) {
      this.close();
      return;
    }
    if (this.dialog.querySelector('.post-discard-confirmation')) return;
    const confirmation = el('section', '', 'post-discard-confirmation');
    confirmation.setAttribute('role', 'alertdialog');
    confirmation.setAttribute('aria-label', 'Descartar postagem?');
    confirmation.append(
      el('h3', 'Descartar postagem?'),
      el('p', 'O que você escreveu e os anexos selecionados serão perdidos.'),
    );
    button(confirmation, 'Continuar editando', () => {
      confirmation.remove();
      this.dialog
        ?.querySelectorAll<HTMLElement>(
          ':scope > header, :scope > .post-composer-content',
        )
        .forEach((node) => {
          node.inert = false;
        });
      this.draft?.querySelector<HTMLElement>('input,textarea')?.focus();
      return Promise.resolve();
    }).focus();
    button(confirmation, 'Descartar', () => {
      this.close();
      return Promise.resolve();
    });
    this.dialog
      .querySelectorAll<HTMLElement>(
        ':scope > header, :scope > .post-composer-content',
      )
      .forEach((node) => {
        node.inert = true;
      });
    this.dialog.append(confirmation);
    confirmation.querySelector<HTMLButtonElement>('button')?.focus();
  }
  close(): void {
    this.abort.abort();
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
