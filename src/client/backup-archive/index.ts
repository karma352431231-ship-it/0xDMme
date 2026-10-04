import {
  base64,
  encode,
  keys,
  object,
  uuid,
} from '../../shared/account/index.ts';
import { canonical, fingerprint } from '../../shared/devices/index.ts';
import { bytesHash, integer } from '../../shared/vault/index.ts';
import {
  backupChunk,
  backupLimit,
  backupRecordLimit,
  backupItemLimit,
  backupFrameLimit,
  backupReportLimit,
} from '../../shared/backups/index.ts';
import type { BackupTarget } from '../../shared/backups/index.ts';
import type { VaultAuthority } from '../vault-authority/index.ts';
import { openBlock, sealBlock } from '../vault-crypto/index.ts';
import {
  backupRecord,
  serializeRecord,
  deserializeRecord,
  cleanupTarget,
  recordKey,
} from '../backup-records/index.ts';
import type { BackupRecord } from '../backup-records/index.ts';
import { BackupOutput } from './output.ts';
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true });
const magic = encoder.encode('0xDMme01');
interface Header {
  version: 1;
  id: string;
  accountId: string;
  epoch: number;
  wrapped: { hash: string; bytes: number; ciphertext: string };
}
export interface RecordInfo {
  type: BackupRecord['type'];
  id: string;
  hash: string;
  start: number;
  parts: number;
  bytes: number;
  digest: string;
}
export interface BackupReport {
  version: 1;
  created: string;
  records: RecordInfo[];
  omitted: string[];
  root: string;
}
interface Frame {
  offset: number;
  length: number;
  kind: number;
}
function header(input: unknown): Header {
  const d = object(input);
  keys(d, ['version', 'id', 'accountId', 'epoch', 'wrapped']);
  const w = object(d['wrapped']);
  keys(w, ['hash', 'bytes', 'ciphertext']);
  const epoch = integer(d['epoch'], 128);
  const bytes = base64(w['ciphertext'], 256);
  if (d['version'] !== 1 || !epoch || bytes.length !== integer(w['bytes'], 256))
    throw new Error('Formato de backup não suportado.');
  return {
    version: 1,
    id: uuid(d['id']),
    accountId: uuid(d['accountId']),
    epoch,
    wrapped: {
      hash: fingerprint(w['hash']),
      bytes: bytes.length,
      ciphertext: encode(bytes),
    },
  };
}
function prefix(kind: number, length: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(5);
  bytes[0] = kind;
  new DataView(bytes.buffer).setUint32(1, length);
  return bytes;
}
function aad(h: Header, index: number, kind: number): Uint8Array<ArrayBuffer> {
  return encoder.encode(canonical(['0xdmme-backup-frame', 1, h, index, kind]));
}
async function cipher(
  key: CryptoKey,
  context: { h: Header; index: number; kind: number },
  bytes: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: aad(context.h, context.index, context.kind),
        tagLength: 128,
      },
      key,
      Uint8Array.from(bytes),
    ),
  );
  const result = new Uint8Array(12 + encrypted.length);
  result.set(iv);
  result.set(encrypted, 12);
  return result;
}
async function decipher(
  key: CryptoKey,
  context: { h: Header; index: number; kind: number },
  bytes: Uint8Array,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: Uint8Array.from(bytes.slice(0, 12)),
        additionalData: aad(context.h, context.index, context.kind),
        tagLength: 128,
      },
      key,
      Uint8Array.from(bytes.slice(12)),
    ),
  );
}
async function chain(previous: string, bytes: Uint8Array): Promise<string> {
  const before = encoder.encode(previous);
  const joined = new Uint8Array(before.length + bytes.length);
  joined.set(before);
  joined.set(bytes, before.length);
  return bytesHash(joined);
}
export class BackupWriter {
  private readonly h: Header;
  private readonly key: CryptoKey;
  private readonly output: BackupOutput;
  private readonly records: RecordInfo[] = [];
  private readonly ids = new Set<string>();
  private size = 0;
  private index = 0;
  private root = '';
  private finished = false;
  private constructor(h: Header, key: CryptoKey, output: BackupOutput) {
    this.h = h;
    this.key = key;
    this.output = output;
  }
  static async create(a: VaultAuthority): Promise<BackupWriter> {
    const id = crypto.randomUUID(),
      raw = crypto.getRandomValues(new Uint8Array(32));
    try {
      const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
        'encrypt',
        'decrypt',
      ]);
      const wrapped = await sealBlock(
        await a.key(a.epoch),
        { accountId: a.session.accountId, id, epoch: a.epoch },
        encode(raw),
      );
      const h: Header = {
        version: 1,
        id,
        accountId: a.session.accountId,
        epoch: a.epoch,
        wrapped: {
          hash: await bytesHash(wrapped),
          bytes: wrapped.length,
          ciphertext: encode(wrapped),
        },
      };
      const result = new BackupWriter(h, key, await BackupOutput.create()),
        json = encoder.encode(canonical(h));
      const length = new Uint8Array(4);
      new DataView(length.buffer).setUint32(0, json.length);
      const initial = new Uint8Array(magic.length + 4 + json.length);
      initial.set(magic);
      initial.set(length, magic.length);
      initial.set(json, magic.length + 4);
      await result.output.write(initial);
      result.size = initial.length;
      result.root = await bytesHash(initial);
      return result;
    } finally {
      raw.fill(0);
    }
  }
  abort(): void {
    this.finished = true;
    void this.output.dispose().catch(() => {
      console.warn('Limpeza do arquivo temporário de backup pendente.');
    });
    this.records.length = 0;
    this.ids.clear();
  }
  async add(input: BackupRecord, guard: () => void): Promise<void> {
    guard();
    if (this.finished) throw new Error('Backup já encerrado.');
    const row = backupRecord(input),
      identity = recordKey(row);
    if (this.ids.has(identity) || this.records.length >= backupItemLimit)
      throw new Error('Registros repetidos ou seleção excedida.');
    const bytes = serializeRecord(row);
    try {
      if (bytes.length > backupRecordLimit)
        throw new Error('Registro de backup excedido.');
      const start = this.index;
      for (let offset = 0; offset < bytes.length; offset += backupChunk) {
        guard();
        await this.append(1, bytes.subarray(offset, offset + backupChunk));
      }
      this.records.push({
        type: row.type,
        id: row.id,
        hash: row.hash,
        start,
        parts: this.index - start,
        bytes: bytes.length,
        digest: await bytesHash(bytes),
      });
      this.ids.add(identity);
    } finally {
      bytes.fill(0);
    }
  }
  private async append(kind: number, bytes: Uint8Array): Promise<void> {
    if (this.index >= backupFrameLimit - 1 && kind === 1)
      throw new Error('Partes de backup excedidas.');
    const sealed = await cipher(
        this.key,
        { h: this.h, index: this.index, kind },
        bytes,
      ),
      p = prefix(kind, sealed.length);
    if (this.size + p.length + sealed.length > backupLimit)
      throw new Error('Backup excede o limite de 4 GiB por arquivo.');
    const frame = new Uint8Array(p.length + sealed.length);
    frame.set(p);
    frame.set(sealed, p.length);
    await this.output.write(frame);
    this.size += frame.length;
    this.root = await chain(this.root, frame);
    this.index++;
  }
  async finish(omitted: string[], guard: () => void): Promise<Blob> {
    guard();
    if (this.finished || !this.records.length)
      throw new Error('Nenhum conteúdo foi incluído.');
    if (omitted.length > backupItemLimit)
      throw new Error('Relatório excedido.');
    const report: BackupReport = {
      version: 1,
      created: new Date().toISOString(),
      records: this.records,
      omitted,
      root: this.root,
    };
    const bytes = encoder.encode(JSON.stringify(report));
    try {
      if (bytes.length > backupReportLimit)
        throw new Error('Relatório de backup excedido.');
      await this.append(2, bytes);
      guard();
      this.finished = true;
      return await this.output.finish();
    } finally {
      bytes.fill(0);
    }
  }
}
export class BackupReader {
  readonly report: BackupReport;
  readonly hash: string;
  readonly id: string;
  readonly targets: BackupTarget[] = [];
  private readonly h: Header;
  private readonly key: CryptoKey;
  private readonly file: Blob;
  private readonly frames: Frame[];
  private closed = false;
  get complete(): boolean {
    return (
      this.report.omitted.length === 0 &&
      this.targets.length ===
        this.report.records.filter(
          (r) => r.type === 'message' || r.type === 'vault',
        ).length
    );
  }
  private constructor(input: {
    h: Header;
    key: CryptoKey;
    file: Blob;
    frames: Frame[];
    report: BackupReport;
    hash: string;
  }) {
    this.h = input.h;
    this.key = input.key;
    this.file = input.file;
    this.frames = input.frames;
    this.report = input.report;
    this.hash = input.hash;
    this.id = input.h.id;
  }
  close(): void {
    this.closed = true;
    this.targets.length = 0;
  }
  static async open(
    a: VaultAuthority,
    file: Blob,
    guard: () => void,
  ): Promise<BackupReader> {
    if (file.size < 64 || file.size > backupLimit)
      throw new Error('Backup vazio ou acima de 1 GiB.');
    const start = await read(file, 0, 12);
    if (!magic.every((b, i) => start[i] === b))
      throw new Error('Arquivo de backup não suportado.');
    const length = new DataView(start.buffer).getUint32(8);
    if (length > 4096 || length < 100) throw new Error('Cabeçalho inválido.');
    const raw = decoder.decode(await read(file, 12, length)),
      h = header(JSON.parse(raw) as unknown);
    if (canonical(h) !== raw || h.accountId !== a.session.accountId)
      throw new Error('Backup de outra conta ou cabeçalho inválido.');
    const secret = base64(
      await openBlock(
        await a.key(h.epoch),
        { ...h, block: h.wrapped },
        base64(h.wrapped.ciphertext, 256),
      ),
      32,
    );
    if (secret.length !== 32) throw new Error('Chave de backup inválida.');
    let key: CryptoKey;
    try {
      key = await crypto.subtle.importKey(
        'raw',
        Uint8Array.from(secret),
        'AES-GCM',
        false,
        ['decrypt'],
      );
    } finally {
      secret.fill(0);
    }
    const scanned = await scan({ h, key, file, start: 12 + length, guard });
    const result = new BackupReader({ h, key, file, ...scanned });
    await result.validate(guard);
    guard();
    return result;
  }
  async read(index: number): Promise<BackupRecord> {
    if (this.closed) throw new Error('Backup fechado.');
    const info = recordInfoAt(this.report, index);
    const bytes = new Uint8Array(info.bytes);
    let offset = 0;
    try {
      for (let part = 0; part < info.parts; part++) {
        const frame = dataFrameAt(this.frames, info.start + part);
        const opened = await decipher(
          this.key,
          { h: this.h, index: info.start + part, kind: 1 },
          await read(this.file, frame.offset, frame.length),
        );
        if (offset + opened.length > bytes.length)
          throw new Error('Item excedido.');
        bytes.set(opened, offset);
        offset += opened.length;
        opened.fill(0);
      }
      await verifyRecordBytes(bytes, offset, info);
      const row = deserializeRecord(bytes);
      if (
        row.type !== info.type ||
        row.id !== info.id ||
        row.hash !== info.hash
      )
        throw new Error('Item divergente do relatório.');
      return row;
    } finally {
      bytes.fill(0);
    }
  }
  private async validate(guard: () => void): Promise<void> {
    const media = new Set<string>();
    for (let index = 0; index < this.report.records.length; index++) {
      guard();
      const row = await this.read(index);
      if (
        row.type === 'account' &&
        (await bytesHash(encoder.encode(row.value))) !== row.hash
      )
        throw new Error('Perfil de backup adulterado.');
      if (row.type === 'media') {
        if ((await bytesHash(base64(row.bytes, 3_000_000))) !== row.hash)
          throw new Error('Mídia de backup adulterada.');
        media.add(`${row.message}:${row.id}:${row.hash}`);
      }
    }
    for (let index = 0; index < this.report.records.length; index++) {
      guard();
      const target = cleanupTarget(await this.read(index), media);
      if (target) this.targets.push(target);
    }
  }
}
async function read(
  file: Blob,
  offset: number,
  length: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (offset + length > file.size) throw new Error('Backup truncado.');
  return new Uint8Array(
    await file.slice(offset, offset + length).arrayBuffer(),
  );
}
function recordInfoAt(report: BackupReport, index: number): RecordInfo {
  const info = report.records[index];
  if (!info) throw new Error('Item de backup ausente.');
  return info;
}
function dataFrameAt(frames: Frame[], index: number): Frame {
  const frame = frames[index];
  if (!frame || frame.kind !== 1) throw new Error('Parte de backup ausente.');
  return frame;
}
async function verifyRecordBytes(
  bytes: Uint8Array,
  offset: number,
  info: RecordInfo,
): Promise<void> {
  if (offset !== info.bytes || (await bytesHash(bytes)) !== info.digest)
    throw new Error('Item corrompido.');
}
function frameLength(p: Uint8Array): { kind: number; length: number } {
  const kind = p[0],
    length = new DataView(p.buffer, p.byteOffset, p.byteLength).getUint32(1);
  if (
    (kind !== 1 && kind !== 2) ||
    length < 29 ||
    length > (kind === 1 ? backupChunk : backupReportLimit) + 28
  )
    throw new Error('Parte de backup inválida.');
  return { kind, length };
}
async function scan(input: {
  h: Header;
  key: CryptoKey;
  file: Blob;
  start: number;
  guard: () => void;
}): Promise<{ frames: Frame[]; report: BackupReport; hash: string }> {
  let offset = input.start,
    root = await bytesHash(await read(input.file, 0, offset));
  const frames: Frame[] = [];
  while (offset < input.file.size) {
    input.guard();
    if (frames.length >= backupFrameLimit)
      throw new Error('Partes de backup excedidas.');
    const { kind, length } = frameLength(await read(input.file, offset, 5));
    const plaintext = await decipher(
      input.key,
      { h: input.h, index: frames.length, kind },
      await read(input.file, offset + 5, length),
    );
    const next = await chain(root, await read(input.file, offset, 5 + length));
    frames.push({ offset: offset + 5, length, kind });
    offset += 5 + length;
    if (kind === 2)
      return finishScan({
        plaintext,
        file: input.file,
        offset,
        frames,
        root,
        hash: next,
      });
    plaintext.fill(0);
    root = next;
  }
  throw new Error('Relatório final ausente.');
}
function finishScan(c: {
  plaintext: Uint8Array;
  file: Blob;
  offset: number;
  frames: Frame[];
  root: string;
  hash: string;
}) {
  try {
    if (c.offset !== c.file.size)
      throw new Error('Dados após o encerramento do backup.');
    const report = parseReport(
      JSON.parse(decoder.decode(c.plaintext)) as unknown,
      c.frames.length - 1,
    );
    if (report.root !== c.root)
      throw new Error('Backup incompleto ou reordenado.');
    return { frames: c.frames, report, hash: c.hash };
  } finally {
    c.plaintext.fill(0);
  }
}
function reportFields(d: Record<string, unknown>): {
  created: string;
  records: unknown[];
  omitted: string[];
} {
  if (
    d['version'] !== 1 ||
    typeof d['created'] !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T.{12,24}Z$/u.test(d['created'])
  )
    throw new Error('Relatório inválido.');
  const records = d['records'],
    omitted = d['omitted'];
  if (
    !Array.isArray(records) ||
    !records.length ||
    records.length > backupItemLimit
  )
    throw new Error('Registros excedidos.');
  if (
    !Array.isArray(omitted) ||
    omitted.length > backupItemLimit ||
    omitted.some((v) => typeof v !== 'string' || v.length > 160)
  )
    throw new Error('Relatório de omissões inválido.');
  return { created: d['created'], records, omitted: omitted as string[] };
}
function parseInfo(value: unknown): RecordInfo {
  const r = object(value);
  keys(r, ['type', 'id', 'hash', 'start', 'parts', 'bytes', 'digest']);
  if (!['vault', 'message', 'media', 'account'].includes(String(r['type'])))
    throw new Error('Registro não suportado.');
  return {
    type: r['type'] as BackupRecord['type'],
    id: uuid(r['id']),
    hash: fingerprint(r['hash']),
    start: integer(r['start'], backupFrameLimit),
    parts: integer(r['parts'], 32),
    bytes: integer(r['bytes'], backupRecordLimit),
    digest: fingerprint(r['digest']),
  };
}
function parseReport(input: unknown, frames: number): BackupReport {
  const d = object(input);
  keys(d, ['version', 'created', 'records', 'omitted', 'root']);
  const fields = reportFields(d);
  let next = 0;
  const ids = new Set<string>();
  const records = fields.records.map((v) => {
    const result = parseInfo(v),
      id = recordKey(result);
    if (
      ids.has(id) ||
      result.start !== next ||
      result.parts === 0 ||
      result.bytes === 0 ||
      result.parts !== Math.ceil(result.bytes / backupChunk)
    )
      throw new Error('Registros repetidos, omitidos ou excedidos.');
    ids.add(id);
    next += result.parts;
    return result;
  });
  if (next !== frames) throw new Error('Partes não relacionadas no relatório.');
  return {
    version: 1,
    created: fields.created,
    records,
    omitted: fields.omitted,
    root: fingerprint(d['root']),
  };
}
