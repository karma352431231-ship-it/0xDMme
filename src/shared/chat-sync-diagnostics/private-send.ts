import { diagnosticRequestCategory } from './network.ts';
/** Local capability; never persisted, signed or passed to a request payload. */
export interface PrivateSendContext {
  readonly owner: object;
  readonly message?: number;
  readonly batch?: number;
  readonly attempt?: number;
}
export const privateSendRevision = 1;
export const sendWaitReasons = [
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
