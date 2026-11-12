/** In-process capability only. Never serialized or sent to the server. */
export interface HandleReadToken {
  slot: number;
  owner: object;
}
/** Capture-local linkage, never a durable message or account identifier. */
export interface HandleSendToken {
  slot: number;
  owner: object;
}
export const handleListCallers = [
  'directory',
  'visible-list',
  'identity',
  'inbox',
  'unspecified',
] as const;
export type HandleListCaller = (typeof handleListCallers)[number];
export const sendPreparationPoints = [
  'flush-request',
  'outbox-ready',
  'runtime-ready',
  'identity-ready',
  'authority-request',
  'authority-ready',
  'profile-ready',
  'own-directory-ready',
  'authority-assembled',
  'engine-ready',
] as const;
export type SendPreparationPoint = (typeof sendPreparationPoints)[number];
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
  handleSend?: HandleSendToken;
  handleListCaller?: HandleListCaller;
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
  handleSend?: number;
  sendPreparation?: SendPreparationPoint;
  handleListCaller?: HandleListCaller;
  listShared?: boolean;
}
export function copyFlowDiagnostic(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  if (typeof input['flowOverflow'] === 'boolean')
    output['flowOverflow'] = input['flowOverflow'];
  for (const key of [
    'diagnosticWork',
    'handleRead',
    'handleHint',
    'handleSend',
  ])
    if (Number.isSafeInteger(input[key]) && Number(input[key]) > 0)
      output[key] = input[key];
  if (authorityKinds.some((kind) => kind === input['authorityKind']))
    output['authorityKind'] = input['authorityKind'];
  for (const key of ['workPhase', 'readPhase'] as const)
    if (phases[key].has(String(input[key]))) output[key] = input[key];
  if (['interactive', 'maintenance'].includes(String(input['workPriority'])))
    output['workPriority'] = input['workPriority'];
  copyHandlePreparation(input, output);
}

function copyHandlePreparation(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  if (handleListCallers.some((caller) => caller === input['handleListCaller']))
    output['handleListCaller'] = input['handleListCaller'];
  if (sendPreparationPoints.some((point) => point === input['sendPreparation']))
    output['sendPreparation'] = input['sendPreparation'];
  if (typeof input['listShared'] === 'boolean')
    output['listShared'] = input['listShared'];
}

const phases = {
  workPhase: new Set(['queued', 'admitted', 'start', 'complete', 'failed']),
  readPhase: new Set(['queued', 'start', 'complete', 'failed']),
};
