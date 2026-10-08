import pg from 'pg';
import { object, keys, uuid } from '../../shared/account/index.ts';
import type { DatabaseChanges } from './changes.ts';

const topics = [
  'ranking',
  'push',
  'backups',
  'attachments',
  'social-media',
  'group-media',
  'group-daily',
  'status',
  'representatives',
  'public-media',
  'public-moderation',
  'post-views',
] as const;
export type WorkTopic = (typeof topics)[number];
function channel(topic: WorkTopic): string {
  return `hash_talk_${topic.replaceAll('-', '_')}`;
}
/** Payload-free hints. Consumers always reconcile their durable state on connection. */
export class WorkSignals {
  private readonly connectionString: string;
  private readonly listeners = new Map<WorkTopic, Set<() => void>>();
  private client: pg.Client | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private opening: Promise<void> | null = null;
  private stopped = false;
  private readonly changes: DatabaseChanges | undefined;
  private ownership: { role: string; lost: () => void } | null = null;
  private owned = false;
  constructor(connectionString: string, changes?: DatabaseChanges) {
    this.connectionString = connectionString;
    this.changes = changes;
  }
  subscribe(topic: WorkTopic, listener: () => void): () => void {
    const listeners = this.listeners.get(topic) ?? new Set();
    listeners.add(listener);
    this.listeners.set(topic, listeners);
    return () => {
      listeners.delete(listener);
    };
  }
  /** The existing LISTEN connection also owns the process lease; no extra DB slot. */
  holdWorker(role: 'ranking' | 'content' | 'public', lost: () => void): void {
    if (this.client || this.ownership) throw new Error('Worker já registrado.');
    this.ownership = { role, lost };
  }
  private notify(topic: WorkTopic): void {
    for (const listener of this.listeners.get(topic) ?? []) {
      try {
        listener();
      } catch {
        process.stderr.write(
          'Consumidor não recebeu sinal; recuperação pendente.\n',
        );
      }
    }
  }
  async start(): Promise<void> {
    if (this.stopped || this.client) return;
    if (this.opening) return this.opening;
    this.opening = this.connect();
    try {
      await this.opening;
    } finally {
      this.opening = null;
    }
  }
  private async connect(): Promise<void> {
    const client = new pg.Client({
      connectionString: this.connectionString,
      application_name: 'hash-talk-work-signals',
      connectionTimeoutMillis: 3000,
      query_timeout: 5000,
      statement_timeout: 4000,
    });
    client.on('error', () => this.disconnected(client));
    client.on('end', () => this.disconnected(client));
    client.on('notification', (event) => {
      for (const topic of topics)
        if (event.channel === channel(topic)) this.notify(topic);
      if (event.channel === 'hash_talk_content_changes')
        this.contentChanged(event.payload);
    });
    this.client = client;
    try {
      await client.connect();
      if (this.ownership) {
        const lease = await client.query<{ acquired: boolean }>(
          'SELECT pg_try_advisory_lock(hashtext($1)) AS acquired',
          [`hash-talk:background:${this.ownership.role}`],
        );
        if (!lease.rows[0]?.acquired)
          throw new Error('Worker desta responsabilidade já ativo.');
        this.owned = true;
      }
      for (const topic of topics)
        await client.query(`LISTEN ${channel(topic)}`);
      await client.query('LISTEN hash_talk_content_changes');
      for (const topic of topics) this.notify(topic);
    } catch (error: unknown) {
      this.disconnected(client);
      throw error;
    }
  }
  private disconnected(client: pg.Client): void {
    if (this.client !== client) return;
    this.client = null;
    if (this.owned) {
      this.owned = false;
      if (!this.stopped) this.ownership?.lost();
    }
    this.changes?.invalidateStreams();
    void client.end().catch(() => {
      /* Failed connection is already unusable. */
    });
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.start().catch(() => {
        process.stderr.write(
          'Sinalização de trabalho indisponível; recuperação pendente.\n',
        );
      });
    }, 5000);
    this.retry.unref();
  }
  private contentChanged(payload: string | undefined): void {
    try {
      const data = object(JSON.parse(payload ?? ''));
      keys(data, ['accounts', 'removed', 'authorization']);
      const accounts = data['accounts'];
      if (
        !Array.isArray(accounts) ||
        accounts.length > 64 ||
        typeof data['removed'] !== 'boolean' ||
        typeof data['authorization'] !== 'boolean'
      )
        throw new Error('Aviso inválido.');
      this.changes?.committed(
        accounts.map((value: unknown) => uuid(value)),
        {
          removed: data['removed'],
          authorization: data['authorization'],
        },
      );
    } catch {
      this.changes?.invalidateStreams();
    }
  }
  async close(): Promise<void> {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    await this.opening?.catch(() => {});
    const client = this.client;
    this.client = null;
    await client?.end();
  }
}
