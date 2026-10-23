import { t, currentLanguage } from '../../shared/i18n/index.ts';
import {
  groupTextQuota,
  groupMediaQuota,
} from '../../shared/group-quota/index.ts';
import type { GroupController } from './controller.ts';

interface VaultOptions {
  controller: Pick<GroupController, 'selected' | 'vault' | 'clearVault'>;
  account: () => string | undefined;
  isBusy: () => boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  reopen: () => Promise<void>;
  report: (notice: string) => void;
}
/** Owns the displayed quota/cleanup page. Remote authorization and cleanup rules
 * remain in the existing controller; no new read or retention policy is added. */
export class GroupVaultPanel {
  private readonly options: VaultOptions;
  private host: HTMLElement | null = null;
  private value: Awaited<ReturnType<GroupController['vault']>> | null = null;
  constructor(options: VaultOptions) {
    this.options = options;
  }
  reset(): void {
    this.value = null;
  }
  private node<T extends HTMLElement>(selector: string): T | null {
    return this.host?.querySelector<T>(selector) ?? null;
  }
  async refresh(): Promise<void> {
    this.value =
      this.options.controller.selected?.localOnly ||
      !this.node<HTMLDetailsElement>('[data-group-vault]')?.open
        ? null
        : await this.options.controller.vault();
  }
  render(): void {
    const value = this.node('[data-group-usage]');
    if (value)
      value.textContent = this.value
        ? t('Text and administration: {0} / {1} MB · media: {2} / {3} MB', [
            (this.value.textBytes / 1_000_000).toFixed(2),
            groupTextQuota / 1_000_000,
            (this.value.mediaBytes / 1_000_000).toFixed(2),
            groupMediaQuota / 1_000_000,
          ])
        : '';
    const warning = this.node('[data-group-cleanup-warning]');
    if (warning)
      warning.textContent = this.value?.notice
        ? t(
            'Old media cleanup scheduled for {0}. About {1} MB selected. Text stays.',
            [
              new Date(this.value.notice.dueAt).toLocaleString(
                currentLanguage(),
              ),
              (this.value.notice.bytes / 1_000_000).toFixed(2),
            ],
          )
        : '';
    const clear = this.node('[data-group-clear]');
    if (clear) clear.hidden = !this.canClear();
    this.renderCleanupItems();
  }
  private canClear(): boolean {
    const group = this.options.controller.selected;
    return (
      !!group &&
      !group.localOnly &&
      group.state.owner === this.options.account()
    );
  }
  private renderCleanupItems(): void {
    const more = this.node('[data-group-cleanup-more]');
    if (more) more.hidden = this.value?.next === null || !this.value;
    const selected = this.node('[data-group-cleanup-items]');
    if (!selected) return;
    selected.replaceChildren();
    for (const item of this.value?.items ?? []) {
      const li = document.createElement('li');
      li.textContent = t('Message {0} · {1} MB', [
        item.message.slice(0, 8),
        (item.bytes / 1_000_000).toFixed(2),
      ]);
      selected.append(li);
    }
  }
  mount(host: HTMLElement): void {
    this.host = host;
    this.node<HTMLDetailsElement>('[data-group-vault]')?.addEventListener(
      'toggle',
      () => {
        if (
          this.node<HTMLDetailsElement>('[data-group-vault]')?.open &&
          !this.options.isBusy()
        )
          void this.options.run(async () => {
            await this.refresh();
            this.render();
          });
      },
    );
    this.node('[data-group-cleanup-more]')?.addEventListener(
      'click',
      () =>
        void this.options.run(async () => {
          if (this.value?.next === null || !this.value) return;
          this.value = await this.options.controller.vault(this.value.next);
          this.render();
        }),
    );
    this.node('[data-group-clear]')?.addEventListener(
      'click',
      () =>
        void this.options.run(async () => {
          if (
            !window.confirm(
              t(
                "Clear this group's remote vault content? Messages and media will be removed; local copies and saved files may remain.",
              ),
            )
          )
            return;
          await this.options.controller.clearVault();
          this.options.report(t('Vault cleanup started.'));
          await this.options.reopen();
        }),
    );
  }
}
