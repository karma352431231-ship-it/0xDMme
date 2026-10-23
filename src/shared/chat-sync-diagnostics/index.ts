import { copyWorkDiagnostic } from './work.ts';
import type { WorkDiagnosticFields } from './work.ts';
export const chatSyncControl = '0xdmme-chat-sync-diagnostic-control';
export const chatSyncEvent = '0xdmme-chat-sync-diagnostic-event';
export const chatSyncEvents = [
  'ready',
  'cache-stored',
  'cache-removed',
  'cache-cleared',
  'cache-invalidated',
  'cache-confirmed',
  'cache-check',
  'candidate-read',
  'navigation',
  'projection',
  'verification-failed',
  'work',
  'group-send',
  'group-receive',
] as const;
export const chatSyncReasons = [
  'capture-started',
  'settled',
  'stored',
  'replaced',
  'snapshot-changed',
  'message-delta',
  'conversation-limit',
  'row-limit',
  'byte-limit',
  'profile-changed',
  'controller-close',
  'account-pause',
  'removal',
  'hidden',
  'sync-failed',
  'probe-failed',
  'live-disconnected',
  'live-hint',
  'confirmed',
  'eligible',
  'missing',
  'disconnected',
  'pending-confirmation',
  'epoch-mismatch',
  'candidate-present',
  'not-connected',
  'engine-unavailable',
  'window-unavailable',
  'projection-unavailable',
  'restored',
  'voice-preview',
  'projection-mismatch',
  'no-selection',
  'admitted',
  'staged',
  'sending',
  'accepted',
  'retired',
  'presented',
] as const;
export type ChatSyncReason = (typeof chatSyncReasons)[number];
const failures = [
  'generation-changed',
  'authorization',
  'conflict',
  'aborted',
  'failed',
] as const;
export interface ChatSyncDecision extends WorkDiagnosticFields {
  event: (typeof chatSyncEvents)[number];
  reason: ChatSyncReason;
  windows?: number;
  rows?: number;
  bytes?: number;
  epoch?: number;
  windowEpoch?: number;
  windowRows?: number;
  /** A per-capture slot for one group message; never its ID. */
  message?: number;
  connected?: boolean;
  pending?: boolean;
  present?: boolean;
  busy?: boolean;
  maintenance?: boolean;
  session?: boolean;
  online?: boolean;
  suspended?: boolean;
  textPending?: boolean;
  older?: boolean;
  failure?: (typeof failures)[number];
  callers?: readonly string[];
}
export interface ChatSyncTrace extends ChatSyncDecision {
  version: 1;
  source: number;
  conversation: number;
}

/** The console bridge accepts only this fixed, content-free protocol. */
export function readChatSyncTrace(value: unknown): ChatSyncTrace | null {
  if (typeof value !== 'object' || value === null) return null;
  const input = value as Record<string, unknown>;
  if (
    input['version'] !== 1 ||
    !chatSyncEvents.some((v) => v === input['event']) ||
    !chatSyncReasons.some((v) => v === input['reason'])
  )
    return null;
  const result: Record<string, unknown> = {
    version: 1,
    event: input['event'],
    reason: input['reason'],
  };
  copyNumbers(input, result);
  if (
    typeof result['source'] !== 'number' ||
    typeof result['conversation'] !== 'number'
  )
    return null;
  copyState(input, result);
  copyWorkDiagnostic(input, result);
  if (failures.some((failure) => failure === input['failure']))
    result['failure'] = input['failure'];
  if (Array.isArray(input['callers']))
    result['callers'] = input['callers']
      .filter(
        (caller: unknown) =>
          typeof caller === 'string' &&
          /^app-[a-f0-9]{16}\.js:\d{1,8}:\d{1,8}$/u.test(caller),
      )
      .slice(0, 6);
  return result as unknown as ChatSyncTrace;
}
function copyNumbers(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  for (const key of [
    'source',
    'conversation',
    'windows',
    'rows',
    'bytes',
    'epoch',
    'windowEpoch',
    'windowRows',
    'message',
  ]) {
    const number = input[key];
    if (
      typeof number === 'number' &&
      Number.isSafeInteger(number) &&
      number >= -1
    )
      result[key] = number;
  }
}
function copyState(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  for (const key of [
    'connected',
    'pending',
    'present',
    'busy',
    'maintenance',
    'session',
    'online',
    'suspended',
    'textPending',
    'older',
  ])
    if (typeof input[key] === 'boolean') result[key] = input[key];
}

export type { WorkDiagnosticFields } from './work.ts';
