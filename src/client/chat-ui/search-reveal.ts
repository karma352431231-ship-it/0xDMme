/** Older pages read while looking for a match before handing over to the reader. */
const revealPageLimit = 24;

export interface RevealPorts {
  /** The rendered row of a message in the open conversation, if any. */
  row: (id: string) => HTMLElement | null;
  older: { available: () => boolean; load: () => Promise<boolean> };
  /** False once the reader left this conversation. */
  valid: () => boolean;
}

/**
 * Brings a search match into the open conversation: reads older pages until
 * its row renders, then centers and marks it. Resolves false when the match
 * is still further back, the conversation changed or no older page loaded.
 */
export async function revealMessage(
  id: string,
  ports: RevealPorts,
): Promise<boolean> {
  for (let page = 0; ports.valid(); page++) {
    const row = ports.row(id);
    if (row) {
      markMatch(row);
      return true;
    }
    if (page >= revealPageLimit || !ports.older.available()) return false;
    if (!(await ports.older.load())) return false;
  }
  return false;
}

function markMatch(row: HTMLElement): void {
  row.classList.remove('search-match');
  // Restart the highlight when the same row is revealed twice.
  void row.offsetWidth;
  row.classList.add('search-match');
  row.addEventListener(
    'animationend',
    () => row.classList.remove('search-match'),
    { once: true },
  );
  row.scrollIntoView({ block: 'center' });
}
