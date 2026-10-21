import { MessageStorageError } from '../message-storage/index.ts';
import { canonical } from '../../shared/devices/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import type { Api, MessageItem } from './history.ts';
import { readBackupWindow } from './backup-window.ts';

/** One SDK lease and one ciphertext window (<=32 packets / server byte bound).
 * Peers share transport batches; a failed peer cannot acknowledge another peer.
 * Ciphertexts are released before fetching the next bounded window. */
interface TurnPorts<T> {
  api: Api;
  guard: () => void;
  open: () => Promise<MessageCrypto>;
  cache: (snapshot: unknown, item: MessageItem) => Promise<T | null>;
}
export class MessageReceiveTurn<T> {
  private readonly ports: TurnPorts<T>;
  private machine: MessageCrypto | null = null;
  private packets = new Map<string, unknown>();
  private unavailable = new Map<string, number>();
  private keys: unknown[] = [];
  private cached = new Map<string, T>();
  private failures = new Map<string, unknown>();
  private receipts = new Map<string, { id: string; hash: string }>();
  private snapshot: unknown = null;
  constructor(ports: TurnPorts<T>) {
    this.ports = ports;
  }
  async prepare(snapshot: unknown, items: MessageItem[]): Promise<number> {
    await this.flush();
    this.snapshot = snapshot;
    this.cached.clear();
    this.failures.clear();
    this.packets.clear();
    this.unavailable.clear();
    this.keys = [];
    const window = items.slice(0, 32),
      missing: MessageItem[] = [];
    for (const item of window) {
      const cached = await this.cachedItem(snapshot, item);
      if (cached) this.cached.set(item.id, cached);
      else if (!this.failures.has(item.id)) missing.push(item);
    }
    this.ports.guard();
    if (!missing.length) return window.length;
    const ids = missing.map((item) => item.id);
    const response = readBackupWindow(
      await this.ports.api('backup-window', { snapshot, ids }),
      ids,
    );
    this.packets = response.packets;
    this.unavailable = response.unavailable;
    this.keys = [...response.keys.values()];
    // The server may shorten the batch to its byte budget. Leave its suffix
    // for the next turn/window rather than accumulating several responses.
    const firstUnread = missing[response.count];
    return firstUnread ? window.indexOf(firstUnread) : window.length;
  }
  cachedView(id: string): T | null {
    if (this.failures.has(id)) throw this.failures.get(id);
    return this.cached.get(id) ?? null;
  }
  private async cachedItem(
    snapshot: unknown,
    item: MessageItem,
  ): Promise<T | null> {
    try {
      return await this.ports.cache(snapshot, item);
    } catch (error: unknown) {
      this.ports.guard();
      if (error instanceof MessageStorageError) throw error;
      this.failures.set(item.id, error);
      return null;
    }
  }
  async sdk(): Promise<MessageCrypto> {
    this.machine ??= await this.ports.open();
    return this.machine;
  }
  readonly api: Api = (operation, data) => {
    this.ports.guard();
    if (operation === 'backup-window')
      return Promise.resolve(this.window(data));
    if (operation === 'backup-ack') {
      this.checkSnapshot(data['snapshot']);
      const items = data['items'] as { id: string; hash: string }[];
      for (const item of items) this.receipts.set(item.id, item);
      return Promise.resolve();
    }
    return this.ports.api(operation, data);
  };
  private checkSnapshot(snapshot: unknown): void {
    if (canonical(snapshot) !== canonical(this.snapshot))
      throw new Error('Receive batch belongs to another cut.');
  }
  private window(data: Record<string, unknown>) {
    this.checkSnapshot(data['snapshot']);
    const ids = data['ids'] as string[];
    const rows = ids.map((id) => {
      if (this.packets.has(id)) return { id, packet: this.packets.get(id) };
      const unavailable = this.unavailable.get(id);
      if (unavailable === undefined)
        throw new Error('Packet outside the bounded receive window.');
      return { id, unavailable };
    });
    return { rows, recovery: this.keys };
  }
  async flush(): Promise<void> {
    if (!this.receipts.size) return;
    this.ports.guard();
    await this.ports.api('backup-ack', {
      snapshot: this.snapshot,
      items: [...this.receipts.values()],
    });
    this.receipts.clear();
  }
  close(): void {
    this.machine?.close();
  }
}
