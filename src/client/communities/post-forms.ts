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
import { markMissing } from './form-errors.ts';
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
        select.selectedOptions[0]?.textContent ||
        t('Previous tag or from link');
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
      button(controls, t('Other tags'), () =>
        source.run(async () => render(await source.load(page.next), false)),
      );
    if (!first)
      button(controls, t('Initial tags'), () =>
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
): { chosen: () => string[]; offered: () => boolean; group: HTMLElement } {
  const group = el('fieldset', '', 'post-tag-chips'),
    chips = el('div', '', 'post-tag-chip-list'),
    more = el('div', '', 'post-toolbar');
  group.append(
    el('legend', t('Tags (choose 1 to {0})', [postTagLimit])),
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
        const chip = el('button', known.get(id) ?? t('Previous tag'));
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
      button(more, t('More tags'), () =>
        source.run(async () => {
          const next = await source.load(page.next);
          page = { items: [...page.items, ...next.items], next: next.next };
          paint();
        }),
      );
  };
  paint();
  return {
    chosen: () => [...chosen],
    offered: () => page.items.length > 0,
    group,
  };
}
/** The title starts as one row and grows with its lines, like the text field's content. */
function growWithLines(field: HTMLTextAreaElement, signal: AbortSignal): void {
  field.rows = 1;
  field.classList.add('post-title-input');
  const fit = () => {
    // Detached or hidden fields measure 0; keep the one-row default until shown.
    if (!field.scrollHeight) return;
    field.style.height = 'auto';
    const borders = field.offsetHeight - field.clientHeight;
    field.style.height = `${field.scrollHeight + borders}px`;
  };
  field.addEventListener('input', fit, { signal });
  field.addEventListener('focus', fit, { signal });
  requestAnimationFrame(fit);
}
export function postForm(
  container: HTMLElement,
  value: PostContent,
  tags: PostTags,
  access: PostEditorAccess,
): () => Promise<PostContent> {
  const title = field(container, t('Title'), {
      value: value.title,
      maximum: 200,
      multiline: true,
    }),
    text = field(container, t('Text (optional)'), {
      value: value.text,
      maximum: 4000,
      multiline: true,
    }),
    chips = postTagChips(container, value.tags, tags);
  title.required = true;
  if (title instanceof HTMLTextAreaElement) growWithLines(title, access.signal);
  mountMentionInput(title, access.signal);
  const media = postEditorMedia({
    container,
    text,
    ids: value.media ?? [],
    access,
  });
  return async () => {
    if (!title.value.trim()) {
      markMissing(title, t('Give your post a title.'));
      throw new Error('Give your post a title.');
    }
    const chosen = chips.chosen();
    if (!chosen.length && chips.offered()) {
      markMissing(chips.group, t('Choose at least one tag.'));
      throw new Error('Choose at least one tag.');
    }
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
  const text = field(container, t('Reply text (optional with media)'), {
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
    form.append(menuSummary(t('Edit post'), 'pencil'));
    container.append(form);
    const content = state.post.parent
      ? replyForm(form, state.content!, actions.media)
      : postForm(form, state.content!, tags, actions.media);
    button(form, t('Save post'), () =>
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
  form.append(menuSummary(t('Delete post'), 'trash'));
  container.append(form);
  const label = el('label'),
    confirm = el('input');
  confirm.type = 'checkbox';
  label.append(
    confirm,
    document.createTextNode(
      t(
        'Delete text and media from active database/storage. External copies and backups may remain.',
      ),
    ),
  );
  form.append(label);
  button(form, t('Delete my post'), async () => {
    if (!confirm.checked) throw new Error('Confirm post deletion.');
    await actions.mutate('post-delete', command(state));
  });
}
function hideForm(
  container: HTMLElement,
  state: PostState,
  actions: PostActions,
): void {
  const form = el('details', '', 'post-moderate');
  form.append(menuSummary(t('Hide through moderation'), 'shield'));
  container.append(form);
  const reason = field(form, t('Removal reason'), {
      maximum: 1000,
      multiline: true,
    }),
    record = crypto.randomUUID();
  button(form, t('Hide post'), () =>
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
  container.append(el('p', t('Reason: {0}', [removal.reason])));
  if (removal.appeal)
    container.append(el('p', t('Appeal: {0}', [removal.appeal])));
  if (removal.decision)
    container.append(el('p', t('Reply: {0}', [removal.decision])));
  if (state.own && !removal.appeal) {
    const text = field(container, t('Removal appeal'), {
      maximum: 2000,
      multiline: true,
    });
    button(container, t('Appeal removal'), () =>
      actions.mutate('post-appeal', {
        id: state.post.community,
        post: state.post.id,
        record: removal.id,
        text: mentionValue(text),
      }),
    );
  }
  if (!state.manager) return;
  const decision = field(container, t('Moderation response'), {
      maximum: 1000,
      multiline: true,
    }),
    data = () => ({
      ...command(state),
      record: removal.id,
      decision: decision.value,
    });
  button(container, t('Restore post'), () =>
    actions.mutate('post-decide', { ...data(), restore: true }),
  );
  if (removal.appeal && !removal.decision)
    button(container, t('Keep removal and respond'), () =>
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
  const consult = button(container, t('View moderation history'), () =>
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
              record.restored ? t('Restored') : t('Removal'),
              record.reason,
            ]),
          ),
        );
        if (record.appeal)
          list.append(el('p', t('Appeal: {0}', [record.appeal])));
        if (record.decision)
          list.append(el('p', t('Reply: {0}', [record.decision])));
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
  const reason = field(container, t('Post report reason'), {
      maximum: 900,
      multiline: true,
    }),
    record = crypto.randomUUID();
  button(container, t('Report post'), () =>
    report({
      record,
      kind: 'post',
      target: post.id,
      reason: communityText(reason.value, 900),
    }),
  );
}
