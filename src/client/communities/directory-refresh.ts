import { currentLanguage, t } from '../../shared/i18n/index.ts';
import type { CommunityPage } from '../../shared/communities/index.ts';
import {
  communityDirectoryProblem,
  clearCommunityProfileInvitation,
} from './directory-notice.ts';
import { communityButton, communityElement } from './elements.ts';
import { communityDirectoryNavigation } from './navigation.ts';

export interface DirectoryView {
  host: HTMLElement;
  view: string;
  selected: string | null;
  signedIn: boolean;
  valid: () => boolean;
}

interface DirectoryOptions {
  load: (cursor: string | null) => Promise<CommunityPage>;
  rows: (host: HTMLElement, page: CommunityPage, view: DirectoryView) => void;
  /** First page of the communities the person created, shown above Following. */
  created: () => Promise<CommunityPage>;
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
      const [page, created] = await this.pages(view);
      if (!view.valid()) return;
      const snapshot = JSON.stringify([
        view.view,
        view.selected,
        currentLanguage(),
        page,
        created,
      ]);
      if (snapshot === this.snapshot) return;
      this.clear(
        view,
        created ? () => this.createdSection(created, view) : undefined,
      );
      if (page) this.options.rows(view.host, page, view);
      else
        view.host.append(
          communityElement(
            'p',
            t('Sign in to see the communities you follow.'),
          ),
        );
      this.next = page?.next ?? null;
      if (this.next)
        communityButton(view.host, t('More communities'), () =>
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

  /** Followed page and created communities, both only for a signed-in person. */
  private pages(
    view: DirectoryView,
  ): Promise<[CommunityPage, CommunityPage] | [null, null]> {
    if (!view.signedIn) return Promise.resolve([null, null]);
    return Promise.all([
      this.options.load(this.cursor),
      this.options.created(),
    ]);
  }

  private clear(view: DirectoryView, above?: () => void): void {
    this.snapshot = null;
    this.next = null;
    clearCommunityProfileInvitation();
    this.options.release(view.host);
    view.host.replaceChildren();
    communityDirectoryNavigation(view.host, view.view, view.selected, above);
  }

  /**
   * Created communities sit above Following: there are usually fewer of them.
   * The heading stays even when the person has not created one yet.
   */
  private createdSection(page: CommunityPage, view: DirectoryView): void {
    view.host.append(communityElement('h2', t('Created by you')));
    // No placeholder text: an empty section is just its heading.
    if (page.items.length) this.options.rows(view.host, page, view);
  }
}
