/** Desktop panel arrangement (docs/UI_PAINEIS_E_TEMAS.md); a device-only preference. */
export const layoutPreferenceKey = '0xdmme:layout';
export const panelLayouts = ['all', 'nochat', 'solo'] as const;
/** all: Contatos | Conversa | Feed · nochat: Contatos | Feed · solo: Contatos | Conversa. */
export type PanelLayout = (typeof panelLayouts)[number];

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function storedLayout(storage: PreferenceStorage): PanelLayout {
  try {
    const value = storage.getItem(layoutPreferenceKey);
    return panelLayouts.find((layout) => layout === value) ?? 'all';
  } catch {
    return 'all';
  }
}

/** Opening any conversation brings the chat column back; the feed stays as chosen. */
export function withChat(layout: PanelLayout): PanelLayout {
  return layout === 'nochat' ? 'all' : layout;
}

/** The “Conversa ao lado” toggle only switches the chat column. */
export function toggledChat(layout: PanelLayout): PanelLayout {
  return layout === 'nochat' ? 'all' : 'nochat';
}

export type CommunityTarget =
  | { kind: 'dm'; id: string | null; local: boolean }
  | { kind: 'feed'; params: URLSearchParams };

/** Reads in-app community links so panels can open them without leaving the workspace. */
export function communityTarget(href: string): CommunityTarget | null {
  const [path, query = ''] = href.split('?');
  if (path !== '#comunidades') return null;
  const params = new URLSearchParams(query);
  if (params.get('view') === 'dms')
    return {
      kind: 'dm',
      id: params.get('dm'),
      local: params.get('history') === 'local',
    };
  return { kind: 'feed', params };
}
