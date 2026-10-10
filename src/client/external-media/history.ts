interface TextRow {
  id: string;
  key: string | null;
  render: (signal: AbortSignal) => HTMLElement;
}
/** Retain unchanged text DOM so a new message does not reload a live iframe.
 * Changed/deleted rows and navigation abort their own provider resources. */
export class ExternalTextHistory {
  private readonly held = new Map<
    string,
    { key: string; row: HTMLElement; stop: AbortController }
  >();
  clear(): void {
    for (const value of this.held.values()) value.stop.abort();
    this.held.clear();
  }
  render(host: HTMLElement, rows: TextRow[], signal: AbortSignal): void {
    const keys = new Map(rows.map((row) => [row.id, row.key]));
    for (const [id, value] of this.held)
      if (keys.get(id) !== value.key || !host.contains(value.row)) {
        value.stop.abort();
        value.row.remove();
        this.held.delete(id);
      }
    const retained = new Set([...this.held.values()].map((value) => value.row));
    for (const child of [...host.children])
      if (!retained.has(child as HTMLElement)) child.remove();
    let cursor = host.firstChild;
    for (const item of rows) {
      const value = this.held.get(item.id);
      const row = value?.row ?? this.create(item, signal);
      if (cursor === row) cursor = row.nextSibling;
      else host.insertBefore(row, cursor);
    }
  }
  private create(item: TextRow, signal: AbortSignal): HTMLElement {
    if (item.key === null) return item.render(signal);
    const stop = new AbortController();
    const row = item.render(AbortSignal.any([signal, stop.signal]));
    this.held.set(item.id, { key: item.key, row, stop });
    return row;
  }
}
