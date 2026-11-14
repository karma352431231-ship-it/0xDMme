import {
  privateSendContext,
  privateSendBatch,
  privateSendPoint,
  privateSendSpan,
  measurePrivateSend,
  linkPrivateBatch,
} from '../chat-sync-diagnostics/index.ts';
import type { PrivateSendContext } from '../chat-sync-diagnostics/index.ts';
import { networkAvailable } from '../connectivity/index.ts';
import { traceSend, measureSend } from '../chat-sync-diagnostics/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import type { AccountSession } from '../../shared/account/index.ts';
import { canonical, digest } from '../../shared/devices/index.ts';
import type { DirectoryEvent } from '../../shared/devices/index.ts';
import type {
  MessagePacket,
  RecoveryKey,
} from '../../shared/messages/index.ts';
import { recoveryKey, verifyRecoveryKey } from '../../shared/messages/index.ts';
import type { MessageRelation } from '../../shared/daily/index.ts';
import {
  attachmentContent,
  chatFileLimit,
} from '../../shared/attachments/index.ts';
import {
  stageAttachment,
  uploadAttachments,
  forgetAttachment,
  retainAttachment,
} from '../attachments/index.ts';
import type { AttachmentSelection } from '../attachments/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
  VaultWorkOptions,
} from '../vault-authority/index.ts';
import type { MessageCrypto } from '../message-crypto/index.ts';
import {
  localGet,
  localPut,
  localPage,
  sealLocal,
  openLocal,
  enqueueOutbox,
  enqueueOutboxBatch,
  outboxPage,
  removeOutbox,
} from '../message-storage/index.ts';
import type { LocalCipher } from '../message-storage/index.ts';
import type { TextDraft } from '../text-send/index.ts';
import { WorkInterruption } from '../synchronization-work/index.ts';
import { encodeProfileCard, profileCard } from '../message-profile/index.ts';
import type { ProfileCard } from '../message-profile/index.ts';
import { PinnedSendBatch, sendPinnedBatch } from './send-batch.ts';
import { syncMessageApi as messageApi } from './sync-transport.ts';
import { sealProfileChunks } from './profile-chunks.ts';
import {
  prepareViewOnceContents,
  sealViewOnceDraft,
  openViewOnceDraft,
  prepareViewOnce,
  viewOnceDescriptor,
  uploadViewOnce,
} from '../view-once/index.ts';
import type { PreparedViewOnce } from '../view-once/index.ts';
import { t } from '../../shared/i18n/index.ts';
import { encodeDailyText } from '../../shared/daily/index.ts';
import type { SubmissionItem, StagedMedia } from './attachment-submissions.ts';

interface SendAuthority {
  session: () => Readonly<AccountSession> | null;
  current: () => number;
  guard: (generation: number) => void;
  pinsLoaded: (generation: number) => boolean;
  loadPins: (options?: VaultWorkOptions) => Promise<void>;
  savePins: (options?: VaultWorkOptions) => Promise<void>;
  history: (
    authority: VaultAuthority,
    generation: number,
    peer: string,
  ) => Promise<DirectoryEvent[]>;
  encryption: (
    authority: VaultAuthority,
    generation: number,
    diagnostic?: PrivateSendContext,
  ) => Promise<{ own: RecoveryKey; machine: MessageCrypto }>;
}
interface OutboxEntry {
  viewOnce?: boolean;
  viewOncePayload?: PreparedViewOnce;
  outboxOrder?: string;
  createdAt?: number;
  relation?: MessageRelation;
  id: string;
  peer: string;
  draft: LocalCipher[];
  kind: MessagePacket['kind'];
  packet: MessagePacket | null;
  transferStarted?: boolean;
}
interface SendContext {
  diagnostic?: PrivateSendContext | undefined;
  a: VaultAuthority;
  api: (op: string, d: Record<string, unknown>) => Promise<unknown>;
  own: RecoveryKey;
  machine: MessageCrypto;
  generation: number;
  name: string;
  value: OutboxEntry;
  history: import('../../shared/devices/index.ts').DirectoryEvent[];
}
/** Owns encrypted outgoing records from admission through transfer, retry,
 * reconciliation and removal. Session/identity verification and SDK opening
 * stay behind the existing authority; this owner closes every machine it opens. */
