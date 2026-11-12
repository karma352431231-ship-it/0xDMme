import { t } from '../../shared/i18n/index.ts';
import { infoActionBar, infoRow, MuteRow } from '../conversation-info/index.ts';
import type { MutePort } from '../conversation-info/index.ts';

export interface GroupShortcutPorts {
  /** The group's existing per-account mute. */
  mute: (groupId: string) => MutePort;
  /** Message search limited to this group, when the chat provides one. */
  search?: (group: { id: string; title: string }) => void;
  /** The person's starred messages in this group. */
  starred?: (group: { id: string }) => void;
}

/** The shortcuts under a group's name in its settings. Owns only the rows of
 * the open panel; mute and search stay with their existing owners. */
export class GroupSettingsShortcuts {
  private readonly ports: GroupShortcutPorts;
  private mute: MuteRow | null = null;
  constructor(ports: GroupShortcutPorts) {
    this.ports = ports;
  }
  show(
    host: HTMLElement | null,
    group: { id: string; title: string; localOnly: boolean },
    close: () => void,
  ): void {
    this.clear(host);
    if (!host || group.localOnly) return;
    const search = this.ports.search;
    const bar = infoActionBar(
      search
        ? [
            {
              id: 'search',
              label: t('Search'),
              icon: 'search',
              perform: () => {
                close();
                search({ id: group.id, title: group.title });
              },
            },
          ]
        : [],
    );
    host.append(bar);
    const starred = this.ports.starred;
    if (starred)
      host.append(
        infoRow({
          label: t('Starred messages'),
          icon: 'star',
          perform: () => {
            close();
            starred({ id: group.id });
          },
        }),
      );
    this.mute = new MuteRow(this.ports.mute(group.id));
    void this.mute.load();
    host.append(this.mute.element);
  }
  clear(host: HTMLElement | null): void {
    this.mute?.dispose();
    this.mute = null;
    host?.replaceChildren();
  }
}
