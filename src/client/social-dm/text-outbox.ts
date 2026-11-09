import { object, uuid } from '../../shared/account/index.ts';
import { socialPacket } from '../../shared/social-dm/index.ts';
import type { MessagePacket } from '../../shared/messages/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultLocator,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import type { TextDraft } from '../text-send/index.ts';
import {
  enqueueOutbox,
  enqueueOutboxBatch,
  outboxPage,
  removeOutbox,
  localPage,
  localGet,
  localDelete,
  localPut,
  openLocal,
  sealLocal,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { SocialContext } from './crypto-context.ts';
import { transmitSocialText, sendPeer } from './text-transmission.ts';
import {
  makeViewOnceContents,
  sealViewOnceDraft,
  openViewOnceDraft,
  prepareViewOnce,
  viewOnceDescriptor,
  uploadViewOnce,
} from '../view-once/index.ts';
import type { PreparedViewOnce } from '../view-once/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import { messageApi } from '../message-api/index.ts';
import { currentRecoveryKey } from '../message-recovery/index.ts';
import { t } from '../../shared/i18n/index.ts';

interface TextEntry {
  id: string;
  peer: string;
  draft: LocalCipher | LocalCipher[];
  viewOnce?: boolean;
  viewOncePayload?: PreparedViewOnce;
  packet: MessagePacket | null;
  createdAt: number;
  outboxOrder?: string;
  legacyName?: string;
}
export type PublicTextSendOptions = VaultWorkOptions & {
  published?: (draft: { id: string; peer: string }) => void;
};
type CryptoTurn = <T>(
  work: (context: SocialContext) => Promise<T>,
  options: VaultWorkOptions,
) => Promise<T>;

/** Owns durable public-DM text admission, FIFO, retry packets and bounded drain.
 * A distinct storage scope keeps its queue separate from private messages. */
export class SocialTextOutbox {
  private readonly access: VaultAccess;
  private readonly lifetime: {
    current: () => number;
    guard: (generation: number) => void;
    locator: () => VaultLocator;
  };
  private readonly crypto: CryptoTurn;
  private sending: Promise<{ more: boolean }> | null = null;
  constructor(input: {
    access: VaultAccess;
    lifetime: SocialTextOutbox['lifetime'];
    crypto: CryptoTurn;
  }) {
    this.access = input.access;
    this.lifetime = input.lifetime;
    this.crypto = input.crypto;
  }
  private scope(a: VaultAuthority): string {
    return `dm-text:${a.session.accountId}:${a.session.deviceId}`;
  }
  private local<T>(
    generation: number,
    work: (a: VaultAuthority) => Promise<T>,
  ): Promise<T> {
    this.lifetime.guard(generation);
    return this.access.withLocalVault(this.lifetime.locator(), (a) => {
      this.lifetime.guard(generation);
      return work(a);
    });
  }
  async queueText(input: TextDraft): Promise<void> {
    if (
      !input.text.trim() ||
      new TextEncoder().encode(input.text).length > 3_000_000
    )
      throw new Error('Text empty or over the limit.');
    uuid(input.id);
    uuid(input.peer);
    const generation = this.lifetime.current();
    await this.local(generation, async (a) => {
      const value: TextEntry = {
        id: input.id,
        peer: input.peer,
        draft: await sealLocal(a, input.id, input.text),
        packet: null,
        createdAt: input.createdAt ?? Date.now(),
      };
      await this.enqueue(a, value, generation);
    });
  }
  async queueViewOnce(
    peer: string,
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    const generation = this.lifetime.current();
    const contents = makeViewOnceContents(text, selection, 3_000_000);
    uuid(peer);
    await this.local(generation, async (a) => {
      const entries = await Promise.all(
        contents.map(async (content) => {
          const value: TextEntry = {
            id: crypto.randomUUID(),
            peer,
            viewOnce: true,
            packet: null,
            draft: await sealViewOnceDraft(a, content),
            createdAt: Date.now(),
          };
          return { id: value.id, value, size: this.size(value) };
        }),
      );
      await enqueueOutboxBatch({
        scope: this.scope(a),
        entries,
        current: () => generation === this.lifetime.current(),
      });
    });
  }
  private chunks(value: TextEntry): LocalCipher[] {
    return Array.isArray(value.draft) ? value.draft : [value.draft];
  }
  private text(a: VaultAuthority, value: TextEntry): Promise<string> {
    return openLocal(a, this.chunks(value)[0]!);
  }
  private enqueue(
    a: VaultAuthority,
    value: TextEntry,
    generation: number,
  ): Promise<void> {
    return enqueueOutbox({
      scope: this.scope(a),
      id: value.id,
      value,
      size: this.size(value),
      current: () => generation === this.lifetime.current(),
    });
  }
  private size(value: TextEntry): number {
    return (
      this.chunks(value).reduce(
        (total, part) => total + part.bytes.length + 128,
        0,
      ) +
      (value.viewOncePayload?.bytes.length ?? 0) +
      JSON.stringify(value.viewOncePayload?.header ?? null).length +
      new TextEncoder().encode(JSON.stringify(value.packet)).length +
      512
    );
  }
  private async adoptLegacy(
    a: VaultAuthority,
    generation: number,
  ): Promise<string[]> {
    const scope = `${a.session.accountId}:${a.session.deviceId}`;
    const page = await localPage<LocalCipher>(scope, 'dm-send:', null);
    const names: string[] = [];
    for (const { name, value } of page.items) {
      const held = object(JSON.parse(await openLocal(a, value)) as unknown);
      const packet = socialPacket(held['packet']);
      const peer = uuid(name.slice('dm-send:'.length));
      if (packet.recipient !== peer || typeof held['text'] !== 'string')
        throw new Error('Invalid pending DM text.');
      const entry: TextEntry = {
        id: packet.id,
        peer,
        draft: await sealLocal(a, packet.id, held['text']),
        packet,
        createdAt: Date.now(),
        legacyName: name,
      };
      this.lifetime.guard(generation);
      await this.enqueue(a, entry, generation);
      names.push(`outbox:${packet.id}`);
    }
    return names;
  }
  /** Older clients had no FIFO sequence. Drain their bounded ordered page
   * before new FIFO entries; keep the original ciphertext until acceptance. */
  private async pendingPage(a: VaultAuthority, generation: number) {
    const legacy = await this.adoptLegacy(a, generation);
    return outboxPage<TextEntry>(
      this.scope(a),
      legacy.length ? legacy : undefined,
    );
  }
  private async forgetLegacy(
    a: VaultAuthority,
    entry: TextEntry,
    generation: number,
  ): Promise<void> {
    if (!entry.legacyName) return;
    if (entry.legacyName !== `dm-send:${entry.peer}`)
      throw new Error('Invalid pending DM text.');
    const scope = `${a.session.accountId}:${a.session.deviceId}`;
    const old = await localGet<LocalCipher>(scope, entry.legacyName);
    if (!old) return;
    const held = object(JSON.parse(await openLocal(a, old)) as unknown);
    this.lifetime.guard(generation);
    if (socialPacket(held['packet']).id === entry.id)
      await localDelete(scope, entry.legacyName);
  }
  private async hasMore(a: VaultAuthority): Promise<boolean> {
    const legacy = await localPage<LocalCipher>(
      `${a.session.accountId}:${a.session.deviceId}`,
      'dm-send:',
      null,
    );
    return (
      legacy.items.length > 0 ||
      (await outboxPage<TextEntry>(this.scope(a))).length > 0
    );
  }
  async pendingTexts(peer: string): Promise<TextDraft[]> {
    const generation = this.lifetime.current();
    return this.local(generation, async (a) => {
      const page = await this.pendingPage(a, generation);
      this.lifetime.guard(generation);
      const result: TextDraft[] = [];
      for (const { value } of page) {
        if (value.peer !== peer) continue;
        const text = value.viewOnce
          ? t('View-once message')
          : await this.text(a, value);
        this.lifetime.guard(generation);
        result.push({
          id: value.id,
          peer: value.peer,
          text,
          createdAt: value.createdAt,
          ...(value.outboxOrder ? { order: value.outboxOrder } : {}),
        });
      }
      return result;
    });
  }
  sendPending(options: PublicTextSendOptions = {}): Promise<{ more: boolean }> {
    if (this.sending) return this.sending;
    const work = this.flush(options).finally(() => {
      if (this.sending === work) this.sending = null;
    });
    this.sending = work;
    return work;
  }
  private async flush(
    options: PublicTextSendOptions,
  ): Promise<{ more: boolean }> {
    const generation = this.lifetime.current();
    const pending = await this.local(generation, (a) =>
      this.pendingPage(a, generation),
    );
    this.lifetime.guard(generation);
    if (!pending.length) return { more: false };
    return this.crypto(async (context) => {
      const scope = this.scope(context.privateAuthority);
      for (const { name, value } of pending) {
        this.lifetime.guard(generation);
        let text: string;
        let reference: MessagePacket['viewOnce'];
        const viewOnceApi = (
          operation: string,
          data: Record<string, unknown>,
        ) =>
          messageApi(context.privateAuthority, operation, data, () =>
            this.lifetime.guard(generation),
          );
        if (value.viewOnce) {
          const content = await openViewOnceDraft(
            context.privateAuthority,
            this.chunks(value),
          );
          if (!value.viewOncePayload) {
            const peer = await sendPeer(context, value.peer);
            await currentRecoveryKey(
              peer.recovery,
              peer.directory.events,
              value.peer,
            );
            value.viewOncePayload = await prepareViewOnce({
              id: value.id,
              scope: 'public',
              sender: context.authority.session.accountId,
              recipient: peer.recovery,
              content,
            });
          }
          const descriptor = await viewOnceDescriptor(
            value.viewOncePayload,
            content,
          );
          text = descriptor.text;
          reference = descriptor.reference;
        } else text = await this.text(context.privateAuthority, value);
        await transmitSocialText(context, {
          id: value.id,
          peer: value.peer,
          text,
          ...(reference ? { viewOnce: reference } : {}),
          ...(value.viewOncePayload
            ? {
                beforePublish: () =>
                  uploadViewOnce(value.viewOncePayload!, viewOnceApi),
              }
            : {}),
          packet: value.packet,
          preserve: async (packet) => {
            this.lifetime.guard(generation);
            value.packet = packet;
            await localPut(scope, name, value, this.size(value));
          },
        });
        this.lifetime.guard(generation);
        options.published?.({ id: value.id, peer: value.peer });
        await removeOutbox(scope, name);
        this.lifetime.guard(generation);
        await this.forgetLegacy(context.privateAuthority, value, generation);
      }
      this.lifetime.guard(generation);
      const more = await this.hasMore(context.privateAuthority);
      this.lifetime.guard(generation);
      return { more };
    }, options);
  }
}
