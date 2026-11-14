import type { PrivateSendContext } from './private-send.ts';
import type { LoadToken, LoadDiagnosticFields } from './load.ts';
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
  'vault-local',
  'vault',
  'handle-read',
  'handle-crypto',
  'handle-request',
  'handle-media-stage',
  'group',
  'group-draft',
  'group-send',
  'group-media',
  'group-media-preview',
  'group-identities',
  'group-directory',
  'conversation-previews',
  'archived-peers',
] as const;
export type AuthorityKind = (typeof authorityKinds)[number];
export const authoritySelections = [
  'interactive',
  'maintenance-share',
  'background',
  'held-follower',
] as const;
export interface AuthoritySelection {
  workSelection: (typeof authoritySelections)[number];
  workQueuedInteractive: number;
  workQueuedMaintenance: number;
  /** Capped at four: the state relevant to the maintenance share. */
  workInteractiveTurns: number;
}
export interface AuthorityDiagnosticContext {
  privateSend?: PrivateSendContext | undefined;
  diagnosticOperation?: AuthorityKind;
  diagnosticLoad?: LoadToken | undefined;
  handleRead?: HandleReadToken;
  handleSend?: HandleSendToken;
  handleListCaller?: HandleListCaller;
}
export interface FlowDiagnosticFields
  extends
    Partial<AuthoritySelection>,
    Pick<LoadDiagnosticFields, 'load' | 'loadMs'> {
  authorityQueue?: number;
  workClockMs?: number;
  flowOverflow?: boolean;
  diagnosticWork?: number;
  workPhase?:
    'queued' | 'admitted' | 'start' | 'complete' | 'failed' | 'platform';
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
  for (const key of ['handleRead', 'handleHint', 'handleSend'])
    if (Number.isSafeInteger(input[key]) && Number(input[key]) > 0)
      output[key] = input[key];
  if (authorityKinds.some((kind) => kind === input['authorityKind']))
    output['authorityKind'] = input['authorityKind'];
  for (const key of ['workPhase', 'readPhase'] as const)
    if (phases[key].has(String(input[key]))) output[key] = input[key];
  if (['interactive', 'maintenance'].includes(String(input['workPriority'])))
    output['workPriority'] = input['workPriority'];
  copyAuthorityTiming(input, output);
  copyAuthoritySelection(input, output);
  copyHandlePreparation(input, output);
}

function copyAuthoritySelection(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  if (authoritySelections.some((reason) => reason === input['workSelection']))
    output['workSelection'] = input['workSelection'];
  for (const key of ['workQueuedInteractive', 'workQueuedMaintenance'])
    if (
      Number.isSafeInteger(input[key]) &&
      Number(input[key]) >= 0 &&
      Number(input[key]) <= 64
    )
      output[key] = input[key];
  const turns = input['workInteractiveTurns'];
  if (Number.isSafeInteger(turns) && Number(turns) >= 0 && Number(turns) <= 4)
    output['workInteractiveTurns'] = turns;
}

function copyAuthorityTiming(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  for (const key of ['diagnosticWork', 'authorityQueue'])
    if (Number.isSafeInteger(input[key]) && Number(input[key]) > 0)
      output[key] = input[key];
  if (
    Number.isSafeInteger(input['workClockMs']) &&
    Number(input['workClockMs']) >= 0
  )
    output['workClockMs'] = input['workClockMs'];
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
  workPhase: new Set([
    'queued',
    'admitted',
    'start',
    'complete',
    'failed',
    'platform',
  ]),
  readPhase: new Set(['queued', 'start', 'complete', 'failed']),
};
