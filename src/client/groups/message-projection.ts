import { messageContentFormat } from '../../shared/message-presentation/index.ts';
import { decodeDailyText, validReaction } from '../../shared/daily/index.ts';
import type { GroupView } from './reader.ts';
import { windowRoots } from '../history-window/index.ts';
import type { HistoryFloor } from '../history-window/index.ts';
/** Only authenticated actions can replace a root's visible text. The immutable
 * original hash/author stay available for later edits and deletion proofs. The
 * window keeps the group's floor (history-window). */
export function projectGroupMessages(
  previous: GroupView[],
  changes: GroupView[],
  floor: HistoryFloor = null,
): GroupView[] {
  const views = new Map(previous.map((view) => [view.id, view]));
  for (const view of changes.filter(
    (row) => !row.relation && row.kind !== 'profile',
  )) {
    const old = views.get(view.id),
      root = preserveEdit(view, old);
    views.set(
      view.id,
      old?.reactionStates
        ? { ...root, reactionStates: old.reactionStates }
        : root,
    );
  }
  for (const edit of changes.filter((row) => row.relation))
    applyEdit(views, edit);
  const result = windowRoots(
    [...views.values()].sort((a, b) => a.sequence - b.sequence),
    floor,
    (view) => view.sequence,
  );
  let bytes = result.reduce((total, view) => total + groupViewBytes(view), 0);
  while (result.length > 1 && bytes > 8 * 1024 * 1024) {
    const row = result.shift()!;
    bytes -= groupViewBytes(row);
  }
  return result;
}

function preserveEdit(view: GroupView, old: GroupView | undefined): GroupView {
  if (!old?.edited) return view;
  return {
    ...editedText(view, old),
    edited: true,
    ...(old.editedSequence === undefined
      ? {}
      : { editedSequence: old.editedSequence }),
  };
}
function applyEdit(views: Map<string, GroupView>, edit: GroupView): void {
  const relation = edit.relation!,
    root = views.get(relation.id);
  if (!root) return;
  if (
    root.hash !== relation.hash ||
    root.sender !== relation.author ||
    root.groupId !== edit.groupId
  )
    throw new Error('Edit does not match the original group message.');
  if (relation.type === 'reaction') {
    views.set(root.id, applyReaction(root, edit));
    return;
  }
  if (edit.sender !== root.sender || root.kind !== 'text')
    throw new Error('Edit does not match the original group message.');
  if ((root.editedSequence ?? 0) >= edit.sequence) return;
  views.set(root.id, {
    ...editedText(root, edit),
    edited: true,
    editedSequence: edit.sequence,
  });
}

function applyReaction(root: GroupView, action: GroupView): GroupView {
  const emoji = decodeDailyText(action.text).text;
  if (!validReaction(emoji)) throw new Error('Invalid reaction.');
  const previous = root.reactionStates?.[action.sender];
  if (previous && previous.sequence >= action.sequence) return root;
  return {
    ...root,
    reactionStates: {
      ...root.reactionStates,
      [action.sender]: { emoji, sequence: action.sequence, own: action.own },
    },
  };
}

function editedText(root: GroupView, edit: GroupView): GroupView {
  const { contentFormat, ...identity } = root;
  void contentFormat;
  return {
    ...identity,
    text: edit.text,
    ...messageContentFormat(edit.contentFormat),
  };
}

export function groupViewBytes(view: GroupView): number {
  return (
    view.text.length * 2 +
    JSON.stringify(view.reactionStates ?? {}).length * 2 +
    1024
  );
}
