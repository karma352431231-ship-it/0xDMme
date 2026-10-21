import { t, translatedError } from '../../shared/i18n/index.ts';
import { groupManager } from '../../shared/groups/index.ts';
import { groupDescription } from '../../shared/group-messages/index.ts';
import type { GroupSummary } from './controller.ts';
interface DescriptionValue {
  description: string;
  sequence: number;
}
interface DescriptionPorts {
  selected: () => GroupSummary | null;
  account: () => string | undefined;
  load: () => Promise<DescriptionValue>;
  save: (input: {
    group: string;
    id: string;
    description: string;
    sequence: number;
  }) => Promise<void>;
  run: (work: () => Promise<void>) => Promise<void>;
}
/** Keeps edits stable through unrelated renders and binds async work to the
 * selected group/lifetime. Read-only members never receive an edit control. */
export class GroupDescriptionUi {
  private readonly ports: DescriptionPorts;
  private host: HTMLElement | null = null;
  private generation = 0;
  private key = '';
  private saving = false;
  private draft: {
    group: string;
    id: string;
    value: DescriptionValue;
    dirty: boolean;
  } | null = null;
  constructor(ports: DescriptionPorts) {
    this.ports = ports;
  }
  reset(): void {
    const form = this.host?.querySelector<HTMLElement>(
      '[data-group-description-form]',
    );
    if (form) form.hidden = true;
    this.generation++;
    this.key = '';
    this.draft = null;
    this.clear();
  }
  mount(host: HTMLElement): void {
    this.host = host;
    host
      .querySelector('[data-group-description-reload]')
      ?.addEventListener('click', () => {
        this.reset();
        const group = this.ports.selected();
        if (group) this.show(group);
      });
    host
      .querySelector('[data-group-description-form]')
      ?.addEventListener('submit', (event) => {
        event.preventDefault();
        void this.save();
      });
    host
      .querySelector('[data-group-description-input]')
      ?.addEventListener('input', () => {
        if (!this.draft) return;
        this.draft.dirty = true;
        this.draft.id = crypto.randomUUID();
        this.draft.value.description = this.input()?.value ?? '';
      });
  }
  show(group: GroupSummary): void {
    const key = JSON.stringify([
      group.state.groupId,
      group.head,
      group.profileSequence ?? 0,
      group.localOnly ?? false,
    ]);
    this.permissions(group);
    if (key === this.key) return;
    this.key = key;
    const generation = ++this.generation;
    if (this.draft?.group !== group.state.groupId) {
      this.draft = null;
      this.clear();
    }
    void this.load(group, generation);
  }
  private async load(group: GroupSummary, generation: number): Promise<void> {
    try {
      const value = await this.ports.load();
      if (!this.current(generation, group.state.groupId)) return;
      const display = this.host?.querySelector('[data-group-description]');
      if (display)
        display.textContent = value.description || t('No description yet.');
      if (this.draft?.dirty) return;
      this.draft = {
        group: group.state.groupId,
        id: crypto.randomUUID(),
        value,
        dirty: false,
      };
      const input = this.input();
      if (input) {
        input.value = value.description;
        input.disabled = false;
      }
    } catch (error: unknown) {
      if (this.current(generation, group.state.groupId)) this.feedback(error);
    }
  }
  private current(generation: number, group: string): boolean {
    return (
      generation === this.generation &&
      this.ports.selected()?.state.groupId === group
    );
  }
  private input(): HTMLTextAreaElement | null {
    return (
      this.host?.querySelector<HTMLTextAreaElement>(
        '[data-group-description-input]',
      ) ?? null
    );
  }
  private permissions(group: GroupSummary): void {
    const account = this.ports.account(),
      form = this.host?.querySelector<HTMLElement>(
        '[data-group-description-form]',
      );
    const input = this.input();
    if (input)
      input.disabled = this.saving || this.draft?.group !== group.state.groupId;
    if (form)
      form.hidden =
        !!group.localOnly || !account || !groupManager(group.state, account);
  }
  private clear(): void {
    const input = this.input(),
      display = this.host?.querySelector('[data-group-description]'),
      feedback = this.host?.querySelector('[data-group-description-feedback]');
    if (input) {
      input.value = '';
      input.disabled = true;
    }
    if (display) display.textContent = '';
    if (feedback) feedback.textContent = '';
  }
  private feedback(error: unknown): void {
    const node = this.host?.querySelector('[data-group-description-feedback]');
    if (node)
      node.textContent =
        error instanceof Error
          ? translatedError(error.message)
          : t('Operation not confirmed. Try again.');
  }
  private controls(disabled: boolean): void {
    const button = this.host?.querySelector<HTMLButtonElement>(
        '[data-group-description-save]',
      ),
      input = this.input();
    if (button) button.disabled = disabled;
    if (input) input.disabled = disabled;
  }
  private value(): string {
    return groupDescription(this.input()?.value ?? '');
  }
  private async save(): Promise<void> {
    const draft = this.draft,
      generation = this.generation;
    if (!draft?.dirty || !this.current(generation, draft.group)) return;
    const button = this.host?.querySelector<HTMLButtonElement>(
      '[data-group-description-save]',
    );
    if (button?.disabled) return;
    this.saving = true;
    this.controls(true);
    try {
      const description = this.value();
      await this.ports.run(async () => {
        if (!this.current(generation, draft.group)) return;
        await this.ports.save({
          group: draft.group,
          id: draft.id,
          description,
          sequence: draft.value.sequence,
        });
        if (!this.current(generation, draft.group)) return;
        draft.dirty = false;
        this.key = '';
        this.show(this.ports.selected()!);
      });
    } catch (error: unknown) {
      if (this.current(generation, draft.group)) this.feedback(error);
    } finally {
      this.saving = false;
      this.controls(false);
    }
  }
}
