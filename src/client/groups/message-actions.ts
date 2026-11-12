import { t } from '../../shared/i18n/index.ts';
import type { Peer } from '../../shared/contacts/index.ts';
import { messageActions } from '../message-actions/index.ts';
import type { EmojiPicker } from '../emoji/index.ts';
import type { GroupMessageView } from './message-content.ts';
import { groupMessageView } from './message-content.ts';
import type { GroupView } from './reader.ts';

export interface GroupMessageActions {
  run: (work: () => Promise<void>) => Promise<void>;
  choose: (mode: 'reply' | 'edit', view: GroupView) => void;
  remove: (view: GroupView) => Promise<void>;
  react: (view: GroupView, emoji: string) => Promise<void>;
  picker: Pick<EmojiPicker, 'choose'>;
  peers: () => readonly Peer[];
  writable: () => boolean;
  forward: (view: GroupView) => void;
  forwardAllowed: () => boolean;
  canPin: () => boolean;
  pin: (view: GroupView, until: number) => Promise<void>;
  /** The person's own star of a message, when stars are available. */
  star?: (
    view: GroupView,
  ) => { starred: boolean; toggle: () => Promise<void> } | undefined;
}
/** The group supplies capabilities; the shared menu owns gestures and disposal. */
export function groupMessageActions(input: {
  view: GroupView;
  signal: AbortSignal;
  row: HTMLElement;
  actions: GroupMessageActions;
}): HTMLElement {
  const { view, signal, row, actions } = input;
  const writable = actions.writable(),
    projected = groupMessageView(view);
  return messageActions<GroupMessageView>({
    signal,
    row,
    removeLabel: t('Delete for everyone'),
    view: { ...projected, archived: projected.archived || !writable },
    peers: actions.peers(),
    picker: actions.picker,
    replyAllowed: writable,
    choose: actions.choose,
    react: actions.react,
    forward: actions.forward,
    forwardAllowed: actions.forwardAllowed(),
    action: (label, work) =>
      actionButton(label, () => {
        void actions.run(work);
      }),
    ...(view.own && !view.localOnly && writable
      ? { remove: () => actions.remove(view) }
      : {}),
    ...(writable && actions.canPin()
      ? { pin: (until: number) => actions.pin(view, until) }
      : {}),
    ...groupStar(view, writable, actions),
  });
}
function groupStar(
  view: GroupView,
  writable: boolean,
  actions: GroupMessageActions,
): { star?: { starred: boolean; toggle: () => Promise<void> } } {
  const star = writable ? actions.star?.(view) : undefined;
  return star ? { star } : {};
}
function actionButton(label: string, work: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', work);
  return button;
}
