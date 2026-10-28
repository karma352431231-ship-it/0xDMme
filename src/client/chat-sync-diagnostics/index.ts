import {
  chatSyncControl,
  chatSyncEvent,
} from '../../shared/chat-sync-diagnostics/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import type {
  ChatSyncDecision,
  ChatSyncTrace,
} from '../../shared/chat-sync-diagnostics/index.ts';

let deadline = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
let caches = new WeakMap<object, number>(),
  nextCache = 0,
  nextConversation = 0;
const conversations = new Map<string, number>();
let messages = new Map<string, number>(),
  nextMessage = 0;
const installed = new WeakSet<Window>();
const committedMessages = new Set<string>();
let captureEpoch = 0,
  limited = false;

function stop(): void {
  deadline = 0;
  captureEpoch++;
  committedMessages.clear();
  limited = false;
  clearTimeout(timer);
  conversations.clear();
  messages = new Map();
  caches = new WeakMap();
  nextCache = nextConversation = nextMessage = 0;
}
function publish(host: Window, trace: ChatSyncTrace): void {
  host.dispatchEvent(new CustomEvent(chatSyncEvent, { detail: trace }));
}
/** Explicit local capture only; no retained events, content, storage or IO. */
export function installChatSyncDiagnostics(host: Window): void {
  if (installed.has(host)) return;
  installed.add(host);
  host.addEventListener(chatSyncControl, (event) => {
    if (!(event instanceof CustomEvent)) return;
    if (event.detail === 'stop') stop();
    if (event.detail !== 'start') return;
    stop();
    deadline = performance.now() + 600_000;
    timer = setTimeout(stop, 600_000);
    publish(host, {
      version: 1,
      event: 'ready',
      reason: 'capture-started',
      source: 0,
      conversation: 0,
    });
  });
}
export function traceChatSync(
  owner: object,
  peer: string | null,
  decision: ChatSyncDecision,
): void {
  if (typeof window === 'undefined' || deadline === 0) return;
  if (performance.now() >= deadline) {
    stop();
    return;
  }
  let source = caches.get(owner);
  if (source === undefined) {
    source = ++nextCache;
    caches.set(owner, source);
  }
  let conversation = 0;
  if (peer !== null) {
    conversation = conversations.get(peer) ?? ++nextConversation;
    conversations.delete(peer);
    conversations.set(peer, conversation);
    if (conversations.size > 128)
      conversations.delete(conversations.keys().next().value!);
  }
  const callers = [
    ...(new Error().stack ?? '').matchAll(
      /\b(app-[a-f0-9]{16}\.js):(\d+):(\d+)/gu,
    ),
  ]
    .slice(0, 6)
    .map((match) => `${match[1]}:${match[2]}:${match[3]}`);
  publish(window, { ...decision, callers, version: 1, source, conversation });
}

/** True only while a local capture runs, so callers can skip trace work. */
export function chatSyncActive(): boolean {
  return (
    typeof window !== 'undefined' &&
    deadline !== 0 &&
    performance.now() < deadline
  );
}
/** One step of an own group message, or a received row shown. The message ID
 * maps to a small number valid for this capture only and is never published. */
export function traceGroupMessage(
  owner: object,
  decision: {
    event: 'group-send' | 'group-receive';
    reason: ChatSyncDecision['reason'];
    rows?: number;
  },
  id?: string,
): void {
  traceMessageStage(owner, decision, id);
}
export function traceDirectMessage(
  owner: object,
  decision: { event: 'direct-send'; reason: ChatSyncDecision['reason'] },
  id: string,
): void {
  traceMessageStage(owner, decision, id);
}
function captureLimited(owner: object): void {
  if (limited) return;
  limited = true;
  traceChatSync(owner, null, {
    event: 'coverage-limited',
    reason: 'capture-bound',
  });
}
function traceMessageStage(
  owner: object,
  decision: {
    event: 'direct-send' | 'direct-receive' | 'group-send' | 'group-receive';
    reason: ChatSyncDecision['reason'];
    rows?: number;
  },
  id?: string,
): void {
  if (!chatSyncActive()) return;
  let message: number | undefined;
  if (id !== undefined) {
    message = messages.get(id) ?? ++nextMessage;
    messages.delete(id);
    messages.set(id, message);
    if (messages.size > 256) {
      messages.delete(messages.keys().next().value!);
      captureLimited(owner);
    }
  }
  traceChatSync(owner, null, {
    ...decision,
    ...(message === undefined ? {} : { message }),
  });
}
interface VerifiedMessage {
  id: string;
  own: boolean;
  kind: string;
}
/** Call only after durable storage AND the owning protocol's final confirmation.
 * Only numeric capture slots escape; identities, content and crypto stay local. */
export function traceVerifiedMessages(
  owner: object,
  channel: 'direct' | 'group',
  rows: readonly VerifiedMessage[],
): void {
  if (!chatSyncActive()) return;
  for (const row of rows) recordVerifiedMessage(owner, channel, row);
}
function recordVerifiedMessage(
  owner: object,
  channel: 'direct' | 'group',
  row: VerifiedMessage,
): void {
  if (row.own || row.kind === 'profile') return;
  const key = `${channel}:${row.id}`;
  if (committedMessages.has(key)) return;
  committedMessages.add(key);
  if (committedMessages.size > 256) {
    committedMessages.delete(committedMessages.values().next().value!);
    captureLimited(owner);
  }
  traceMessageStage(
    owner,
    {
      event: channel === 'direct' ? 'direct-receive' : 'group-receive',
      reason: 'committed',
    },
    row.id,
  );
}
/** One verified read owns this bounded metadata buffer. Failed reads never
 * confirm it; a capture restart cannot inherit another capture's pending work. */
export class VerifiedReadCapture {
  private readonly epoch = captureEpoch;
  private readonly rows = new Map<string, VerifiedMessage>();
  private truncated = false;
  private readonly owner: object;
  private readonly channel: 'direct' | 'group';
  constructor(owner: object, channel: 'direct' | 'group') {
    this.owner = owner;
    this.channel = channel;
  }
  collect(rows: readonly VerifiedMessage[]): void {
    if (this.epoch !== captureEpoch || !chatSyncActive()) return;
    for (const row of rows) this.retain(row);
  }
  private retain(row: VerifiedMessage): void {
    if (row.own || row.kind === 'profile' || this.rows.has(row.id)) return;
    if (this.rows.size === 256) {
      this.truncated = true;
      return;
    }
    this.rows.set(row.id, { id: row.id, own: row.own, kind: row.kind });
  }
  confirm(): void {
    if (this.epoch === captureEpoch && chatSyncActive()) {
      if (this.truncated) captureLimited(this.owner);
      traceVerifiedMessages(this.owner, this.channel, [...this.rows.values()]);
    }
    this.rows.clear();
  }
}

function failureReason(
  error: unknown,
): NonNullable<ChatSyncDecision['failure']> {
  if (error instanceof AccountError && [401, 403].includes(error.status))
    return 'authorization';
  if (error instanceof AccountError && error.status === 409) return 'conflict';
  if (error instanceof Error && error.name === 'AbortError') return 'aborted';
  return 'failed';
}
export function traceChatSyncFailure(
  owner: object,
  input: {
    reason: 'sync-failed' | 'probe-failed';
    current: boolean;
    error: unknown;
  },
): void {
  traceChatSync(owner, null, {
    event: 'verification-failed',
    reason: input.reason,
    failure: input.current ? failureReason(input.error) : 'generation-changed',
  });
}

if (typeof window !== 'undefined') installChatSyncDiagnostics(window);
