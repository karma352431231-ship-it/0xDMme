import { mentionQuery } from '../../shared/public-mentions/index.ts';
export function publicSearchQuery(value: string): string {
  const query = value.trim().replace(/^@/u, '');
  if (query.length < 2) return '';
  return mentionQuery(query);
}
/** Latest-query lifetime applies both to text changes and closing/navigation. */
export class PublicSearchRequests<T> {
  private readonly load: (query: string, signal: AbortSignal) => Promise<T>;
  private abort = new AbortController();
  constructor(load: (query: string, signal: AbortSignal) => Promise<T>) {
    this.load = load;
  }
  close(): void {
    this.abort.abort();
  }
  async search(query: string): Promise<T | null> {
    this.close();
    this.abort = new AbortController();
    const signal = this.abort.signal;
    try {
      const result = await this.load(query, signal);
      return signal.aborted ? null : result;
    } catch (error: unknown) {
      if (signal.aborted) return null;
      throw error;
    }
  }
}