export class MessageOutbox {
  private readonly access: VaultAccess;
  private readonly authority: SendAuthority;
  private readonly published: (value: { id: string; peer: string }) => void;
  constructor(options: {
    access: VaultAccess;
    authority: SendAuthority;
    published: MessageOutbox['published'];
  }) {
    this.access = options.access;
    this.authority = options.authority;
    this.published = options.published;
  }
  /** The verified reader has already authenticated this deletion. */
  forgetDeleted(scope: string, id: string): Promise<void> {
    return removeOutbox(scope, `outbox:${id}`);
  }
  async compose(
    peer: string,
    text: string,
    kind: MessagePacket['kind'] = 'text',
    provided?: string | { id: string; relation: MessageRelation },
  ): Promise<void> {
    const generation = this.authority.current();
    await this.access.withVault(!networkAvailable(), async (a) => {
      this.authority.guard(generation);
      const id =
          (typeof provided === 'object' ? provided.id : provided) ??
          crypto.randomUUID(),
        draft = await this.sealDraft(a, id, text, kind),
        outbox: OutboxEntry = {
          id,
          peer,
          draft,
          kind,
          packet: null,
          ...(typeof provided === 'object'
            ? { relation: provided.relation }
            : {}),
        };
      await localPut(
        a.session.accountId,
        `outbox:${id}`,
        outbox,
        draft.reduce((total, chunk) => total + chunk.bytes.length, 0) + 512,
      );
    });
  }
  /** Local ciphertext admission only; SDK selection/publication stay exclusive. */
  async queueText(input: TextDraft): Promise<void> {
    traceSend('submit', input.id);
    const generation = this.authority.current();
    const session = this.authority.session();
    if (!session) throw new WorkInterruption('session');
    const { accountId, deviceId } = session;
    // Admission only needs the verified local keyring. Publication still
    // opens fresh online authority and verifies the intended recipient.
    await this.access.withLocalVault({ accountId, deviceId }, async (a) => {
      this.authority.guard(generation);
      const draft = [
        await measureSend(
          'draft-seal',
          () => sealLocal(a, input.id, input.text),
          input.id,
        ),
      ];
      this.authority.guard(generation);
      await enqueueOutbox({
        scope: accountId,
        id: input.id,
        value: {
          id: input.id,
          peer: input.peer,
          draft,
          kind: 'text',
          packet: null,
          createdAt: input.createdAt ?? Date.now(),
        },
        size: draft[0]!.bytes.length + 512,
        current: () => generation === this.authority.current(),
      });
    });
  }
  async composeAttachment(
    peer: string,
    selection: AttachmentSelection,
    caption: string,
  ): Promise<void> {
    await this.stageOrdinary({
      id: crypto.randomUUID(),
      peer,
      selection,
      text: caption,
      reply: null,
      viewOnce: false,
      createdAt: Date.now(),
    });
  }
  async stageSubmission(item: SubmissionItem): Promise<StagedMedia[]> {
    if (item.viewOnce) return this.queueViewOnce(item);
    return [
      await this.stageOrdinary({
        ...item,
        text: encodeDailyText({
          text: item.text,
          reply: item.reply,
          forwarded: false,
        }),
      }),
    ];
  }
  private async stageOrdinary(item: SubmissionItem): Promise<StagedMedia> {
    const { id, peer, selection } = item;
    if (!selection) throw new Error('Choose an attachment.');
    const generation = this.authority.current();
    const session = this.authority.session();
    if (!session) throw new WorkInterruption('session');
    return this.access.withLocalVault(session, async (a) => {
      this.authority.guard(generation);
      traceSend('submit', id);
      try {
        const content = await measureSend(
          'attachment-stage',
          () =>
            stageAttachment({
              account: a.session.accountId,
              id,
              selection,
              caption: item.text,
              signal: item.signal,
              maximum: chatFileLimit,
            }),
          id,
        );
        this.authority.guard(generation);
        const draft = [await sealLocal(a, id, JSON.stringify(content))];
        const value: OutboxEntry = {
          id,
          peer,
          draft,
          kind: 'attachment',
          packet: null,
          createdAt: item.createdAt,
        };
        await enqueueOutbox({
          scope: a.session.accountId,
          id,
          value,
          size: this.entrySize(value),
          current: () => generation === this.authority.current(),
        });
        return { id, peer, content, createdAt: item.createdAt };
      } catch (error: unknown) {
        await forgetAttachment(a.session.accountId, id);
        throw error;
      }
    });
  }
  async composeViewOnce(
    peer: string,
    text: string,
    selection: AttachmentSelection | null,
  ): Promise<void> {
    await this.queueViewOnce({
      id: crypto.randomUUID(),
      peer,
      text,
      selection,
      reply: null,
      viewOnce: true,
      createdAt: Date.now(),
    });
  }
  private async queueViewOnce(item: SubmissionItem): Promise<StagedMedia[]> {
    const session = this.authority.session();
    if (!session) throw new WorkInterruption('session');
    const generation = this.authority.current();
    const contents = await prepareViewOnceContents(
      item.text,
      item.selection,
      chatFileLimit,
      { id: item.id, signal: item.signal },
    );
    return this.access.withLocalVault(session, async (a) => {
      this.authority.guard(generation);
      const entries = await Promise.all(
        contents.map(async (content, index) => {
          const id = index === 0 ? item.id : crypto.randomUUID();
          traceSend('submit', id);
          const value: OutboxEntry = {
            id,
            peer: item.peer,
            kind: 'text',
            packet: null,
            draft: await measureSend(
              'draft-seal',
              () => sealViewOnceDraft(a, content, { id, signal: item.signal }),
              id,
            ),
            viewOnce: true,
            createdAt: item.createdAt + index,
          };
          return { id: value.id, value, size: this.entrySize(value) };
        }),
      );
      await enqueueOutboxBatch({
        scope: session.accountId,
        entries,
        current: () => generation === this.authority.current(),
      });
      return entries.map(({ id, value }) => ({
        id,
        peer: item.peer,
        createdAt: value.createdAt ?? item.createdAt,
        content: null,
      }));
    });
  }
  private entrySize(value: OutboxEntry): number {
    return (
      value.draft.reduce((total, part) => total + part.bytes.length + 128, 0) +
      (value.viewOncePayload?.bytes.length ?? 0) +
      JSON.stringify(value.viewOncePayload?.header ?? null).length +
      new TextEncoder().encode(JSON.stringify(value.packet)).length +
      512
    );
  }
  private async sealDraft(
    a: VaultAuthority,
    id: string,
    text: string,
    kind: MessagePacket['kind'],
  ): Promise<LocalCipher[]> {
    if (kind === 'attachment') attachmentContent(JSON.parse(text) as unknown);
    if (kind !== 'profile') return [await sealLocal(a, id, text)];
    profileCard(JSON.parse(text) as unknown);
    return sealProfileChunks(a, text);
  }
  async shareProfile(peer: string, card: ProfileCard): Promise<void> {
    const session = this.authority.session(),
      generation = this.authority.current();
    if (!session) return;
    const serialized = encodeProfileCard(card),
      hash = await digest(serialized),
      name = `profile-sent:${peer}`;
    const sent = await localGet<string>(session.accountId, name);
    this.authority.guard(generation);
    if (sent === hash) return;
    const key = await digest(
      canonical([
        '0xdmme-profile-card',
        1,
        session.accountId,
        peer,
        card.revision,
        card.name,
      ]),
    );
    const id = `${key.slice(0, 8)}-${key.slice(8, 12)}-4${key.slice(13, 16)}-8${key.slice(17, 20)}-${key.slice(20, 32)}`;
    await this.authority.loadPins();
    this.authority.guard(generation);
    const known = await this.access.withVault(false, (a) =>
      messageApi(a, 'profile-known', { id, peer }, () =>
        this.authority.guard(generation),
      ),
    );
    if (!known) {
      await this.compose(peer, serialized, 'profile', id);
      await this.sendPending();
    }
    await localPut(session.accountId, name, hash, 512);
  }

