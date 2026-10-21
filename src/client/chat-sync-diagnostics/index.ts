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
const installed = new WeakSet<Window>();

function stop(): void {
  deadline = 0;
  clearTimeout(timer);
  conversations.clear();
  caches = new WeakMap();
  nextCache = nextConversation = 0;
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
