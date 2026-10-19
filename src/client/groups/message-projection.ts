import type { GroupView } from './reader.ts';
/** Only authenticated actions can replace a root's visible text. The immutable
 * original hash/author stay available for later edits and deletion proofs. */
export function projectGroupMessages(
  previous: GroupView[],
  changes: GroupView[],
): GroupView[] {
  const views = new Map(previous.map((view) => [view.id, view]));
  for (const view of changes.filter(
    (row) => !row.relation && row.kind !== 'profile',
  )) {
    views.set(view.id, preserveEdit(view, views.get(view.id)));
  }
  for (const edit of changes.filter((row) => row.relation))
    applyEdit(views, edit);
  const result = [...views.values()]
    .sort((a, b) => a.sequence - b.sequence)
    .slice(-16);
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
