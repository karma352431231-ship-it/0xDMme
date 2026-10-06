import { keys, object } from '../../shared/account/index.ts';
import {
  communityArray,
  communityCursor,
  communityText,
} from '../../shared/communities/index.ts';
import { postRemoval } from '../../shared/community-posts/index.ts';
import type {
  PostContent,
  PostState,
  TagPage,
} from '../../shared/community-posts/index.ts';
import {
  communityButton as button,
  communityElement as el,
  communityField as field,
} from './elements.ts';
export interface PostActions {
  run: (work: () => Promise<void>) => Promise<void>;
  request: (
    operation: string,
    data: Record<string, unknown>,
  ) => Promise<unknown>;
  mutate: (operation: string, data: Record<string, unknown>) => Promise<void>;
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
        select.selectedOptions[0]?.textContent || 'Tag anterior ou do link';
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
      button(controls, 'Outras tags', () =>
        source.run(async () => render(await source.load(page.next), false)),
      );
    if (!first)
      button(controls, 'Primeiras tags', () =>
        source.run(async () => render(await source.load(null), true)),
      );
  }
  render(source.page, true);
  return select;
}
export function postForm(
  container: HTMLElement,
  value: PostContent,
  tags: PostTags,
): () => PostContent {
  const title = field(container, 'Título (opcional)', {
      value: value.title,
      maximum: 200,
    }),
    text = field(container, 'Texto da postagem', {
      value: value.text,
      maximum: 4000,
      multiline: true,
    }),
    select = postTagSelect(
      container,
      { value: value.tag, label: 'Tag (opcional)', empty: 'Sem tag' },
      tags,
    );
  return () => ({
    title: title.value,
    text: text.value,
    tag: select.value || null,
  });
}
export function replyForm(
  container: HTMLElement,
  value = '',
): () => PostContent {
  const text = field(container, 'Texto da resposta', {
    value,
    maximum: 4000,
    multiline: true,
  });
  return () => ({ title: '', text: text.value, tag: null });
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
    const form = el('details');
    form.append(el('summary', 'Editar postagem'));
    container.append(form);
    const content = state.post.parent
      ? replyForm(form, state.content!.text)
      : postForm(form, state.content!, tags);
    button(form, 'Salvar postagem', () =>
      actions.mutate('post-edit', { ...command(state), content: content() }),
    );
  }
  if (state.canDelete) deleteForm(container, state, actions);
  if (state.manager && state.post.status === 'visible')
    hideForm(container, state, actions);
  if (state.removal) removalForms(container, state, actions);
  if (state.own || state.manager) history(container, state, actions);
  reportForm(container, state, actions);
}
function deleteForm(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const label = el('label'),
    confirm = el('input');
  confirm.type = 'checkbox';
  label.append(
    confirm,
    document.createTextNode(
      'Excluir o texto do banco ativo. Cópias externas e backups podem permanecer.',
    ),
  );
  container.append(label);
  button(container, 'Excluir minha postagem', async () => {
    if (!confirm.checked) throw new Error('Confirme a exclusão do texto.');
    await actions.mutate('post-delete', command(state));
  });
}
function hideForm(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const reason = field(container, 'Motivo da remoção', {
      maximum: 1000,
      multiline: true,
    }),
    record = crypto.randomUUID();
  button(container, 'Ocultar postagem', () =>
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
  container.append(el('p', `Motivo: ${removal.reason}`));
  if (removal.appeal)
    container.append(el('p', `Contestação: ${removal.appeal}`));
  if (removal.decision)
    container.append(el('p', `Resposta: ${removal.decision}`));
  if (state.own && !removal.appeal) {
    const text = field(container, 'Contestação da remoção', {
      maximum: 2000,
      multiline: true,
    });
    button(container, 'Contestar remoção', () =>
      actions.mutate('post-appeal', {
        id: state.post.community,
        post: state.post.id,
        record: removal.id,
        text: text.value,
      }),
    );
  }
  if (!state.manager) return;
  const decision = field(container, 'Resposta da moderação', {
      maximum: 1000,
      multiline: true,
    }),
    data = () => ({
      ...command(state),
      record: removal.id,
      decision: decision.value,
    });
  button(container, 'Restaurar postagem', () =>
    actions.mutate('post-decide', { ...data(), restore: true }),
  );
  if (removal.appeal && !removal.decision)
    button(container, 'Manter remoção e responder', () =>
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
  button(container, 'Consultar histórico de moderação', () =>
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
            `${new Date(record.createdAt).toLocaleString('pt-BR')} · ${record.restored ? 'Restaurado' : 'Remoção'} · ${record.reason}`,
          ),
        );
        if (record.appeal)
          list.append(el('p', `Contestação: ${record.appeal}`));
        if (record.decision)
          list.append(el('p', `Resposta: ${record.decision}`));
      }
      after = communityCursor(data['next']);
    }),
  );
}
function reportForm(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  if (state.post.status !== 'visible') return;
  const reason = field(container, 'Motivo da denúncia do post', {
      maximum: 900,
      multiline: true,
    }),
    record = crypto.randomUUID();
  button(container, 'Denunciar postagem', () =>
    actions.mutate('report', {
      id: state.post.community,
      record,
      reason: `Post ${state.post.id}: ${communityText(reason.value, 900)}`,
    }),
  );
}
