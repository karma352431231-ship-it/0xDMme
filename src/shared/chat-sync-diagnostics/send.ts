export const sendStages = [
  'group-message-slot',
  'start-not-observed',
  'started-before-capture',
  'group-send-entry',
  'group-verify',
  'group-directories',
  'group-packet',
  'receipt-yield',
  'receipt-start',
  'receipt-at-submit',
  'receipt-awaited',
  'receipt-attempt',
  'receipt-retry',
  'receipt-commit',
  'receipt-release',
  'receipt-resource-release',
  'receipt-complete',
  'receipt-failed',
  'receipt-fetch',
  'receipt-verify',
  'receipt-persist',
  'receipt-confirm',
  'receipt-progress',
  'receipt-ack',
  'receipt-sdk-open',
  'receipt-sdk-prepare',
  'receipt-key-inbox',
  'local-verify',
  'receipt-decrypt',
  'local-keyring',
  'local-identity',
  'local-ring',
  'local-storage-open',
  'outbox-transaction',
  'outbox-write-ready',
  'outbox-commit',
  'platform-lock',
  'submission-enqueued',
  'submission-eligible',
  'submission-admitted',
  'staging-invoked',
  'logical-submit',
  'draft-admitted',
  'enqueued',
  'local-save',
  'scheduler-wait',
  'scheduler-eligible',
  'foreground-acquired',
  'outbox-dispatch',
  'pending-page',
  'pins-load',
  'preflight',
  'target-directory',
  'pins-save',
  'transmit-admission',
  'authority-compare',
  'batch-member',
  'earlier-draft',
  'recovery',
  'sdk-open',
  'sdk-prepare',
  'packet-prepare',
  'accepted-check',
  'pending-render',
  'check-limit',
  'send-failed',
  'send-cancelled',
  'request-dispatch',
  'request-response',
  'selection-read',
  'selection-validate',
  'content-encode',
  'draft-seal',
  'draft-open',
  'draft-save',
  'flush-ready',
  'device-keys',
  'recipient-verify',
  'sender-keys',
  'recipient-keys',
  'message-encrypt',
  'packet-save',
  'server-publish',
  'payload-serialize',
  'payload-encrypt',
  'payload-prepare',
  'descriptor',
  'attachment-prepare',
  'attachment-stage',
  'upload',
  'submit',
  'accepted',
  'check-render',
  'staging-complete',
  'transfer-complete',
  'ui-available',
  'ui-blocked',
  'content-validate',
  'policy-detect',
  'ciphertext-hash',
  'recovery-wrap',
  'descriptor-bytes',
] as const;
export type SendStage = (typeof sendStages)[number];
export interface SendDiagnosticFields {
  sendStage?: SendStage;
  sendPhase?: 'start' | 'end' | 'point';
  sendMs?: number;
  sendSuccess?: boolean;
  sendTimings?: boolean;
  sendPreparationTimings?: boolean;
  sendBlock?:
    | 'engine'
    | 'queue-full'
    | 'authorization'
    | 'history'
    | 'recording'
    | 'editing';
}
/** Never reflect arbitrary annotations, filenames, IDs or exception text. */
export function copySendDiagnostic(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  if (sendStages.some((stage) => stage === input['sendStage']))
    result['sendStage'] = input['sendStage'];
  if (['start', 'end', 'point'].includes(String(input['sendPhase'])))
    result['sendPhase'] = input['sendPhase'];
  const ms = input['sendMs'];
  if (typeof ms === 'number' && Number.isSafeInteger(ms) && ms >= 0)
    result['sendMs'] = ms;
  for (const key of ['sendSuccess', 'sendTimings', 'sendPreparationTimings'])
    if (typeof input[key] === 'boolean') result[key] = input[key];
  if (
    [
      'engine',
      'queue-full',
      'authorization',
      'history',
      'recording',
      'editing',
    ].includes(String(input['sendBlock']))
  )
    result['sendBlock'] = input['sendBlock'];
}
