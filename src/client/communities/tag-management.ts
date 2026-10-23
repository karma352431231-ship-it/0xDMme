import { keys, object } from '../../shared/account/index.ts';
import { communityCursor } from '../../shared/communities/index.ts';
import { tagPage } from '../../shared/community-posts/index.ts';
import type { PostTag } from '../../shared/community-posts/index.ts';
import { t, translatedError } from '../../shared/i18n/index.ts';
import type { Communities } from './controller.ts';
import {
  communityButton as button,
  communityCard as card,
  communityElement as el,
  communityField as field,
} from './elements.ts';

/** Owns the isolated tag editor, its retry identity, cursor and pending work. */
export class TagManagement {
  private readonly controller: Pick<Communities, 'request'>;
  private section: HTMLElement | null = null;
  private feedback: HTMLElement | null = null;
  private community = '';
  private generation = 0;
  private busy = false;

  constructor(controller: Pick<Communities, 'request'>) {
    this.controller = controller;
  }

  canActivate(): boolean {
    return !this.busy;
  }

  dispose(): void {
    this.generation++;
    this.section = null;
    this.feedback = null;
  }

  mount(container: HTMLElement, community: string): void {
    this.dispose();
    this.community = community;
    const section = card(t('Community tags'));
    this.section = section;
    container.append(section);
    const label = field(section, t('New tag name'), { maximum: 36 });
    const rows = el('div');
    section.append(rows);
    let id = crypto.randomUUID();
    let cursor: string | null = null;
    const generation = this.generation;
    button(section, t('Create tag'), async () => {
      if (
        await this.save(
          { id: community, tag: id, label: label.value },
          'tag-create',
        )
      ) {
        id = crypto.randomUUID();
        label.value = '';
      }
    });
    const load = async (): Promise<void> => {
      const page = tagPage(
        await this.controller.request('tag-list', {
          id: community,
          after: cursor,
        }),
      );
      if (generation !== this.generation) return;
      rows.replaceChildren();
      for (const value of page.items) this.row(rows, value);
      if (!page.items.length)
        rows.append(el('p', t('No tags created.'), 'community-hint'));
      cursor = communityCursor(page.next);
      more.hidden = cursor === null;
    };
    const more = button(section, t('More tags'), () => this.run(load));
    more.hidden = true;
    this.feedback = el('p', '', 'community-feedback');
    this.feedback.setAttribute('role', 'status');
    section.append(this.feedback);
    void load().catch(() => {
      if (generation === this.generation)
        rows.replaceChildren(
          el('p', t('Tags currently unavailable.'), 'community-hint'),
        );
    });
  }

  private disabled(): void {
    this.section
      ?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('button,input')
      .forEach((node) => {
        node.disabled = this.busy;
      });
  }

  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    const generation = this.generation;
    this.busy = true;
    this.disabled();
    try {
      await work();
    } catch (error: unknown) {
      if (generation === this.generation && this.feedback)
        this.feedback.textContent =
          error instanceof Error
            ? translatedError(error.message)
            : t('Posts unavailable.');
    } finally {
      this.busy = false;
      this.disabled();
    }
  }

  private row(container: HTMLElement, value: PostTag): void {
    const row = el('div', '', 'community-row');
    const label = field(row, t('Tag name'), {
      value: value.label,
      maximum: 36,
    });
    const wrap = el('label'),
      active = el('input');
    active.type = 'checkbox';
    active.checked = value.active;
    wrap.append(active, document.createTextNode(t('Available for new posts')));
    row.append(wrap);
    container.append(row);
    const community = this.community;
    button(row, t('Save tag'), async () => {
      await this.save(
        {
          id: community,
          tag: value.id,
          revision: value.revision,
          label: label.value,
          active: active.checked,
        },
        'tag-edit',
      );
    });
  }

  private async save(
    data: Record<string, unknown>,
    operation: string,
  ): Promise<boolean> {
    let saved = false;
    await this.run(async () => {
      const generation = this.generation;
      const result = object(await this.controller.request(operation, data));
      keys(result, ['saved']);
      if (result['saved'] !== true) throw new Error('Invalid tag response.');
      if (generation !== this.generation) return;
      saved = true;
      if (this.feedback)
        this.feedback.textContent = t(
          'Tag saved. Reload the community to update selectors and revisions.',
        );
    });
    return saved;
  }
}
