import {
  chatSyncControl,
  chatSyncEvent,
} from '../../shared/chat-sync-diagnostics/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import type {
  ChatSyncDecision,
  ChatSyncTrace,
  SendStage,
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
let capture = 0,
  nextSend = 0;
const sends = new Map<
  string,
  { slot: number; rendered: boolean; accepted: boolean }
>();
const sendOwner = {};

function stop(): void {
  capture++;
  sends.clear();
  nextSend = 0;
  deadline = 0;
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
      sendTimings: true,
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

/** Message identities stay inside this tab and expire with the capture. */
export function traceSend(
  stage: SendStage,
  id?: string,
  fields: Pick<ChatSyncDecision, 'sendPhase' | 'sendMs' | 'sendSuccess'> = {},
): void {
  if (!chatSyncActive()) return;
  const message = id === undefined ? undefined : sendMessage(id, stage);
  if (message === null) return;
  traceChatSync(sendOwner, null, {
    event: 'send',
    reason: 'settled',
    sendStage: stage,
    sendPhase: 'point',
    ...fields,
    ...(message === undefined ? {} : { message }),
  });
}

function sendMessage(id: string, stage: SendStage): number | null {
  let send = sends.get(id);
  if (stage === 'check-render' && (!send || send.rendered)) return null;
  send ??= { slot: ++nextSend, rendered: false, accepted: false };
  if (stage === 'check-render') send.rendered = true;
  if (stage === 'accepted') send.accepted = true;
  sends.delete(id);
  sends.set(id, send);
  if (sends.size > 256) sends.delete(sends.keys().next().value!);
  return send.slot;
}

/** Duration marks preserve results and failures, and never cross captures. */
export function measureSend<T>(
  stage: SendStage,
  work: () => Promise<T>,
  id?: string,
): Promise<T> {
  if (!chatSyncActive()) return work();
  const generation = capture,
    started = performance.now();
  traceSend(stage, id, { sendPhase: 'start' });
  const finish = (success: boolean) => {
    if (generation === capture)
      traceSend(stage, id, {
        sendPhase: 'end',
        sendSuccess: success,
        sendMs: Math.max(0, Math.round(performance.now() - started)),
      });
  };
  try {
    return work().then(
      (value) => {
        finish(true);
        return value;
      },
      (error: unknown) => {
        finish(false);
        throw error;
      },
    );
  } catch (error: unknown) {
    finish(false);
    throw error;
  }
}

export function measureSendSync<T>(
  stage: SendStage,
  work: () => T,
  id?: string,
): T {
  if (!chatSyncActive()) return work();
  const generation = capture,
    started = performance.now();
  traceSend(stage, id, { sendPhase: 'start' });
  let success = false;
  try {
    const value = work();
    success = true;
    return value;
  } finally {
    if (generation === capture)
      traceSend(stage, id, {
        sendPhase: 'end',
        sendSuccess: success,
        sendMs: Math.max(0, Math.round(performance.now() - started)),
      });
  }
}

/** Observe a check only after authoritative acceptance for this capture's
 * own message. Decorative pending checks cannot satisfy it. No paint claim. */
export function traceSendChecks(history: HTMLElement): void {
  if (!chatSyncActive() || !sendHistoryVisible(history)) return;
  for (const row of history.querySelectorAll<HTMLElement>(
    'article[data-message]',
  )) {
    const id = row.dataset['message'];
    if (id && sends.get(id)?.accepted && row.querySelector('.message-checks'))
      traceSend('check-render', id);
  }
}

function sendHistoryVisible(history: HTMLElement): boolean {
  return (
    history.isConnected &&
    !history.closest('[hidden]') &&
    document.visibilityState === 'visible' &&
    history.getClientRects().length > 0
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
  if (!chatSyncActive()) return;
  let message: number | undefined;
  if (id !== undefined) {
    message = messages.get(id) ?? ++nextMessage;
    messages.delete(id);
    messages.set(id, message);
    if (messages.size > 256) messages.delete(messages.keys().next().value!);
  }
  traceChatSync(owner, null, {
    ...decision,
    ...(message === undefined ? {} : { message }),
  });
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
