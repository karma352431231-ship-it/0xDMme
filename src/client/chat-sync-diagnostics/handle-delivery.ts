import type {
  HandleDeliveryStage,
  HandleDiagnosticFields,
} from '../../shared/chat-sync-diagnostics/handle.ts';

export type HandleDeliveryPoint = Exclude<
  HandleDeliveryStage,
  'paired' | 'pair-unavailable' | 'linked' | 'overflow'
>;
type Emit = (fields: HandleDiagnosticFields & { message?: number }) => void;
interface MessageTiming {
  slot: number;
  points: Set<HandleDeliveryPoint>;
  read?: number;
}
const maximum = 128;
const entryStages = new Set<HandleDeliveryPoint>(['submit', 'downloaded']);

/** One capture owns opaque message slots and the optional, ephemeral HMAC key.
 * Tags join two explicitly paired reports without publishing the message ID. */
export class HandleDeliveryCapture {
  private readonly messages = new Map<string, MessageTiming>();
  private key: Promise<CryptoKey> | null = null;
  private ended = false;
  private overflow = false;
  private keyReady = false;
  private readonly emit: Emit;
  constructor(emit: Emit) {
    this.emit = emit;
  }

  pair(code: string): void {
    if (this.ended || this.key) return;
    if (!globalThis.crypto?.subtle) {
      this.emit({ handleStage: 'pair-unavailable' });
      return;
    }
    const key = crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(code),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    this.key = key;
    void key.then(
      () => {
        if (this.ended) return;
        this.keyReady = true;
        this.fingerprint(key);
        for (const [id, row] of this.messages) this.link(key, id, row.slot);
      },
      () => this.unavailable(),
    );
  }

  mark(
    id: string,
    stage: HandleDeliveryPoint,
    read?: number,
    senderMessage?: number,
  ): boolean {
    if (this.ended) return false;
    const row =
      this.messages.get(id) ??
      (entryStages.has(stage) ? this.add(id) : undefined);
    if (!row || row.points.has(stage)) return false;
    row.points.add(stage);
    if (read !== undefined) row.read ??= read;
    this.emit({
      handleStage: stage,
      message: row.slot,
      ...(senderMessage ? { senderMessage } : {}),
      ...(row.read ? { handleRead: row.read } : {}),
    });
    return true;
  }

  private add(id: string): MessageTiming | undefined {
    if (this.messages.size === maximum) {
      if (!this.overflow) this.emit({ handleStage: 'overflow' });
      this.overflow = true;
      return;
    }
    const row = {
      slot: this.messages.size + 1,
      points: new Set<HandleDeliveryPoint>(),
    };
    this.messages.set(id, row);
    if (this.keyReady && this.key) this.link(this.key, id, row.slot);
    return row;
  }
  private fingerprint(key: Promise<CryptoKey>): void {
    void key
      .then((secret) =>
        crypto.subtle.sign(
          'HMAC',
          secret,
          new TextEncoder().encode('0xdmme-diagnostic-pair-v2'),
        ),
      )
      .then(
        (hash) => {
          if (!this.ended)
            this.emit({
              handleStage: 'paired',
              handlePairFingerprint: hexTag(hash),
            });
        },
        () => this.unavailable(),
      );
  }
  private link(key: Promise<CryptoKey>, id: string, message: number): void {
    void key
      .then((secret) =>
        crypto.subtle.sign('HMAC', secret, new TextEncoder().encode(id)),
      )
      .then(
        (hash) => {
          if (!this.ended)
            this.emit({
              handleStage: 'linked',
              message,
              handleTag: hexTag(hash),
            });
        },
        () => this.unavailable(),
      );
  }
  private unavailable(): void {
    if (!this.ended) this.emit({ handleStage: 'pair-unavailable' });
  }

  stop(): void {
    this.ended = true;
    this.messages.clear();
    this.key = null;
  }
}

function hexTag(hash: ArrayBuffer): string {
  return Array.from(new Uint8Array(hash, 0, 16), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
