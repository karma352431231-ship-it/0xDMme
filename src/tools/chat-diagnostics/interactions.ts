/** Anonymous DOM slots distinguish repeated clicks from conversation switches.
 * Never read row text, account IDs, wallets or data-conversation attributes. */
export class ConversationInteractions {
  private readonly slots = new WeakMap<Element, number>();
  private sequence = 0;
  read(
    target: EventTarget | null,
  ): Record<string, string | number | boolean> | null {
    if (!(target instanceof Element)) return null;
    const row = target.closest('.conversation-row');
    if (row) {
      let slot = this.slots.get(row);
      if (slot === undefined) {
        slot = ++this.sequence;
        this.slots.set(row, slot);
      }
      return {
        category: 'conversation-open',
        slot,
        alreadySelected: row.getAttribute('aria-pressed') === 'true',
      };
    }
    for (const [selector, category] of [
      ['[data-message-refresh]', 'manual-sync'],
      ['[data-chat-back]', 'conversation-back'],
      ['[data-message-older], [data-group-older]', 'older-messages'],
      ['[data-call-start], .call-actions button', 'call-control'],
    ] as const)
      if (target.closest(selector)) return { category };
    return null;
  }
}
