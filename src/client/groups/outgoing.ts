import type { TextDraft } from '../text-send/index.ts';

export interface PendingGroupText {
  id: string;
  groupId: string;
  text: string;
  createdAt: number;
  failed: boolean;
  /** When the server accepted it; null while it is still unsent. */
  accepted: number | null;
}

/** Accepted texts a group may hold before its owner asks for a readback. */
const crowdedGroup = 32;
/** Accepted texts held across all groups; the oldest beyond it are dropped. */
const acceptedLimit = 128;

/** Own group texts shown from the moment they are typed until a verified read
 * settles them. An accepted text needs no readback of its own: it stays shown
 * after the acceptance and the next verified read of the group's latest window
 * decides, by message ID, whether it is in the history. That read is started
 * by a live hint, a reconnect, the periodic tick or opening the group, never by
 * the send. Rows carry no delivery claim beyond one check, are never offered
 * actions, and disappear with the session. */
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
        accepted: null,
      });
      return;
    }
    const held = this.held.get(draft.id);
    if (held) held.failed = phase === 'save-failed';
  }
  /** The server accepted the draft with this ID at `at` (performance time).
   * Only an accepted text whose group is not open can be dropped, by the
   * global bound; that group's verified read shows it when opened. */
  accepted(id: string, at: number, open: string | null): void {
    const held = this.held.get(id);
    if (!held) return;
    held.accepted = at;
    let excess =
      [...this.held.values()].filter((text) => text.accepted !== null).length -
      acceptedLimit;
    for (const text of this.held.values()) {
      if (excess <= 0) return;
      if (text.accepted === null || text.groupId === open) continue;
      this.held.delete(text.id);
      excess--;
    }
  }
  /** True when the group holds enough accepted texts that its owner should
   * request a readback instead of waiting for the next hint. */
  crowded(groupId: string): boolean {
    let count = 0;
    for (const text of this.held.values())
      if (text.groupId === groupId && text.accepted !== null) count++;
    return count >= crowdedGroup;
  }
  /** A verified read of the group's latest window, started at `started`,
   * completed with these message IDs. A text it contains is settled; a text
   * accepted before the read started that it lacks was deleted or left the
   * window, and the verified history decides. Unsent texts stay. */
  verified(
    groupId: string,
    ids: ReadonlySet<string>,
    started: number,
  ): { settled: string[]; retired: string[] } {
    const settled: string[] = [],
      retired: string[] = [];
    for (const text of this.held.values()) {
      if (text.groupId !== groupId) continue;
      if (ids.has(text.id)) settled.push(text.id);
      else if (text.accepted !== null && text.accepted < started)
        retired.push(text.id);
    }
    for (const id of [...settled, ...retired]) this.held.delete(id);
    return { settled, retired };
  }
  /** The group's texts the shown history does not contain. Only `verified`
   * forgets texts, so a drawing of an older page or a cached copy does not. */
  rows(groupId: string, shown: ReadonlySet<string>): PendingGroupText[] {
    return [...this.held.values()]
      .filter((text) => text.groupId === groupId && !shown.has(text.id))
      .sort((a, b) => a.createdAt - b.createdAt);
  }
  clear(): void {
    this.held.clear();
  }
}
