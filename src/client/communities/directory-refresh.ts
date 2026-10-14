import { currentLanguage, t } from '../../shared/i18n/index.ts';
import type { CommunityPage } from '../../shared/communities/index.ts';
import {
  communityDirectoryProblem,
  clearCommunityProfileInvitation,
} from './directory-notice.ts';
import { communityButton, communityElement } from './elements.ts';
import { communityDirectoryNavigation } from './navigation.ts';

interface DirectoryView {
  host: HTMLElement;
  view: string;
  selected: string | null;
  signedIn: boolean;
  valid: () => boolean;
}

interface DirectoryOptions {
  load: (cursor: string | null) => Promise<CommunityPage>;
  rows: (host: HTMLElement, page: CommunityPage) => void;
  release: (host: HTMLElement) => void;
  run: (work: () => Promise<void>) => Promise<void>;
}

/** Recheck the displayed page before publishing changes. An identical response
 * keeps the existing nodes; failures discard the previous authorized list. */
export class CommunityDirectory {
  private snapshot: string | null = null;
  private cursor: string | null = null;
  private next: string | null = null;
  private readonly options: DirectoryOptions;
  constructor(options: DirectoryOptions) {
    this.options = options;
  }

  reset(): void {
    this.snapshot = null;
    this.cursor = null;
    this.next = null;
  }

  async refresh(view: DirectoryView): Promise<void> {
    try {
      const page = view.signedIn ? await this.options.load(this.cursor) : null;
      if (!view.valid()) return;
      const snapshot = JSON.stringify([
        view.view,
        view.selected,
        currentLanguage(),
        page,
      ]);
      if (snapshot === this.snapshot) return;
      this.clear(view);
      if (page) this.options.rows(view.host, page);
      else
        view.host.append(
          communityElement('p', t('Entre para ver suas comunidades seguidas.')),
        );
      this.next = page?.next ?? null;
      if (this.next)
        communityButton(view.host, t('Mais comunidades'), () =>
          this.options.run(async () => {
            if (!view.valid()) return;
            this.cursor = this.next;
            await this.refresh(view);
          }),
        );
      this.snapshot = snapshot;
    } catch (error: unknown) {
      if (!view.valid()) return;
      this.clear(view);
      communityDirectoryProblem(view.host, error);
    }
  }

  private clear(view: DirectoryView): void {
    this.snapshot = null;
    this.next = null;
    clearCommunityProfileInvitation();
    this.options.release(view.host);
    view.host.replaceChildren();
    communityDirectoryNavigation(view.host, view.view, view.selected);
  }
}
