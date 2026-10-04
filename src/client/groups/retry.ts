/** Same three automatic attempts, one minute apart, as individual outboxes. */
export class GroupRetry {
  private readonly attempts = new Map<string, { count: number; at: number }>();
  take(group: string, now = Date.now()): boolean {
    const previous = this.attempts.get(group);
    if (previous && (previous.count >= 3 || now - previous.at < 60_000))
      return false;
    this.attempts.set(group, { count: (previous?.count ?? 0) + 1, at: now });
    return true;
  }
  reset(group: string): void {
    this.attempts.delete(group);
  }
  clear(): void {
    this.attempts.clear();
  }
}
