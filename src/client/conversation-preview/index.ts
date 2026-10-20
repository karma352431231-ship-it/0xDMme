import { t } from '../../shared/i18n/index.ts';
import { animatedAttachmentContent } from '../../shared/attachments/index.ts';
import { checksIcon, messageChecks } from '../message-status/index.ts';
import type { DeliveryState } from '../message-status/index.ts';
import type { ConversationPreview } from './loader.ts';
import { messageTime } from '../message-presentation/index.ts';
export { ConversationPreviewLoader } from './loader.ts';
export type { ConversationPreview } from './loader.ts';
/** Projection only: callers provide a verified original and its current edited text. */
export function conversationPreview(input: {
  id: string;
  sequence?: number;
  kind: string;
  text: string;
  displayText: string;
  own: boolean;
  sentAt?: number;
  delivery?: DeliveryState;
  read?: boolean;
}): ConversationPreview {
  return {
    id: input.id,
    sequence: input.sequence ?? 0,
    text: previewText(input).replace(/\s+/gu, ' ').slice(0, 160),
    own: input.own,
    read: input.read ?? false,
    ...(input.sentAt === undefined ? {} : { sentAt: input.sentAt }),
    ...(input.delivery ? { delivery: input.delivery } : {}),
  };
}
function previewText(input: {
  kind: string;
  text: string;
  displayText: string;
}): string {
  if (input.kind === 'text') return input.displayText;
  const media = animatedAttachmentContent(JSON.parse(input.text) as unknown);
  const label = media.voice
    ? t('preview.audio')
    : media.image
      ? t('Photo')
      : media.name;
  return input.displayText ? `${label} · ${input.displayText}` : label;
}
/** The list never acknowledges incoming messages as read. Checks belong only to sent previews. */
export function paintConversationPreview(
  copy: HTMLElement,
  preview: ConversationPreview,
): void {
  const detail = copy.querySelector('small');
  if (!detail) return;
  detail.replaceChildren();
  const checks = messageChecks(preview);
  if (checks) detail.append(checksIcon(checks));
  const text = document.createElement('span');
  text.textContent = preview.text;
  detail.append(text);
  copy.querySelector('.conversation-time')?.remove();
  const time = messageTime(preview.sentAt);
  if (time) {
    time.className = 'conversation-time';
    copy.append(time);
  }
}
