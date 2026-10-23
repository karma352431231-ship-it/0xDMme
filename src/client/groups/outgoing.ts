import type { TextDraft } from '../text-send/index.ts';

export interface PendingGroupText {
  id: string;
  groupId: string;
  text: string;
  createdAt: number;
  failed: boolean;
}

/** Own group texts shown from the moment they are typed until the verified
 * history contains the same message ID. They carry no delivery claim beyond
 * one check, are never offered actions, and disappear with the session. */
export class GroupOutgoing {
  private readonly held = new Map<string, PendingGroupText>();
  update(draft: TextDraft, phase: 'admitted' | 'saved' | 'save-failed'): void {
    if (phase === 'admitted') {
      this.held.set(draft.id, {
        id: draft.id,
        groupId: draft.peer,
        text: draft.text,
        createdAt: draft.createdAt ?? Date.now(),
        failed: false,
      });
      return;
    }
    const held = this.held.get(draft.id);
    if (held) held.failed = phase === 'save-failed';
  }
  /** The group's texts the verified history does not contain yet. */
  rows(groupId: string, confirmed: ReadonlySet<string>): PendingGroupText[] {
    for (const id of confirmed) this.held.delete(id);
    return [...this.held.values()]
      .filter((text) => text.groupId === groupId)
      .sort((a, b) => a.createdAt - b.createdAt);
  }
  clear(): void {
    this.held.clear();
  }
}
