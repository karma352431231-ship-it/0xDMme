import { t, currentLanguage } from '../../shared/i18n/index.ts';
import { mentionValue, mountMentionInput } from '../public-mentions/index.ts';
import { postEditorMedia } from './post-editor-media.ts';
import type { PostEditorAccess } from './post-editor-media.ts';
import type { CommunityMediaAccess } from '../community-media/index.ts';
import { keys, object } from '../../shared/account/index.ts';
import {
  communityArray,
  communityCursor,
  communityText,
} from '../../shared/communities/index.ts';
import {
  postRemoval,
  postTagLimit,
} from '../../shared/community-posts/index.ts';
import type {
  PostContent,
  PostState,
  TagPage,
  CommunityPost,
} from '../../shared/community-posts/index.ts';
import {
  communityButton as button,
  communityElement as el,
  communityField as field,
} from './elements.ts';
import { iconLabel } from './presentation.ts';
import type { CommunityIcon } from './presentation.ts';
/** A row of the post's “...” menu that opens its own form. */
function menuSummary(text: string, icon: CommunityIcon): HTMLElement {
  const summary = el('summary', text);
  iconLabel(summary, icon);
  return summary;
}
export interface PostActions {
  run: (work: () => Promise<void>) => Promise<void>;
  request: (
    operation: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  mutate: (
    operation: string,
    data: Record<string, unknown> | (() => Promise<Record<string, unknown>>),
  ) => Promise<void>;
  media: CommunityMediaAccess;
}
export interface PostTags {
  page: TagPage;
  load: (after: string | null) => Promise<TagPage>;
  run: PostActions['run'];
}
export function postTagSelect(
  container: HTMLElement,
  options: { value: string | null; label: string; empty: string },
  source: PostTags,
): HTMLSelectElement {
  const label = el('label', options.label),
    select = el('select'),
    controls = el('div', '', 'post-toolbar');
  label.append(select);
  container.append(label, controls);
  let initialized = false;
  function render(page: TagPage, first: boolean): void {
    const selected = initialized ? select.value : (options.value ?? ''),
      previous =
        select.selectedOptions[0]?.textContent || t('Tag anterior ou do link');
    initialized = true;
    const none = el('option', options.empty);
    none.value = '';
    select.replaceChildren(none);
    for (const tag of page.items) {
      const option = el('option', tag.label);
      option.value = tag.id;
      select.append(option);
    }
    if (selected && !page.items.some((tag) => tag.id === selected)) {
      const old = el('option', previous);
      old.value = selected;
      select.append(old);
    }
    select.value = selected;
    controls.replaceChildren();
    if (page.next)
      button(controls, t('Outras tags'), () =>
        source.run(async () => render(await source.load(page.next), false)),
      );
    if (!first)
      button(controls, t('Primeiras tags'), () =>
        source.run(async () => render(await source.load(null), true)),
      );
  }
  render(source.page, true);
  return select;
}
/**
 * Every community tag as a chip; the author toggles up to `postTagLimit`.
 * Tags already on the post stay selectable even if a manager retired them.
 */
function postTagChips(
  container: HTMLElement,
  value: readonly string[],
  source: PostTags,
): { chosen: () => string[]; offered: () => boolean } {
  const group = el('fieldset', '', 'post-tag-chips'),
    chips = el('div', '', 'post-tag-chip-list'),
    more = el('div', '', 'post-toolbar');
  group.append(
    el('legend', t('Tags (escolha de 1 a {0})', [postTagLimit])),
    chips,
  );
  container.append(group, more);
  let chosen = [...value],
    page = source.page;
  const paint = (): void => {
    const known = new Map(page.items.map((tag) => [tag.id, tag.label]));
    const ids = [
      ...page.items.map((tag) => tag.id),
      ...chosen.filter((id) => !known.has(id)),
    ];
    chips.replaceChildren(
      ...ids.map((id) => {
        const chip = el('button', known.get(id) ?? t('Tag anterior'));
        chip.type = 'button';
        const on = chosen.includes(id);
        chip.setAttribute('aria-pressed', String(on));
        chip.disabled = !on && chosen.length >= postTagLimit;
        chip.addEventListener('click', () => {
          chosen = on ? chosen.filter((tag) => tag !== id) : [...chosen, id];
          paint();
        });
        return chip;
      }),
    );
    more.replaceChildren();
    if (page.next)
      button(more, t('Mais tags'), () =>
        source.run(async () => {
          const next = await source.load(page.next);
          page = { items: [...page.items, ...next.items], next: next.next };
          paint();
        }),
      );
  };
  paint();
  return { chosen: () => [...chosen], offered: () => page.items.length > 0 };
}
export function postForm(
  container: HTMLElement,
  value: PostContent,
  tags: PostTags,
  access: PostEditorAccess,
): () => Promise<PostContent> {
  const title = field(container, t('Título'), {
      value: value.title,
      maximum: 200,
    }),
    text = field(container, t('Texto (opcional)'), {
      value: value.text,
      maximum: 4000,
      multiline: true,
    }),
    chips = postTagChips(container, value.tags, tags);
  title.required = true;
  mountMentionInput(title, access.signal);
  const media = postEditorMedia({
    container,
    text,
    ids: value.media ?? [],
    access,
  });
  return async () => {
    if (!title.value.trim()) {
      title.focus();
      throw new Error('Dê um título à postagem.');
    }
    const chosen = chips.chosen();
    if (!chosen.length && chips.offered())
      throw new Error('Escolha pelo menos uma tag.');
    return {
      title: mentionValue(title),
      text: mentionValue(text),
      tags: chosen,
      media: await media(),
    };
  };
}
export function replyForm(
  container: HTMLElement,
  value: PostContent,
  access: PostEditorAccess,
): () => Promise<PostContent> {
  const text = field(container, t('Texto da resposta (opcional com mídia)'), {
    value: value.text,
    maximum: 4000,
    multiline: true,
  });
  const media = postEditorMedia({
    container,
    text,
    ids: value.media ?? [],
    access,
  });
  return async () => ({
    title: '',
    text: mentionValue(text),
    tags: [],
    media: await media(),
  });
}

function command(state: PostState) {
  return {
    id: state.post.community,
    post: state.post.id,
    revision: state.post.revision,
  };
}
export function postActions(
  container: HTMLElement,
  state: PostState,
  tags: PostTags,
  actions: PostActions,
): void {
  if (state.canEdit) {
    const form = el('details', '', 'post-edit');
    form.append(menuSummary(t('Editar postagem'), 'pencil'));
    container.append(form);
    const content = state.post.parent
      ? replyForm(form, state.content!, actions.media)
      : postForm(form, state.content!, tags, actions.media);
    button(form, t('Salvar postagem'), () =>
      actions.mutate('post-edit', async () => ({
        ...command(state),
        content: await content(),
      })),
    );
  }
  if (state.canDelete) deleteForm(container, state, actions);
  if (state.manager && state.post.status === 'visible')
    hideForm(container, state, actions);
  if (state.removal) removalForms(container, state, actions);
  if (state.own || state.manager) history(container, state, actions);
}
function deleteForm(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const form = el('details', '', 'post-delete');
  form.append(menuSummary(t('Excluir postagem'), 'trash'));
  container.append(form);
  const label = el('label'),
    confirm = el('input');
  confirm.type = 'checkbox';
  label.append(
    confirm,
    document.createTextNode(
      t(
        'Excluir texto e mídia do banco/armazenamento ativo. Cópias externas e backups podem permanecer.',
      ),
    ),
  );
  form.append(label);
  button(form, t('Excluir minha postagem'), async () => {
    if (!confirm.checked) throw new Error('Confirme a exclusão da postagem.');
    await actions.mutate('post-delete', command(state));
  });
}
function hideForm(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const form = el('details', '', 'post-moderate');
  form.append(menuSummary(t('Ocultar pela moderação'), 'shield'));
  container.append(form);
  const reason = field(form, t('Motivo da remoção'), {
      maximum: 1000,
      multiline: true,
    }),
    record = crypto.randomUUID();
  button(form, t('Ocultar postagem'), () =>
    actions.mutate('post-hide', {
      ...command(state),
      record,
      reason: reason.value,
    }),
  );
}
function removalForms(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const removal = state.removal!;
  container.append(el('p', t('Motivo: {0}', [removal.reason])));
  if (removal.appeal)
    container.append(el('p', t('Contestação: {0}', [removal.appeal])));
  if (removal.decision)
    container.append(el('p', t('Resposta: {0}', [removal.decision])));
  if (state.own && !removal.appeal) {
    const text = field(container, t('Contestação da remoção'), {
      maximum: 2000,
      multiline: true,
    });
    button(container, t('Contestar remoção'), () =>
      actions.mutate('post-appeal', {
        id: state.post.community,
        post: state.post.id,
        record: removal.id,
        text: mentionValue(text),
      }),
    );
  }
  if (!state.manager) return;
  const decision = field(container, t('Resposta da moderação'), {
      maximum: 1000,
      multiline: true,
    }),
    data = () => ({
      ...command(state),
      record: removal.id,
      decision: decision.value,
    });
  button(container, t('Restaurar postagem'), () =>
    actions.mutate('post-decide', { ...data(), restore: true }),
  );
  if (removal.appeal && !removal.decision)
    button(container, t('Manter remoção e responder'), () =>
      actions.mutate('post-decide', { ...data(), restore: false }),
    );
}
function history(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const list = el('div');
  container.append(list);
  let after: string | null = null;
  const consult = button(container, t('Consultar histórico de moderação'), () =>
    actions.run(async () => {
      const data = object(
        await actions.request('post-moderations', {
          id: state.post.community,
          post: state.post.id,
          after,
        }),
      );
      keys(data, ['items', 'next']);
      list.replaceChildren();
      for (const value of communityArray(data['items'])) {
        const record = postRemoval(value);
        list.append(
          el(
            'p',
            t('{0} · {1} · {2}', [
              new Date(record.createdAt).toLocaleString(currentLanguage()),
              record.restored ? t('Restaurado') : t('Remoção'),
              record.reason,
            ]),
          ),
        );
        if (record.appeal)
          list.append(el('p', t('Contestação: {0}', [record.appeal])));
        if (record.decision)
          list.append(el('p', t('Resposta: {0}', [record.decision])));
      }
      after = communityCursor(data['next']);
    }),
  );
  iconLabel(consult, 'clock');
  list.className = 'post-history';
}
export function postReportForm(
  container: HTMLElement,
  post: CommunityPost,
  report: (data: Record<string, unknown>) => Promise<void>,
): void {
  if (post.status !== 'visible') return;
  const reason = field(container, t('Motivo da denúncia do post'), {
      maximum: 900,
      multiline: true,
    }),
    record = crypto.randomUUID();
  button(container, t('Denunciar postagem'), () =>
    report({
      record,
      kind: 'post',
      target: post.id,
      reason: communityText(reason.value, 900),
    }),
  );
}
