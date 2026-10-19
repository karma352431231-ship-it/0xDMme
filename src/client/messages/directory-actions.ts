import { t } from '../../shared/i18n/index.ts';
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
      label: settings.archived ? t('Desarquivar') : t('Arquivar'),
      icon: settings.archived ? 'unarchive' : 'archive',
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
      label: settings.pinned ? t('Desafixar') : t('Fixar'),
      icon: settings.pinned ? 'unpin' : 'pin',
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
      label: favorite
        ? t('Remover dos favoritos')
        : t('Adicionar aos favoritos'),
      icon: favorite ? 'unfavorite' : 'favorite',
      perform: () => perform(() => daily.setFavorite(favoriteId, !favorite)),
    },
    ...(mutePeer
      ? [muteAction({ daily, settingsId, peer: mutePeer, perform })]
      : []),
  ];
}

const muteDurations = [
  ['conversation.mute-1h', 3_600_000],
  ['conversation.mute-8h', 28_800_000],
  ['conversation.mute-24h', 86_400_000],
  ['conversation.mute-7d', 604_800_000],
  ['conversation.mute-forever', Number.MAX_SAFE_INTEGER],
] as const;

/**
 * Muting moved here from Settings (16/10/2026): a muted conversation offers to
 * resume alerts; otherwise the durations open in the same menu.
 */
function muteAction(options: {
  daily: Daily;
  settingsId: string;
  peer: string;
  perform: (work: () => Promise<void>) => void;
}): ConversationAction {
  const { daily, settingsId, peer, perform } = options;
  const mute = (duration: number) =>
    perform(() => daily.mute(peer, duration, { settingsId }));
  if (daily.conversation(settingsId).mutedUntil > Date.now())
    return {
      id: 'mute',
      label: t('conversation.resume-alerts'),
      icon: 'unmute',
      perform: () => mute(0),
    };
  return {
    id: 'mute',
    label: t('conversation.mute'),
    icon: 'mute',
    perform: () => undefined,
    choices: muteDurations.map(([label, duration]) => ({
      id: `mute-${duration}`,
      label: t(label),
      icon: 'clock',
      perform: () => mute(duration),
    })),
  };
}
