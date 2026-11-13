import { CaptureWork } from './capture-work.ts';
import type {
  AuthorityDiagnosticContext,
  HandleReadToken,
  HandleSendToken,
  SendPreparationPoint,
  HandleListCaller,
  FlowDiagnosticFields,
} from '../../shared/chat-sync-diagnostics/flow.ts';
import type { NativeTimingFields } from '../../shared/chat-sync-diagnostics/native.ts';
import { LoadingPresentation } from './presentation.ts';
import {
  chatSyncControl,
  chatSyncEvent,
} from '../../shared/chat-sync-diagnostics/index.ts';
import { AccountError } from '../../shared/account/index.ts';
import { diagnosticRequestCategory } from '../../shared/chat-sync-diagnostics/network.ts';
import { createLoadTrace } from './load.ts';
import { EarlyCapture } from './early.ts';
import { HandleDeliveryCapture } from './handle-delivery.ts';
import type { HandleDeliveryPoint } from './handle-delivery.ts';
export type { HandleDeliveryPoint } from './handle-delivery.ts';
import {
  handleDiagnosticRevision,
  readHandlePair,
} from '../../shared/chat-sync-diagnostics/handle.ts';
import type { LoadTrace } from './load.ts';
import type {
  LoadKind,
  LoadDiagnosticFields,
  LoadToken,
  LoadStage,
} from '../../shared/chat-sync-diagnostics/load.ts';
export type { LoadTrace } from './load.ts';
export type { HandleSendToken } from '../../shared/chat-sync-diagnostics/flow.ts';
export { timedLoad, timedLoadSync } from './load.ts';
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
const loadOwner = {};
let nextLoad = 0,
  nextRequest = 0;
let early: EarlyCapture | undefined;
let handleDelivery: HandleDeliveryCapture | undefined;
let captureWork: CaptureWork | undefined;
let captureAbort: AbortController | undefined;
const handleOwner = {};

