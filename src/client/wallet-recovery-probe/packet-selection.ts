import {
  ProbeError,
  checkProbeIdentity,
  maxPacketBytes,
  parseProbePacket,
  readProbePacket,
} from './index.ts';
import type { ProbePacket } from './index.ts';

type PacketSource =
  { kind: 'created' | 'local' } | { kind: 'file'; name: string };
export interface ProbeTarget {
  packet: ProbePacket;
  source: PacketSource;
}
interface SelectionOptions {
  origin: string;
  persist: (packet: ProbePacket) => void;
}

/** One explicit recovery target. A new file invalidates the previous target
 * before any asynchronous read, including when that read or validation fails.
 * Previously persisted ciphertext is preserved until a valid replacement saves.
 */
export class ProbePacketSelection {
  private target: ProbeTarget | null = null;
  private readonly options: SelectionOptions;
  constructor(options: SelectionOptions) {
    this.options = options;
  }
  get active(): ProbeTarget | null {
    return this.target;
  }
  clear(): void {
    this.target = null;
  }
  requireTarget(): ProbeTarget {
    if (!this.target)
      throw new ProbeError(
        'Nenhum pacote ativo. Importe um arquivo válido ou crie um ensaio.',
      );
    return this.target;
  }
  private validated(packet: ProbePacket): ProbePacket {
    const parsed = parseProbePacket(packet);
    checkProbeIdentity({
      packet: parsed,
      origin: this.options.origin,
      identity: parsed.context,
    });
    return parsed;
  }
  restore(text: string): void {
    this.target = {
      packet: this.validated(readProbePacket(text)),
      source: { kind: 'local' },
    };
  }
  private publish(packet: ProbePacket, source: PacketSource): void {
    const parsed = this.validated(packet);
    this.options.persist(parsed);
    this.target = { packet: parsed, source };
  }
  created(packet: ProbePacket): void {
    this.publish(packet, { kind: 'created' });
  }
  async importFile(
    file: Pick<File, 'name' | 'size' | 'text'>,
    current: () => void,
  ): Promise<ProbeTarget> {
    this.clear();
    if (file.size > maxPacketBytes)
      throw new ProbeError(
        'O arquivo do ensaio deve ter até 4 KiB. Nenhum pacote está ativo.',
      );
    const text = await file.text();
    current();
    this.publish(readProbePacket(text), {
      kind: 'file',
      name: file.name.slice(0, 160).replace(/[\p{Cc}\p{Cf}]/gu, ' '),
    });
    return this.requireTarget();
  }
}
