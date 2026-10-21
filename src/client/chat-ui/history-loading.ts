/** Presentation only. A closed authority gate still hides unverified history,
 * but routine revalidation must not announce another initial load. Keep only
 * the current selection; session replacement resets it explicitly. */
export class ChatHistoryLoading {
  private conversation: string | null = null;
  private loaded = false;

  reset(): void {
    this.conversation = null;
    this.loaded = false;
  }

  update(input: { conversation: string | null; ready: boolean }): boolean {
    if (input.conversation !== this.conversation) {
      this.conversation = input.conversation;
      this.loaded = false;
    }
    this.loaded ||= input.ready;
    return this.conversation !== null && !this.loaded;
  }
}
