import { MentionDraft } from './draft.ts';
import { searchMentions } from './search.ts';
import type { MentionChoice } from './search.ts';
import { showPublicAvatar } from '../public-media/index.ts';
import { avatarInitials } from '../appearance/index.ts';
import { mentionText } from '../../shared/public-mentions/index.ts';

type Field = HTMLInputElement | HTMLTextAreaElement;
const editors = new WeakMap<Field, MentionInput>();
class MentionInput {
  readonly draft: MentionDraft;
  private readonly panel = document.createElement('div');
  private readonly lifetime = new AbortController();
  private searchAbort = new AbortController();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private choices: MentionChoice[] = [];
  private query: ReturnType<MentionDraft['query']> = null;
  private selected = 0;
  private generation = 0;
  private readonly field: Field;
  constructor(field: Field, signal: AbortSignal) {
    this.field = field;
    this.draft = new MentionDraft(field.value);
    field.value = this.draft.text;
    this.panel.className = 'mention-suggestions';
    this.panel.id = 'mentions-' + crypto.randomUUID();
    this.panel.hidden = true;
    this.panel.setAttribute('role', 'listbox');
    this.panel.setAttribute('aria-label', 'Usuários e comunidades');
    field.setAttribute('aria-controls', this.panel.id);
    field.setAttribute('aria-autocomplete', 'list');
    field.setAttribute('aria-expanded', 'false');
    (field.closest('dialog') ?? document.body).append(this.panel);
    const lifetime = AbortSignal.any([signal, this.lifetime.signal]);
    field.addEventListener('input', () => this.changed(), { signal: lifetime });
    field.addEventListener('click', () => this.changed(), { signal: lifetime });
    field.addEventListener(
      'keydown',
      (event) => {
        if (event instanceof KeyboardEvent) this.key(event);
      },
      {
        signal: lifetime,
      },
    );
    field.addEventListener('blur', () => this.close(), { signal: lifetime });
    window.addEventListener('resize', () => this.position(), {
      signal: lifetime,
    });
    document.addEventListener('scroll', () => this.position(), {
      capture: true,
      signal: lifetime,
    });
    lifetime.addEventListener(
      'abort',
      () => {
        this.close();
        this.panel.remove();
        editors.delete(field);
      },
      { once: true },
    );
  }
  reset(value: string): void {
    this.close();
    this.draft.reset(value);
    this.field.value = this.draft.text;
  }
  value(): string {
    this.draft.update(this.field.value);
    return this.draft.value();
  }
  close(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.searchAbort.abort();
    this.generation++;
    this.choices = [];
    this.panel.hidden = true;
    this.field.setAttribute('aria-expanded', 'false');
    this.field.removeAttribute('aria-activedescendant');
  }
  private changed(): void {
    this.draft.update(this.field.value);
    this.close();
    if (this.field.disabled) return;
    const query = this.draft.query(
      this.field.selectionStart ?? this.field.value.length,
    );
    this.query = query;
    if (query) this.timer = setTimeout(() => void this.search(query), 250);
  }
  private async search(
    query: NonNullable<MentionInput['query']>,
  ): Promise<void> {
    const old = this.generation;
    this.searchAbort = new AbortController();
    try {
      const choices = await searchMentions(query.text, this.searchAbort.signal);
      if (old !== this.generation || !this.field.isConnected) return;
      this.choices = choices;
      this.selected = 0;
      this.paint(
        choices.length ? '' : 'Nenhum perfil ou comunidade encontrado.',
      );
    } catch {
      if (old === this.generation)
        this.paint(
          'Não foi possível buscar. Continue escrevendo para tentar de novo.',
        );
    }
  }
  private paint(problem: string): void {
    this.panel.replaceChildren();
    if (problem) {
      const status = document.createElement('p');
      status.textContent = problem;
      status.setAttribute('role', 'status');
      this.panel.append(status);
    }
    this.choices.forEach((choice, index) =>
      this.panel.append(this.option(choice, index)),
    );
    this.panel.hidden = false;
    this.field.setAttribute('aria-expanded', 'true');
    this.highlight();
    this.position();
  }
  private option(choice: MentionChoice, index: number): HTMLElement {
    const button = document.createElement('button'),
      avatar = document.createElement('span'),
      copy = document.createElement('span'),
      title = document.createElement('strong'),
      type = document.createElement('small');
    button.type = 'button';
    button.id = `${this.panel.id}-${index}`;
    button.setAttribute('role', 'option');
    button.setAttribute(
      'aria-label',
      `@${choice.label} ${choice.kind === 'user' ? 'Usuário' : 'Comunidade'}`,
    );
    avatar.className = 'mention-avatar';
    avatar.textContent = avatarInitials(choice.label);
    title.textContent = '@' + choice.label;
    type.textContent = choice.kind === 'user' ? 'Usuário' : 'Comunidade';
    copy.append(title, type);
    button.append(avatar, copy);
    if (choice.avatar)
      showPublicAvatar(avatar, {
        kind: choice.kind === 'user' ? 'avatar' : 'community-photo',
        target: choice.id,
        reference: choice.avatar,
        signal: this.searchAbort.signal,
      });
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.addEventListener('click', () => this.choose(index));
    return button;
  }
  private highlight(): void {
    this.panel
      .querySelectorAll('[role="option"]')
      .forEach((node, index) =>
        node.setAttribute('aria-selected', String(index === this.selected)),
      );
    if (this.choices.length)
      this.field.setAttribute(
        'aria-activedescendant',
        `${this.panel.id}-${this.selected}`,
      );
  }
  private key(event: KeyboardEvent): void {
    if (this.panel.hidden || event.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key === 'Enter' && this.choices.length) {
      event.preventDefault();
      this.choose(this.selected);
      return;
    }
    if (!['ArrowDown', 'ArrowUp'].includes(event.key) || !this.choices.length)
      return;
    event.preventDefault();
    this.selected =
      (this.selected +
        (event.key === 'ArrowDown' ? 1 : -1) +
        this.choices.length) %
      this.choices.length;
    this.highlight();
  }
  private choose(index: number): void {
    const target = this.choices[index],
      query = this.query;
    if (!target || !query || this.field.disabled) return;
    const candidate = new MentionDraft(this.value());
    const caret = candidate.select(query.start, query.end, target);
    try {
      mentionText(
        candidate.value(),
        this.field.maxLength > 0 ? this.field.maxLength : 560,
      );
    } catch {
      this.paint('Sem espaço para esta menção. Remova um pouco do texto.');
      return;
    }
    this.draft.reset(candidate.value());
    this.field.value = this.draft.text;
    this.field.focus();
    this.field.setSelectionRange(caret, caret);
    this.close();
    this.field.dispatchEvent(new Event('input', { bubbles: true }));
  }
  private position(): void {
    if (this.panel.hidden) return;
    const rect = this.field.getBoundingClientRect(),
      width = Math.min(360, innerWidth - 24),
      height = Math.min(240, innerHeight - 24);
    this.panel.style.width = `${width}px`;
    this.panel.style.maxHeight = `${height}px`;
    this.panel.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
    this.panel.style.top = `${Math.max(12, Math.min(rect.bottom + 6, innerHeight - height - 12))}px`;
  }
}
export function mountMentionInput(field: Field, signal: AbortSignal): void {
  if (typeof window === 'undefined' || signal.aborted || editors.has(field))
    return;
  editors.set(field, new MentionInput(field, signal));
}
export function mentionValue(field: Field): string {
  return editors.get(field)?.value() ?? field.value;
}
export function setMentionValue(field: Field, value: string): void {
  const editor = editors.get(field);
  if (editor) editor.reset(value);
  else field.value = value;
}
