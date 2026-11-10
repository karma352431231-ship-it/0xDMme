export const sendStages = [
  'selection-read',
  'selection-validate',
  'content-encode',
  'draft-seal',
  'draft-open',
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
] as const;
export type SendStage = (typeof sendStages)[number];
export interface SendDiagnosticFields {
  sendStage?: SendStage;
  sendPhase?: 'start' | 'end' | 'point';
  sendMs?: number;
  sendSuccess?: boolean;
  sendTimings?: boolean;
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
  for (const key of ['sendSuccess', 'sendTimings'])
    if (typeof input[key] === 'boolean') result[key] = input[key];
}
