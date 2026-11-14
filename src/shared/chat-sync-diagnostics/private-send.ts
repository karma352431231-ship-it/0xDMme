import { diagnosticRequestCategory } from './network.ts';
/** Local capability; never persisted, signed or passed to a request payload. */
export interface PrivateSendContext {
  readonly owner: object;
  readonly message?: number;
  readonly batch?: number;
  readonly attempt?: number;
  readonly receipt?: number;
  readonly receiptAttempt?: number;
}
export const privateSendRevision = 2;
export const sendWaitReasons = [
  'earlier-submission',
  'submission-admitting',
  'submission-running',
  'availability-unavailable',
  'earlier-draft',
  'foreground-operation',
  'maintenance',
  'media-submission',
  'receipt-page',
  'offline',
  'session',
  'suspended',
  'closed',
  'authority',
] as const;
export type SendWaitReason = (typeof sendWaitReasons)[number];
export interface PrivateSendFields {
  receiptTurn?: number;
  receiptAttempt?: number;
  receiptScope?: 'direct' | 'groups';
  receiptLive?: boolean;
  receiptMore?: boolean;
  receiptItems?: number;
  receiptPages?: number;
  receiptReason?:
    'snapshot-changed' | 'failed' | 'cancelled' | 'generation-changed';
  lockPhase?:
    | 'maintenance-queued'
    | 'maintenance-acquired'
    | 'turn-queued'
    | 'turn-acquired'
    | 'storage-queued'
    | 'storage-acquired'
    | 'released';
  lockCoverage?: 'platform-locks' | 'unavailable' | 'held-turn-follower';
  sendRequest?: string;
  privateRevision?: number;
  privateSend?: number;
  privateBatch?: number;
  privateAttempt?: number;
  privateOverflow?: boolean;
  sendSpan?: number;
  sendClockMs?: number;
  sendComposer?: number;
  sendGesture?: number;
  sendGestureClockMs?: number;
  sendWait?: SendWaitReason;
  sendOutcome?:
    | 'accepted'
    | 'not-accepted'
    | 'current'
    | 'changed'
    | 'skipped'
    | 'failed'
    | 'cancelled'
    | 'chat-not-visible'
    | 'already-present';
}
export function copyPrivateSendDiagnostic(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  for (const key of [
    'receiptTurn',
    'receiptAttempt',
    'receiptItems',
    'receiptPages',
    'privateRevision',
    'privateSend',
    'privateBatch',
    'privateAttempt',
    'sendSpan',
    'sendClockMs',
    'sendComposer',
    'sendGesture',
    'sendGestureClockMs',
  ])
    if (Number.isSafeInteger(input[key]) && Number(input[key]) >= 0)
      output[key] = input[key];
  for (const key of ['receiptLive', 'receiptMore'])
    if (typeof input[key] === 'boolean') output[key] = input[key];
  copyReceiptLabels(input, output);
  copySendLabels(input, output);
}
function copySendLabels(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  const request = input['sendRequest'];
  if (
    typeof request === 'string' &&
    diagnosticRequestCategory('/api/account/' + request) === request
  )
    output['sendRequest'] = request;
  if (typeof input['privateOverflow'] === 'boolean')
    output['privateOverflow'] = input['privateOverflow'];
  if (sendWaitReasons.some((reason) => reason === input['sendWait']))
    output['sendWait'] = input['sendWait'];
  if (
    [
      'accepted',
      'not-accepted',
      'current',
      'changed',
      'skipped',
      'failed',
      'cancelled',
      'chat-not-visible',
      'already-present',
    ].includes(String(input['sendOutcome']))
  )
    output['sendOutcome'] = input['sendOutcome'];
}

function copyReceiptLabels(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  const labels = {
    receiptScope: ['direct', 'groups'],
    receiptReason: [
      'snapshot-changed',
      'failed',
      'cancelled',
      'generation-changed',
    ],
    lockPhase: [
      'maintenance-queued',
      'maintenance-acquired',
      'turn-queued',
      'turn-acquired',
      'storage-queued',
      'storage-acquired',
      'released',
    ],
    lockCoverage: ['platform-locks', 'unavailable', 'held-turn-follower'],
  };
  for (const [key, allowed] of Object.entries(labels))
    if (allowed.includes(String(input[key]))) output[key] = input[key];
}