function stop(): void {
  captureAbort?.abort();
  captureAbort = undefined;
  captureWork?.stop();
  captureWork = undefined;
  handleDelivery?.stop();
  handleDelivery = undefined;
  early?.dispose();
  early = undefined;
  nextLoad = nextRequest = 0;
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
  early?.record(trace);
  host.dispatchEvent(new CustomEvent(chatSyncEvent, { detail: trace }));
}
/** Explicit local capture; only the diagnostic APK can retain early metadata. */
export function installChatSyncDiagnostics(host: Window): void {
  if (installed.has(host)) return;
  installed.add(host);
  host.addEventListener(chatSyncControl, (event) => {
    if (!(event instanceof CustomEvent)) return;
    const pair = readHandlePair(event.detail);
    if (pair && chatSyncActive()) handleDelivery?.pair(pair);
    if (event.detail === 'stop') stop();
    if (event.detail === 'start') announceCapture(host);
  });
}
function announceCapture(host: Window): void {
  const replay = early;
  early = undefined;
  if (!replay) beginCapture();
  publish(host, {
    version: 1,
    event: 'ready',
    reason: 'capture-started',
    source: 0,
    conversation: 0,
    sendTimings: true,
    sendPreparationTimings: true,
    nativeTimings: true,
    loadTimings: true,
    handleTimings: true,
    handleRevision: handleDiagnosticRevision,
    earlyTimings: !!replay,
    earlyDropped: replay?.dropped ?? 0,
    earlyLongTasks: replay?.longTasks ?? false,
  });
  replay?.replay((trace) => publish(host, trace));
}
function beginCapture(): void {
  stop();
  captureAbort = new AbortController();
  handleDelivery = new HandleDeliveryCapture((fields) =>
    traceChatSync(handleOwner, null, {
      event: 'handle-delivery',
      reason: 'settled',
      ...fields,
    }),
  );
  captureWork = new CaptureWork((event, fields) =>
    traceChatSync(handleOwner, null, { event, reason: 'settled', ...fields }),
  );
  deadline = performance.now() + 600_000;
  timer = setTimeout(stop, 600_000);
}
/** The explicit diagnostic APK authorizes one bounded in-memory launch capture. */
export function beginStartupCapture(): boolean {
  if (
    (window as Window & { __0xdmmeNativeDiagnostics?: boolean })
      .__0xdmmeNativeDiagnostics !== true
  )
    return false;
  installChatSyncDiagnostics(window);
  beginCapture();
  early = new EarlyCapture();
  return true;
}
/** Late native callbacks cannot enter a later recording. */
export function startBootTrace() {
  const generation = capture;
  return (
    fields: Pick<
      LoadDiagnosticFields,
      | 'bootMilestone'
      | 'bootActivityMs'
      | 'bootWebViewMs'
      | 'bootDocumentMs'
      | 'bootNavigationMs'
      | 'bootAvailable'
    >,
  ): void => {
    if (generation === capture)
      traceChatSync(loadOwner, null, {
        event: 'boot',
        reason: 'settled',
        ...fields,
      });
  };
}
function diagnosticHint(decision: ChatSyncDecision): ChatSyncDecision {
  if (
    decision.event === 'handle-refresh' &&
    decision.reason === 'live-hint' &&
    captureWork
  )
    decision = { ...decision, handleHint: captureWork.noteHint() };
  return decision;
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
  decision = diagnosticHint(decision);
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

/** Public delivery stages contain only an optional paired tag and local slot. */
export function traceHandleDelivery(
  id: string,
  stage: HandleDeliveryPoint,
  read?: HandleReadToken,
): boolean {
  return (
    chatSyncActive() &&
    (handleDelivery?.mark(
      id,
      stage,
      captureWork?.slot(read),
      sends.get(id)?.slot,
    ) ??
      false)
  );
}

export function traceHandleFrame(): (
  id: string,
  stage: 'frame' | 'offscreen',
) => void {
  const current = handleDelivery;
  return (id, stage) => {
    if (current === handleDelivery && chatSyncActive())
      current?.mark(id, stage);
  };
}

export function startLoad(
  kind: LoadKind,
  peer: string | null = null,
  started = performance.now(),
): LoadTrace | undefined {
  if (!chatSyncActive()) return;
  const generation = capture,
    load = ++nextLoad;
  let ended = false;
  const trace = createLoadTrace((fields) => {
    if (['complete', 'failed', 'cancelled'].includes(fields.loadStage ?? ''))
      ended = true;
    if (generation === capture)
      traceChatSync(loadOwner, peer, {
        event: 'load',
        reason: 'settled',
        load,
        loadKind: kind,
        ...fields,
      });
  }, started);
  let dispatched = false;
  if (kind === 'group-directory') {
    const token = captureWork?.load({
      slot: load,
      startedMs: Math.round(started),
      active: () => !dispatched && !ended,
      point: (stage) => {
        if (dispatched || generation !== capture) return;
        trace.point(stage);
        if (stage === 'group-list-send') dispatched = true;
      },
    });
    if (token) trace.token = token;
  }
  return trace;
}

/** Transport timings include the guarded native bridge, headers and body demand.
 * Only fixed categories/status/counts enter the trace, never request data. */
export function startNativeRequest(path: string) {
  if (!chatSyncActive()) return;
  const generation = capture,
    nativeRequest = ++nextRequest,
    started = performance.now();
  const nativeCategory = diagnosticRequestCategory(path);
  let ended = false;
  const point = (
    nativePhase: NonNullable<LoadDiagnosticFields['nativePhase']>,
    fields: Pick<LoadDiagnosticFields, 'nativeStatus' | 'nativeBytes'> &
      NativeTimingFields = {},
  ) => {
    if ((ended && nativePhase !== 'json') || generation !== capture) return;
    traceChatSync(loadOwner, null, {
      event: 'native-request',
      reason: 'settled',
      nativeRequest,
      nativeCategory,
      nativePhase,
      nativeMs: Math.max(0, Math.round(performance.now() - started)),
      ...fields,
    });
    ended ||= ['body', 'failed', 'cancelled'].includes(nativePhase);
  };
  point('start');
  return point;
}

/** Message identities stay inside this tab and expire with the capture. */
export function traceSend(
  stage: SendStage,
  id?: string,
  fields: Pick<
    ChatSyncDecision,
    'sendPhase' | 'sendMs' | 'sendSuccess' | 'sendBlock'
  > = {},
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
    if (id && sends.get(id)?.accepted && row.querySelector('.message-checks')) {
      traceSend('check-render', id);
      traceHandleDelivery(id, 'sender-check');
    }
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

/** A timing wrapper preserves return values and failures of the owned operation. */
export function measuredLoad<T>(
  kind: import('../../shared/chat-sync-diagnostics/load.ts').LoadKind,
  work: (trace: LoadTrace | undefined) => Promise<T>,
): Promise<T> {
  const trace = startLoad(kind);
  if (!trace) return work(undefined);
  return finishMeasuredLoad(trace, work);
}
async function finishMeasuredLoad<T>(
  trace: LoadTrace,
  work: (trace: LoadTrace) => Promise<T>,
): Promise<T> {
  try {
    const value = await work(trace);
    trace?.point('complete', { loadOutcome: 'complete' });
    return value;
  } catch (error: unknown) {
    trace?.point('failed', { loadOutcome: 'failed' });
    throw error;
  }
}

/** The capture owner supplies trace creation; the presentation owns its lifetime. */
export function loadingPresentation(
  kind: LoadKind,
  conversation: string | null = null,
): LoadingPresentation {
  return new LoadingPresentation(() => startLoad(kind, conversation));
}

export function startHandleRead(): HandleReadToken | undefined {
  return chatSyncActive() ? captureWork?.read() : undefined;
}
export function startHandleSend(): HandleSendToken | undefined {
  return chatSyncActive() ? captureWork?.send() : undefined;
}
export function traceHandleSend(
  token: HandleSendToken | undefined,
  point: SendPreparationPoint,
): void {
  if (chatSyncActive()) captureWork?.markSend(token, point);
}
export function linkHandleSend(
  token: HandleSendToken | undefined,
  id: string,
): void {
  if (!chatSyncActive()) return;
  const handleSend = captureWork?.sendSlot(token);
  if (!handleSend) return;
  traceChatSync(sendOwner, null, {
    event: 'send',
    reason: 'settled',
    sendStage: 'flush-ready',
    sendPhase: 'point',
    message: sendMessage(id, 'flush-ready')!,
    handleSend,
  });
}
export function traceHandleList(
  caller: HandleListCaller,
  shared: boolean,
): void {
  if (chatSyncActive())
    traceChatSync(sendOwner, null, {
      event: 'handle-list',
      reason: 'settled',
      handleListCaller: caller,
      listShared: shared,
    });
}
export function traceHandleRead(
  token: HandleReadToken | undefined,
  phase: NonNullable<FlowDiagnosticFields['readPhase']>,
): void {
  if (chatSyncActive()) captureWork?.markRead(token, phase);
}
export function startAuthorityWork(
  context: AuthorityDiagnosticContext = {},
  priority?: 'interactive',
  resource?: object,
) {
  return chatSyncActive()
    ? captureWork?.queue(context, priority, resource)
    : undefined;
}

/** The capability remains local; only its validated anonymous slot is emitted. */
export function traceLoadPoint(
  token: LoadToken | undefined,
  stage: LoadStage,
): void {
  if (chatSyncActive() && captureWork?.loadSlot(token)) token?.point(stage);
}

export function diagnosticCaptureSignal(): AbortSignal | undefined {
  return chatSyncActive() ? captureAbort?.signal : undefined;
}

/** Async diagnostic owners capture this value before starting work. */
export function diagnosticGeneration(): number | undefined {
  return chatSyncActive() ? capture : undefined;
}
