import { communityElement as el } from './elements.ts';

export type ManageGroup = 'general' | 'tags' | 'moderation' | 'ownership';
const titles: Record<ManageGroup, string> = {
  general: 'Geral',
  tags: 'Tags',
  moderation: 'Moderação',
  ownership: 'Propriedade',
};
// Saving re-renders the whole screen; the open tab survives that redraw.
let openGroup: ManageGroup = 'general';

/**
 * Community settings as tabs: one group of cards at a time instead of one
 * long page. Returns the container of each requested group.
 */
export function manageGroups(
  host: HTMLElement,
  groups: readonly ManageGroup[],
): Record<ManageGroup, HTMLElement> {
  const tabs = el('nav', '', 'community-manage-tabs'),
    panels = {} as Record<ManageGroup, HTMLElement>;
  tabs.setAttribute('aria-label', 'Seções da configuração');
  if (!groups.includes(openGroup)) openGroup = 'general';
  const buttons = groups.map((group) => {
    const button = el('button', titles[group]),
      panel = el('div', '', 'community-manage-panel');
    button.type = 'button';
    panels[group] = panel;
    button.addEventListener('click', () => {
      openGroup = group;
      show();
    });
    tabs.append(button);
    return [group, button, panel] as const;
  });
  function show(): void {
    for (const [group, button, panel] of buttons) {
      button.setAttribute('aria-pressed', String(group === openGroup));
      panel.hidden = group !== openGroup;
    }
  }
  host.append(tabs, ...buttons.map(([, , panel]) => panel));
  show();
  // Groups not offered to this role still get a detached container.
  for (const group of Object.keys(titles) as ManageGroup[])
    panels[group] ??= el('div');
  return panels;
}
