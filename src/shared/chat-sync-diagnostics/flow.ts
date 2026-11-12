/** In-process capability only. Never serialized or sent to the server. */
export interface HandleReadToken {
  slot: number;
  owner: object;
}
export const authorityKinds = [
  'vault',
  'handle-read',
  'handle-crypto',
  'handle-request',
  'handle-media-stage',
  'group',
] as const;
export type AuthorityKind = (typeof authorityKinds)[number];
export interface AuthorityDiagnosticContext {
  diagnosticOperation?: AuthorityKind;
  handleRead?: HandleReadToken;
}
export interface FlowDiagnosticFields {
  flowOverflow?: boolean;
  diagnosticWork?: number;
  workPhase?: 'queued' | 'admitted' | 'start' | 'complete' | 'failed';
  authorityKind?: AuthorityKind;
  workPriority?: 'interactive' | 'maintenance';
  handleRead?: number;
  handleHint?: number;
  readPhase?: 'queued' | 'start' | 'complete' | 'failed';
}
export function copyFlowDiagnostic(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  if (typeof input['flowOverflow'] === 'boolean')
    output['flowOverflow'] = input['flowOverflow'];
  for (const key of ['diagnosticWork', 'handleRead', 'handleHint'])
    if (Number.isSafeInteger(input[key]) && Number(input[key]) > 0)
      output[key] = input[key];
  if (authorityKinds.some((kind) => kind === input['authorityKind']))
    output['authorityKind'] = input['authorityKind'];
  for (const key of ['workPhase', 'readPhase'] as const)
    if (phases[key].has(String(input[key]))) output[key] = input[key];
  if (['interactive', 'maintenance'].includes(String(input['workPriority'])))
    output['workPriority'] = input['workPriority'];
}

const phases = {
  workPhase: new Set(['queued', 'admitted', 'start', 'complete', 'failed']),
  readPhase: new Set(['queued', 'start', 'complete', 'failed']),
};
