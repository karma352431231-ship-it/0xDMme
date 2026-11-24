import { t } from '../../shared/i18n/index.ts';
import { stickerLink } from '../../shared/stickers/index.ts';
import { pingStickerPoses } from '../ping/index.ts';
import type { PingStickerPose } from '../ping/index.ts';

/** The Ping pack (stage 1, 24/11/2026): drawn by the app, nothing to fetch. */
export function pingStickerName(pose: PingStickerPose): string {
  const names: Record<PingStickerPose, string> = {
    hi: t('Hi'),
    love: t('Love'),
    lol: t('LOL'),
    thumbs: t('Thumbs up'),
    sad: t('Sad'),
    angry: t('Angry'),
    wow: t('Wow'),
    thinking: t('Thinking'),
    cool: t('Cool'),
    party: t('Party'),
    gm: t('GM'),
    moon: t('To the moon'),
    sleepy: t('Sleepy'),
    typing: t('Typing'),
    wink: t('Wink'),
    salute: t('Salute'),
  };
  return names[pose];
}

export function pingPose(id: string): PingStickerPose | null {
  return (pingStickerPoses as readonly string[]).includes(id)
    ? (id as PingStickerPose)
    : null;
}

export function pingPackLinks(): string[] {
  return pingStickerPoses.map((pose) => stickerLink('ping', pose));
}
