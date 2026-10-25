import { t } from '../../shared/i18n/index.ts';
import type { Communities } from './controller.ts';
import type { CommunityScreen } from './screen.ts';
import { mountPublicProfileInvitation } from '../public-action-guidance/index.ts';
import type { PublicActionGate } from '../public-action-guidance/index.ts';
import { navigateApp } from '../app-navigation/index.ts';
import { mountMentionInput, mentionValue } from '../public-mentions/index.ts';
import type { CommunityState } from '../../shared/communities/index.ts';
import { communityField } from './elements.ts';
import { communityPresentationEditor } from './presentation-editor.ts';
import { mountCommunityCreation } from './community-create.ts';
import { mountCommunityBadges } from './badges.ts';
import { classificationSettings } from './classification.ts';
import { manageGroups } from './manage-tabs.ts';
import { mountCommunityGovernance } from './governance.ts';
interface EditorOptions {
  controller: Pick<Communities, 'request'>;
  participation: Pick<PublicActionGate, 'allow'>;
  run: (
    work: () => Promise<void>,
    options?: { quiet?: boolean },
  ) => Promise<void>;
  save: (operation: string, data: Record<string, unknown>) => Promise<void>;
  tags: (host: HTMLElement, community: string) => void;
}
/** Owns create/edit mounts, drafts and preview disposal. Selected community and
 * session authority stay in the shell and the existing controller. */
export class CommunityEditor {
  private readonly options: EditorOptions;
  private creationMounted = false;
  private presentation: ReturnType<typeof communityPresentationEditor> | null =
    null;
  constructor(options: EditorOptions) {
    this.options = options;
  }
  reset(): void {
    this.creationMounted = false;
    this.presentation?.dispose();
    this.presentation = null;
  }
  dirty(): boolean {
    return this.presentation?.dirty() ?? false;
  }
  retainDraft(next: CommunityState | null): boolean {
    return this.presentation?.retainDraft(next) ?? false;
  }
  accept(next: CommunityState): boolean {
    if (!this.presentation) return false;
    this.presentation.accept(next);
    return true;
  }
  manage(host: HTMLElement, own: CommunityState, signal: AbortSignal): void {
    const groups = manageGroups(
      host,
      own.role === 'owner'
        ? ['general', 'tags', 'moderation', 'ownership']
        : ['general', 'tags', 'moderation'],
    );
    this.presentation = communityPresentationEditor(groups.general, own, {
      signal,
      run: this.options.run,
      prepare: (work) => this.options.run(work, { quiet: true }),
      save: (data) => this.options.save('presentation', data),
    });
    mountCommunityBadges(groups.general, own.community.id, {
      mutate: (operation, data) => this.mutate(operation, data),
      query: this.options.run,
      request: (operation, data) =>
        this.options.controller.request(operation, data),
    });
    classificationSettings(groups.general, own, (nsfw) =>
      this.mutate('nsfw', {
        id: own.community.id,
        revision: own.community.revision,
        nsfw,
      }),
    );
    this.options.tags(groups.tags, own.community.id);
    this.governance(groups.moderation, own, groups.ownership);
  }
  private mutate(
    operation: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    return this.options.run(() => this.options.save(operation, data));
  }
  private metaForm(
    screen: CommunityScreen,
    card: HTMLElement,
    value: { name: string; description: string; rules: string },
  ) {
    const name = communityField(card, t('Community name'), {
      value: value.name,
      maximum: 100,
    });
    const description = communityField(card, t('Description'), {
      value: value.description,
      maximum: 1000,
      multiline: true,
    });
    const rules = communityField(card, t('Local rules'), {
      value: value.rules,
      maximum: 4000,
      multiline: true,
    });
    mountMentionInput(description, screen.signal);
    return () => ({
      name: name.value,
      description: mentionValue(description),
      rules: rules.value,
    });
  }
  async create(screen: CommunityScreen): Promise<void> {
    if (this.creationMounted) return;

    const allowed = await this.options.participation.allow(
      'create-community',
      screen.signal,
    );
    if (!screen.current() || this.creationMounted) return;
    screen.present();
    this.creationMounted = true;
    if (!allowed) {
      mountPublicProfileInvitation(screen.host, 'create-community');
      return;
    }
    mountCommunityCreation(screen.host, {
      signal: screen.signal,
      run: this.options.run,
      fields: (host) =>
        this.metaForm(screen, host, { name: '', description: '', rules: '' }),
      request: (operation, data) =>
        this.options.controller.request(operation, data),
      current: () => screen.current(),
      open: (id) => {
        navigateApp(`#communities?id=${id}`);
      },
    });
  }
  governance(
    container: HTMLElement,
    own: CommunityState,
    ownership: HTMLElement = container,
  ): void {
    mountCommunityGovernance({ container, ownership }, own, {
      mutate: (operation, data) => this.mutate(operation, data),
      query: this.options.run,
      request: (operation, data) =>
        this.options.controller.request(operation, data),
    });
  }
}
