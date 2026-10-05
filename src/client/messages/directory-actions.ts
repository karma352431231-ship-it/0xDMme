import type { Daily } from '../daily/index.ts';
import type { ConversationAction } from './directory.ts';

export function organizationActions(options: {
  daily: Daily;
  settingsId: string;
  favoriteId: string;
  mutePeer: string | null;
  perform: (work: () => Promise<void>) => void;
}): ConversationAction[] {
  const { daily, settingsId, favoriteId, mutePeer, perform } = options;
  const settings = daily.conversation(settingsId),
    favorite = daily.favorite(favoriteId);
  return [
    {
      id: 'archive',
      label: settings.archived ? 'Desarquivar' : 'Arquivar',
      perform: () =>
        perform(() =>
          daily.organize(
            settingsId,
            { archived: !settings.archived },
            { mutePeer },
          ),
        ),
    },
    {
      id: 'pin',
      label: settings.pinned ? 'Desafixar' : 'Fixar',
      perform: () =>
        perform(() =>
          daily.organize(
            settingsId,
            { pinned: !settings.pinned },
            { mutePeer },
          ),
        ),
    },
    {
      id: 'favorite',
      label: favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos',
      perform: () => perform(() => daily.setFavorite(favoriteId, !favorite)),
    },
  ];
}
