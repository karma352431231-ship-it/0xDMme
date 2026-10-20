export interface ReceiptWindow {
  peer: string;
  incoming: string[];
  outgoing: string[];
  current: () => boolean;
}
type ReceiptApi = (
  operation: string,
  payload: Record<string, unknown>,
) => Promise<unknown>;

function parseReceipts(raw: unknown): Set<string> {
  if (!Array.isArray(raw) || raw.length > 16)
    throw new Error('Invalid confirmations.');
  return new Set(raw.map((value) => String(value)));
}

/** The same visible window must still exist after waiting for authority and
 * after its read acknowledgement, before requesting or projecting receipts. */
export async function readConversationReceipts(
  input: ReceiptWindow & { api: ReceiptApi },
): Promise<Set<string> | null> {
  if (!input.current()) return null;
  if (input.incoming.length)
    await input.api('daily-read', { peer: input.peer, ids: input.incoming });
  if (!input.current()) return null;
  const receipts = input.outgoing.length
    ? parseReceipts(await input.api('daily-receipts', { ids: input.outgoing }))
    : new Set<string>();
  return input.current() ? receipts : null;
}
