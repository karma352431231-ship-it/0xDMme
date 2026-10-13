import { renderMentions } from '../public-mentions/index.ts';
import { uuid } from '../../shared/account/index.ts';
import { publicModerationPolicy } from '../../shared/public-moderation/index.ts';
import { publicModerationDetails } from '../../shared/moderation-details/index.ts';
import type { PublicModerationDetails } from '../../shared/moderation-details/index.ts';
import type { PublicProfiles } from './controller.ts';
import { renderModeration } from './moderation.ts';

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
function postIdentity(detail: PublicModerationDetails): HTMLElement {
  const section = el('section', '', 'moderation-subject');
  const post = detail.post;
  if (!post) {
    section.append(
      el('h2', 'Conteúdo analisado'),
      el(
        'p',
        detail.notice.kind === 'post-media'
          ? 'Este arquivo não está mais vinculado a uma postagem disponível. O registro da análise permanece abaixo.'
          : 'Arquivo do perfil ou da comunidade identificado pelo registro abaixo.',
      ),
    );
    return section;
  }
  section.append(
    el(
      'small',
      `${post.reply ? 'Resposta' : 'Postagem'} em ${post.communityName}`,
    ),
  );
  section.append(
    el(
      'h2',
      post.title ||
        (post.reply ? 'Resposta na discussão' : 'Postagem com mídia'),
    ),
  );
  if (post.deleted)
    section.append(
      el(
        'p',
        'A postagem foi excluída. Seu conteúdo anterior não é conservado.',
      ),
    );
  else if (post.text)
    section.append(el('p', post.text, 'community-text moderation-post-text'));
  const link = el('a', 'Abrir a discussão');
  link.href = `#comunidades?id=${post.community}&post=${post.id}`;
  section.append(link);
  return section;
}
function analysisFacts(detail: PublicModerationDetails): HTMLElement {
  const facts = el('section', '', 'moderation-facts');
  const results = {
    allow: 'Permitido',
    reject: 'Indicação de conteúdo explícito',
    hold: 'Resultado incerto',
  };
  facts.append(
    el('h2', 'Resultado da análise'),
    el(
      'p',
      detail.automaticVerdict
        ? results[detail.automaticVerdict]
        : 'A análise automática não foi concluída.',
    ),
  );
  if (detail.frames !== null)
    facts.append(
      el(
        'p',
        `${detail.frames.toLocaleString('pt-BR')} ${detail.frames === 1 ? 'quadro analisado' : 'quadros analisados'}.`,
      ),
    );
  facts.append(
    el(
      'p',
      `Enviado em ${new Date(detail.notice.createdAt).toLocaleString('pt-BR')}.`,
    ),
  );
  facts.append(
    el(
      'p',
      'A avaliação se aplica à mídia identificada nesta página. Uma contestação permite solicitar a revisão desse resultado.',
    ),
  );
  if (detail.policy !== publicModerationPolicy)
    facts.append(
      el(
        'p',
        'Este registro usa uma versão anterior da política. A revisão considera as regras públicas atuais.',
      ),
    );
  facts.append(
    el('small', `Arquivo: ${detail.notice.target}`),
    el('small', `Análise: ${detail.notice.id}`),
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
    error instanceof Error ? error.message : 'Análise indisponível.',
    'moderation-feedback',
  );
  status.setAttribute('role', 'alert');
  const back = el('a', 'Voltar à Atividade');
  back.href = '#atividade';
  const button = el('button', 'Tentar novamente');
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
    feedback('Registrando contestação…');
    try {
      const result = await controller.perform('moderation-appeal', {
        id: detail.notice.id,
        reason,
      });
      if (current !== generation) return;
      detail = publicModerationDetails({ ...detail, notice: result });
      renderOutcome();
      feedback('Contestação registrada para revisão excepcional.');
    } catch (error: unknown) {
      if (current === generation)
        feedback(
          error instanceof Error
            ? error.message
            : 'Não foi possível registrar a contestação.',
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
    const back = el('a', '← Voltar à Atividade', 'moderation-back');
    back.href = '#atividade';
    const card = el('article', '', 'moderation-review-card');
    card.append(
      el('h1', 'Análise do conteúdo'),
      el('p', 'Esta página é restrita à sua conta.', 'moderation-private'),
    );
    card.append(postIdentity(value));
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
    const status = el('p', 'Carregando sua análise…', 'moderation-feedback');
    status.dataset['reviewFeedback'] = '';
    status.setAttribute('role', 'status');
    const back = el('a', '← Voltar à Atividade');
    back.href = '#atividade';
    host.replaceChildren(back, status);
    try {
      id = uuid(value);
      void ready();
    } catch {
      feedback('Identificador de análise inválido.');
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
