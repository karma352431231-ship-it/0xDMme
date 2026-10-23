/** The single owner of a group's verified readback. Live content hints and
 * the request after an accepted send share it: while a read runs, any further
 * requests for that group cost one more read when it ends, so a change that
 * arrived during the read is still covered and no two reads overlap. */
export class GroupReconciliation {
  private readonly reads = new Map<
    string,
    { running: Promise<void>; again: boolean }
  >();
  private readonly read: (groupId: string) => Promise<void>;
  constructor(read: (groupId: string) => Promise<void>) {
    this.read = read;
  }
  /** Settles once a read that started after this request has finished. */
  request(groupId: string): Promise<void> {
    const current = this.reads.get(groupId);
    if (current) {
      current.again = true;
      return current.running;
    }
    const state = { running: Promise.resolve(), again: false };
    state.running = this.loop(groupId, state);
    this.reads.set(groupId, state);
    return state.running;
  }
  private async loop(
    groupId: string,
    state: { again: boolean },
  ): Promise<void> {
    try {
      do {
        state.again = false;
        await this.read(groupId);
      } while (state.again);
    } finally {
      this.reads.delete(groupId);
    }
  }
}
