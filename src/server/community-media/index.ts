import { createHash } from 'node:crypto';
import {
  AccountError,
  base64,
  encode,
  keys,
  uuid,
} from '../../shared/account/index.ts';
import { integer } from '../../shared/vault/index.ts';
import {
  communityMediaPartBytes,
  communityMediaSource,
} from '../../shared/community-media/index.ts';
import type {
  ContactAuthority,
  CommunityMediaStore,
} from '../database/index.ts';
import { CommunityMediaFiles } from './files.ts';
import { CommunityMediaNormalizer } from './normalize.ts';
import { readMediaRuntime } from './process.ts';
export { CommunityMediaFiles } from './files.ts';
export { CommunityMediaCollector } from './collector.ts';
export {
  CommunityMediaNormalizer,
  readMediaShape,
  validateMediaSource,
} from './normalize.ts';
export {
  readMediaRuntime,
  verifyMediaBudget,
  mediaProcess,
} from './process.ts';
export type { MediaRuntime } from './process.ts';
export { isolatedMediaProcess } from './isolated.ts';
export type { MediaProcessRequest } from './isolated.ts';
export {
  mediaCommandPaths,
  probeCommand,
  preparationCommand,
} from './commands.ts';

export class CommunityMediaService {
  private readonly store: CommunityMediaStore;
  private readonly files: CommunityMediaFiles;
  private readonly normalizer: CommunityMediaNormalizer;
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly stop = new AbortController();
  private cleaning: Promise<void> | null = null;
  private transfers = 0;
  private preparing = false;
  constructor(options: {
    store: CommunityMediaStore;
    directory: string;
    environment: Readonly<Record<string, string | undefined>>;
  }) {
    this.store = options.store;
    const runtime = readMediaRuntime(options.environment);
    this.files = new CommunityMediaFiles(options.directory, {
      sharedProcessing: Boolean(runtime?.socket),
    });
    this.normalizer = new CommunityMediaNormalizer(runtime, this.files);
  }
  async initialize(): Promise<void> {
    await this.files.initialize();
    await this.normalizer.initialize();
    await this.store.resumeInterrupted();
  }
  async close(): Promise<void> {
    this.stop.abort();
    await Promise.all(this.jobs.values());
    if (this.cleaning) await this.cleaning;
  }
  async clean(): Promise<void> {
    if (this.stop.signal.aborted) return;
    if (this.cleaning) return this.cleaning;
    this.cleaning = this.collect();
    try {
      await this.cleaning;
    } finally {
      this.cleaning = null;
    }
  }
  private async collect(): Promise<void> {
    let remaining = true;
    while (remaining && !this.stop.signal.aborted) {
      const unsettled = await this.store.unsettled();
      for (const id of unsettled) {
        if (this.stop.signal.aborted) return;
        await this.files.prune(id);
        await this.store.settled(id);
      }
      const garbage = await this.store.garbage();
      for (const id of garbage) {
        if (this.stop.signal.aborted) return;
        await this.files.discard(id);
        await this.store.collected(id);
      }
      remaining = unsettled.length === 32 || garbage.length === 32;
      if (remaining)
        await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }
  async operate(
    operation: string,
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    if (this.stop.signal.aborted)
      throw new AccountError(503, 'Serviço em encerramento.');
    if (this.transfers >= 4)
      throw new AccountError(429, 'Transferências ocupadas. Retome depois.');
    this.transfers++;
    try {
      return await this.execute(operation, a, d);
    } finally {
      this.transfers--;
    }
  }
  private async execute(
    operation: string,
    a: ContactAuthority,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    const community = uuid(d['id']);
    if (operation === 'media-reserve') {
      keys(d, ['id', 'source']);
      if (!this.normalizer.available())
        throw new AccountError(503, 'Processador de mídia não configurado.');
      await this.clean();
      return this.store.reserve(
        a,
        community,
        communityMediaSource(d['source']),
      );
    }
    if (operation === 'media-part') return this.part(a, community, d);
    if (operation === 'media-get') return this.read(a, community, d);
    if (operation === 'media-pending') {
      keys(d, ['id']);
      return this.store.pending(a, community);
    }
    keys(d, ['id', 'media']);
    const id = uuid(d['media']);
    if (operation === 'media-status')
      return this.store.status(a, community, id);
    if (operation === 'media-finish') return this.finish(a, community, id);
    if (operation === 'media-cancel') {
      await this.store.cancel(a, community, id);
      await this.clean();
      return { cancelled: true };
    }
    throw new AccountError(404, 'Operação de mídia indisponível.');
  }
  private async part(
    a: ContactAuthority,
    community: string,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['id', 'media', 'index', 'bytes']);
    const id = uuid(d['media']),
      index = integer(d['index'], 381),
      bytes = base64(d['bytes'], communityMediaPartBytes);
    const hash = createHash('sha256').update(bytes).digest('hex'),
      lease = await this.store.begin(a, { community, id, index, hash });
    if (!lease.writer) return lease.state;
    try {
      if (
        bytes.length !==
        Math.min(
          communityMediaPartBytes,
          lease.state.source.bytes - index * communityMediaPartBytes,
        )
      )
        throw new AccountError(400, 'Tamanho de parte divergente.');
      await this.files.part(id, index, bytes);
      await this.store.part(a, { community, id, writer: lease.writer, hash });
    } catch (error: unknown) {
      await this.store.release(id, lease.writer);
      throw error;
    }
    return this.store.status(a, community, id);
  }
  private async finish(
    a: ContactAuthority,
    community: string,
    id: string,
  ): Promise<unknown> {
    const current = await this.store.status(a, community, id);
    if (current.status !== 'uploading') return current;
    if (this.preparing)
      throw new AccountError(429, 'Preparação ocupada. Retome depois.');
    if (
      current.received !==
      Math.ceil(current.source.bytes / communityMediaPartBytes)
    )
      throw new AccountError(409, 'Upload incompleto.');
    this.preparing = true;
    let lease;
    try {
      lease = await this.store.begin(a, {
        community,
        id,
        index: null,
        hash: null,
      });
    } catch (error: unknown) {
      this.preparing = false;
      throw error;
    }
    if (!lease.writer) {
      this.preparing = false;
      return lease.state;
    }
    const writer = lease.writer;
    try {
      await this.store.processing(id, writer);
    } catch (error: unknown) {
      this.preparing = false;
      await this.store.release(id, writer);
      throw error;
    }
    // The promise is owned until settlement; processing never holds a DB transaction.
    const job = this.normalizer
      .prepare(lease.state.source, this.stop.signal)
      .then(async (result) => {
        const resultHash = await this.files.digest(id, 'result', result.bytes),
          thumbnailHash = await this.files.digest(
            id,
            'thumbnail',
            result.thumbnailBytes,
          );
        await this.store.ready(a, {
          community,
          id,
          writer,
          result,
          resultHash,
          thumbnailHash,
        });
      })
      .then(() => this.clean())
      .catch(async (error: unknown) => {
        await this.store.release(
          id,
          writer,
          error instanceof AccountError
            ? error.message
            : 'Preparação indisponível. Retome o envio.',
        );
      })
      .finally(() => {
        this.jobs.delete(id);
        this.preparing = false;
      });
    this.jobs.set(id, job);
    // A database outage in the release path is logged without payloads and does not leave an unhandled rejection.
    void job.catch(() => {
      process.stderr.write('Falha ao finalizar preparação pública.\n');
    });
    return { ...current, status: 'processing' };
  }
  private async read(
    a: ContactAuthority,
    community: string,
    d: Record<string, unknown>,
  ): Promise<unknown> {
    keys(d, ['id', 'media', 'index', 'thumbnail']);
    const id = uuid(d['media']),
      index = integer(d['index'], 95);
    if (typeof d['thumbnail'] !== 'boolean')
      throw new AccountError(400, 'Seleção de mídia inválida.');
    const state = await this.store.status(a, community, id);
    if (!state.result || !['ready', 'attached'].includes(state.status))
      throw new AccountError(404, 'Mídia não preparada.');
    const bytes = await this.files.slice(id, {
      name: d['thumbnail'] ? 'thumbnail' : 'result',
      index,
      bytes: d['thumbnail'] ? state.result.thumbnailBytes : state.result.bytes,
    });
    await this.store.status(a, community, id);
    return { bytes: encode(bytes) };
  }
}
