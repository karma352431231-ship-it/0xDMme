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
    views.set(view.id, preserveEdit(view, views.get(view.id)));
  }
  for (const edit of changes.filter((row) => row.relation))
    applyEdit(views, edit);
  const result = windowRoots(
    [...views.values()].sort((a, b) => a.sequence - b.sequence),
    floor,
    (view) => view.sequence,
  );
  let bytes = result.reduce(
    (total, view) => total + view.text.length * 2 + 1024,
    0,
  );
  while (result.length > 1 && bytes > 8 * 1024 * 1024) {
    const row = result.shift()!;
    bytes -= row.text.length * 2 + 1024;
  }
  return result;
}

function preserveEdit(view: GroupView, old: GroupView | undefined): GroupView {
  if (!old?.edited) return view;
  return {
    ...view,
    text: old.text,
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
    edit.sender !== root.sender ||
    root.kind !== 'text' ||
    root.groupId !== edit.groupId ||
    relation.type !== 'edit'
  )
    throw new Error('Edit does not match the original group message.');
  if ((root.editedSequence ?? 0) >= edit.sequence) return;
  views.set(root.id, {
    ...root,
    text: edit.text,
    edited: true,
    editedSequence: edit.sequence,
  });
}