  async sendPending(options: VaultWorkOptions = {}): Promise<void> {
    const batchContext = options.privateSend ?? privateSendBatch();
    privateSendPoint(batchContext, 'outbox-dispatch');
    const pending = await measurePrivateSend(batchContext, 'pending-page', () =>
      this.pending(),
    );
    if (!pending.length) return;
    const generation = this.authority.current();
    const initial = { ...options, privateSend: batchContext };
    if (!this.authority.pinsLoaded(generation))
      await measurePrivateSend(batchContext, 'pins-load', () =>
        this.authority.loadPins(initial),
      );
    this.authority.guard(generation);
    let attempt = 0;
    let diagnostic = batchContext;
    await sendPinnedBatch({
      prepare: () => {
        attempt++;
        diagnostic = batchContext ? { ...batchContext, attempt } : undefined;
        this.authority.guard(generation);
        return measurePrivateSend(diagnostic, 'preflight', () =>
          this.access.withVault(
            false,
            async (a) => {
              this.authority.guard(generation);
              const entries = await measurePrivateSend(
                diagnostic,
                'pending-page',
                () => outboxPage<OutboxEntry>(a.session.accountId),
              );
              linkPrivateBatch(
                diagnostic,
                entries.map(({ value }) => value.id),
              );
              for (const { value } of entries)
                traceSend('outbox-dispatch', value.id);
              return PinnedSendBatch.prepare({
                authority: a,
                entries,
                history: (peer) =>
                  measurePrivateSend(diagnostic, 'target-directory', () =>
                    this.authority.history(a, generation, peer),
                  ),
              });
            },
            { ...options, privateSend: diagnostic },
          ),
        );
      },
      preserve: () =>
        measurePrivateSend(diagnostic, 'pins-save', () =>
          this.authority.savePins({ ...options, privateSend: diagnostic }),
        ),
      transmit: (batch) =>
        this.transmitBatch({
          batch,
          generation,
          options: { ...options, privateSend: diagnostic },
        }),
    });
  }
  private transmitBatch(input: {
    batch: PinnedSendBatch;
    generation: number;
    options: VaultWorkOptions;
  }): Promise<boolean> {
    const { batch, generation, options } = input;
    const diagnostic = options.privateSend;
    this.authority.guard(generation);
    return measurePrivateSend(diagnostic, 'transmit-admission', () =>
      this.access.withVault(
        false,
        async (a) => {
          this.authority.guard(generation);
          const current = batch.current(a);
          privateSendPoint(diagnostic, 'authority-compare', {
            sendOutcome: current ? 'current' : 'changed',
          });
          if (!current) return false;
          const api = (op: string, d: Record<string, unknown>) =>
            messageApi(a, op, d, {
              guard: () => this.authority.guard(generation),
              privateSend: diagnostic,
            });
          const { own, machine } = await this.authority.encryption(
            a,
            generation,
            diagnostic,
          );
          try {
            const page = await measurePrivateSend(
              diagnostic,
              'pending-page',
              () => outboxPage<OutboxEntry>(a.session.accountId, batch.names),
            );
            const earlier = page.map(({ value }) =>
              privateSendSpan(privateSendContext(value.id), 'scheduler-wait', {
                sendWait: 'earlier-draft',
              }),
            );
            try {
              for (const [index, { name, value }] of page.entries()) {
                earlier[index]?.();
                const linked = privateSendContext(value.id);
                const context = linked
                  ? { ...diagnostic, ...linked }
                  : diagnostic;
                const message = (op: string, d: Record<string, unknown>) =>
                  messageApi(a, op, d, {
                    guard: () => this.authority.guard(generation),
                    privateSend: context,
                  });
                await this.sendOne({
                  a,
                  api: context ? message : api,
                  own,
                  machine,
                  generation,
                  name,
                  value,
                  diagnostic: context,
                  history: batch.history(name, value),
                });
              }
            } finally {
              for (const finish of earlier) finish?.();
            }
          } finally {
            machine.close();
          }
          return true;
        },
        options,
      ),
    );
  }
  private async sendOne(context: SendContext): Promise<void> {
    const { a, api, generation, name, value } = context;
    const known = await measurePrivateSend(
      context.diagnostic,
      'accepted-check',
      () => this.alreadyAccepted(api, value),
    );
    privateSendPoint(context.diagnostic, 'accepted-check', {
      sendOutcome: known ? 'accepted' : 'not-accepted',
    });
    if (known) {
      privateSendPoint(context.diagnostic, 'device-keys', {
        sendOutcome: 'skipped',
      });
      this.notifyPublished(value, generation);
      await removeOutbox(a.session.accountId, name);
      await this.retainOutbox(a, value);
      return;
    }
    const history = context.history,
      last = history.at(-1);
    if (!last) throw new Error('Contact directory missing.');
    if (
      !value.packet ||
      value.packet.deviceId !== a.session.deviceId ||
      value.packet.senderDirectory !== a.directory ||
      value.packet.recipientRevision !== last.revision
    ) {
      value.packet = await measurePrivateSend(
        context.diagnostic,
        'packet-prepare',
        () => this.preparePacket(context),
      );
      await measureSend(
        'packet-save',
        () => localPut(a.session.accountId, name, value, this.entrySize(value)),
        value.id,
      );
    } else
      privateSendPoint(context.diagnostic, 'device-keys', {
        sendOutcome: 'skipped',
      });
    await this.transferOutbox(a, api, value);
    traceSend('transfer-complete', value.id);
    await measureSend(
      'server-publish',
      () => this.publishOutbox(api, value),
      value.id,
    );
    this.notifyPublished(value, generation);
    await this.retainOutbox(a, value);
    await removeOutbox(a.session.accountId, name);
  }
  private async preparePacket(context: SendContext): Promise<MessagePacket> {
    const { a, api, own, machine, value, history } = context;
    const raw = await measureSend(
      'recovery',
      () => api('recovery-peer', { accountId: value.peer }),
      value.id,
    );
    if (raw === null)
      throw new Error(
        'Your contact must open the app to prepare recovery before the first message.',
      );
    const peer = recoveryKey(raw),
      event = history[peer.authorityRevision - 1];
    if (!event) throw new Error('Contact recovery does not match.');
    await verifyRecoveryKey(peer, event);
    let text: string;
    let reference: MessagePacket['viewOnce'];
    if (value.viewOnce) {
      const content = await measureSend(
        'draft-open',
        () => openViewOnceDraft(a, value.draft, { id: value.id }),
        value.id,
      );
      value.viewOncePayload ??= await measureSend(
        'payload-prepare',
        () =>
          prepareViewOnce({
            id: value.id,
            scope: 'private',
            sender: a.session.accountId,
            recipient: peer,
            content,
          }),
        value.id,
      );
      const descriptor = await measureSend(
        'descriptor',
        () => viewOnceDescriptor(value.viewOncePayload!, content),
        value.id,
      );
      text = descriptor.text;
      reference = descriptor.reference;
    } else
      text = (
        await Promise.all(value.draft.map((chunk) => openLocal(a, chunk)))
      ).join('');
    return machine.encrypt({
      authority: a,
      peerHistory: history,
      recovery: [own, peer],
      id: value.id,
      text,
      ...(reference ? { viewOnce: reference } : {}),
      kind: value.kind,
      ...(value.relation ? { relation: value.relation } : {}),
    });
  }
  private notifyPublished(value: OutboxEntry, generation: number): void {
    if (value.kind !== 'profile' && !value.relation)
      traceSend('accepted', value.id);
    if (
      generation === this.authority.current() &&
      (value.kind === 'text' || value.kind === 'attachment') &&
      !value.relation
    )
      this.published({ id: value.id, peer: value.peer });
  }
  private async retainOutbox(
    a: VaultAuthority,
    value: OutboxEntry,
  ): Promise<void> {
    if (value.kind === 'attachment')
      await retainAttachment(a.session.accountId, value.id);
  }
  private async transferOutbox(
    a: VaultAuthority,
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>,
    value: OutboxEntry,
  ): Promise<void> {
    if (value.viewOncePayload) {
      value.transferStarted = true;
      await localPut(
        a.session.accountId,
        `outbox:${value.id}`,
        value,
        this.entrySize(value),
      );
      await measureSend(
        'upload',
        () => uploadViewOnce(value.viewOncePayload!, api),
        value.id,
      );
    }
    if (value.kind === 'attachment') {
      value.transferStarted = true;
      await localPut(
        a.session.accountId,
        `outbox:${value.id}`,
        value,
        value.draft.reduce((total, part) => total + part.bytes.length, 0) +
          JSON.stringify(value.packet).length +
          512,
      );
      const content = attachmentContent(
        JSON.parse(await openLocal(a, value.draft[0]!)) as unknown,
      );
      await uploadAttachments({
        account: a.session.accountId,
        message: value.id,
        peer: value.peer,
        content,
        api,
      });
    }
  }
  private async alreadyAccepted(
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>,
    value: OutboxEntry,
  ): Promise<boolean> {
    if (
      value.kind === 'profile' &&
      (await api('profile-known', { id: value.id, peer: value.peer }))
    )
      return true;
    return (
      value.packet !== null &&
      Boolean(
        await api('accepted', {
          id: value.id,
          hash: await digest(JSON.stringify(value.packet)),
        }),
      )
    );
  }
  private async publishOutbox(
    api: (op: string, d: Record<string, unknown>) => Promise<unknown>,
    value: OutboxEntry,
  ): Promise<void> {
    try {
      await api('publish', { packet: value.packet });
    } catch (error: unknown) {
      if (
        !(error instanceof AccountError) ||
        error.status !== 409 ||
        value.kind !== 'profile' ||
        !(await api('profile-known', { id: value.id, peer: value.peer }))
      )
        throw error;
    }
  }
  async discard(id: string): Promise<void> {
    const generation = this.authority.current();
    await this.access.withVault(!networkAvailable(), async (a) => {
      const row = await localGet<OutboxEntry>(
        a.session.accountId,
        `outbox:${id}`,
      );
      if (!row) return;
      if (row.kind === 'attachment' && row.transferStarted && a.offline)
        throw new Error(
          "Reconnect to cancel this attachment's remote reservation.",
        );
      const accepted = await this.discardRemote(a, row, generation);
      await this.cancelViewOnceUpload(a, row, generation, accepted);
      if (row.kind === 'attachment') {
        if (!a.offline && !accepted)
          await messageApi(a, 'attachment-cancel', { message: id }, () =>
            this.authority.guard(generation),
          );
        await forgetAttachment(a.session.accountId, id);
      }
      await removeOutbox(a.session.accountId, `outbox:${id}`);
    });
  }
  private async cancelViewOnceUpload(
    a: VaultAuthority,
    row: OutboxEntry,
    generation: number,
    accepted: boolean,
  ): Promise<void> {
    if (row.viewOncePayload && row.transferStarted && !accepted) {
      if (a.offline)
        throw new Error('Reconnect to cancel the pending view-once upload.');
      const descriptor = await viewOnceDescriptor(
        row.viewOncePayload,
        await openViewOnceDraft(a, row.draft),
      );
      await messageApi(
        a,
        'view-once-cancel',
        {
          scope: 'private',
          peer: row.peer,
          id: row.id,
          hash: descriptor.reference.hash,
        },
        () => this.authority.guard(generation),
      );
    }
  }
  private async discardRemote(
    a: VaultAuthority,
    row: OutboxEntry,
    generation: number,
  ): Promise<boolean> {
    let accepted = false;
    if (row.packet) {
      if (a.offline)
        throw new Error(
          'Reconnect to confirm deletion of a send that may have been accepted.',
        );
      const hash = await digest(JSON.stringify(row.packet));
      accepted = Boolean(
        await messageApi(a, 'accepted', { id: row.id, hash }, () =>
          this.authority.guard(generation),
        ),
      );
      if (accepted)
        await messageApi(
          a,
          'delete',
          { id: row.id, hash, revision: a.events.length },
          () => this.authority.guard(generation),
        );
    }
    return accepted;
  }
  /** Reopen only ordinary own drafts after the selected history gate has opened.
   * Fresh authority and generation checks also cover local pending plaintext. */
  async pendingTexts(
    peer: string,
    ids: readonly string[],
  ): Promise<TextDraft[]> {
    const generation = this.authority.current();
    return this.access.withVault(!networkAvailable(), async (a) => {
      this.authority.guard(generation);
      const page = await outboxPage<OutboxEntry>(
        a.session.accountId,
        ids.map((id) => `outbox:${id}`),
      );
      const drafts: TextDraft[] = [];
      for (const { value } of page) {
        if (value.peer !== peer || value.kind !== 'text' || value.relation)
          continue;
        const text = value.viewOnce
          ? t('View-once message')
          : await openLocal(a, value.draft[0]!);
        this.authority.guard(generation);
        drafts.push({
          id: value.id,
          peer,
          text,
          ...(value.createdAt === undefined
            ? {}
            : { createdAt: value.createdAt }),
          ...(value.outboxOrder ? { order: value.outboxOrder } : {}),
        });
      }
      this.authority.guard(generation);
      return drafts;
    });
  }
  async pending(): Promise<{ id: string; peer: string; text?: boolean }[]> {
    const session = this.authority.session();
    if (!session) return [];
    return (
      await localPage<OutboxEntry>(session.accountId, 'outbox:', null)
    ).items.map((x) => ({
      id: x.value.id,
      peer: x.value.peer,
      text: x.value.kind === 'text' && !x.value.relation,
    }));
  }
}
