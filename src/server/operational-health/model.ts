export const diagnosticReasons = [
  'startup',
  'shutdown',
  'unexpected-restart',
  'slow-request',
  'server-error',
  'request-aborted',
  'health-unavailable',
  'web-server-error',
] as const;
export type DiagnosticReason = (typeof diagnosticReasons)[number];
export type RequestArea = 'health' | 'account' | 'public' | 'asset';
export interface DiagnosticEvent {
  reason: DiagnosticReason;
  area?: RequestArea;
  elapsedMs?: number;
  deadlineDelayMs?: number;
}
export function reportObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid diagnostic report.');
  return value as Record<string, unknown>;
}
