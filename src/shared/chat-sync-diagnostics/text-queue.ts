export const queueWakeups = [
  'input',
  'save-complete',
  'transmission-complete',
  'receipt-settled',
  'maintenance-released',
  'connectivity',
  'session-view',
  'retry',
  'quiet-timer',
  'foreground-released',
  'status',
] as const;
export type QueueWakeup = (typeof queueWakeups)[number];

export const queueGates = [
  'active-transmission',
  'send-failed',
  'no-dirty-work',
  'available',
  'session',
  'offline',
  'suspended',
  'closed',
  'foreground-operation',
  'maintenance',
  'receipt-fairness',
  'media-submission',
  'unknown',
] as const;
export type QueueGate = (typeof queueGates)[number];

export const queuePhases = [
  'durable',
  'requested',
  'decision',
  'flush',
  'admitted',
  'deferred',
  'complete',
  'failed',
  'cancelled',
  'truncated',
] as const;
export type QueuePhase = (typeof queuePhases)[number];

export interface TextQueueObservation {
  phase: QueuePhase;
  trigger: QueueWakeup;
  generation: number;
  batch?: number;
  gate?: QueueGate;
}

export function copyTextQueueDiagnostic(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  for (const [key, values] of [
    ['queuePhase', queuePhases],
    ['queueTrigger', queueWakeups],
    ['queueGate', queueGates],
  ] as const)
    if (values.some((value) => value === input[key])) output[key] = input[key];
  for (const key of ['queueGeneration', 'queueBatch'])
    if (Number.isSafeInteger(input[key]) && Number(input[key]) >= 0)
      output[key] = input[key];
}
