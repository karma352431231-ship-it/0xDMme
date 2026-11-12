import { decodeGroupText } from '../../shared/group-messages/index.ts';
import { attachmentContent } from '../../shared/attachments/index.ts';
import type { DailyView } from '../daily-text/index.ts';
import type { GroupView } from './reader.ts';
export type GroupMessageView = GroupView & {
  peer: string;
  author: string;
  archived: boolean;
};
export function groupMessageView(view: GroupView): DailyView<GroupMessageView> {
  const text =
    view.kind === 'attachment'
      ? attachmentContent(JSON.parse(view.text) as unknown).caption
      : view.text;
  const states = Object.values(view.reactionStates ?? {});
  return {
    ...view,
    peer: view.groupId,
    author: view.sender,
    archived: !!view.localOnly,
    content:
      view.contentFormat === 'daily'
        ? decodeGroupText(text)
        : { text, reply: null, forwarded: false },
    edited: view.edited ?? false,
    reactions: states.map((r) => r.emoji).filter(Boolean),
    ownReaction: states.find((r) => r.own)?.emoji ?? '',
    pin: view.pinState ?? null,
  };
}
