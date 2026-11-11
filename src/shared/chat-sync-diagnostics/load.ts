import { diagnosticCategory } from './network.ts';
export const loadKinds = [
  'history',
  'text',
  'image',
  'video',
  'file',
  'view-once-text',
  'view-once-image',
  'view-once-video',
  'view-once-file',
] as const;
export type LoadKind = (typeof loadKinds)[number];
export const loadStages = [
  'start',
  'verified',
  'dom',
  'frame',
  'queue',
  'download',
  'decrypt',
  'decode',
  'native-begin',
  'native-append',
  'native-show',
  'native-frame',
  'complete',
  'failed',
  'cancelled',
] as const;
export type LoadStage = (typeof loadStages)[number];
export interface LoadDiagnosticFields {
  load?: number;
  loadKind?: LoadKind;
  loadStage?: LoadStage;
  loadMs?: number;
  loadStageMs?: number;
  loadRows?: number;
  loadBytes?: number;
  loadOutcome?: 'complete' | 'failed' | 'cancelled' | 'unavailable' | 'timeout';
  loadPresentation?:
    'dom-frame-opportunity' | 'native-draw' | 'video-frame' | 'unavailable';
  nativeRequest?: number;
  nativePhase?: 'start' | 'headers' | 'body' | 'failed' | 'cancelled';
  nativeCategory?: string;
  nativeStatus?: number;
  nativeBytes?: number;
  nativeMs?: number;
  nativeTimings?: boolean;
  loadTimings?: boolean;
}
export function copyLoadDiagnostic(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  for (const key of [
    'load',
    'loadMs',
    'loadStageMs',
    'loadRows',
    'loadBytes',
    'nativeRequest',
    'nativeStatus',
    'nativeBytes',
    'nativeMs',
  ])
    if (
      typeof input[key] === 'number' &&
      Number.isSafeInteger(input[key]) &&
      input[key] >= 0
    )
      output[key] = input[key];
  copyChoice(input, output, 'loadKind', loadKinds);
  copyChoice(input, output, 'loadStage', loadStages);
  copyChoice(input, output, 'loadOutcome', [
    'complete',
    'failed',
    'cancelled',
    'unavailable',
    'timeout',
  ]);
  copyChoice(input, output, 'loadPresentation', [
    'dom-frame-opportunity',
    'native-draw',
    'video-frame',
    'unavailable',
  ]);
  copyChoice(input, output, 'nativePhase', [
    'start',
    'headers',
    'body',
    'failed',
    'cancelled',
  ]);
  const category = input['nativeCategory'];
  if (diagnosticCategory(category)) output['nativeCategory'] = category;
  for (const key of ['nativeTimings', 'loadTimings'])
    if (typeof input[key] === 'boolean') output[key] = input[key];
}
function copyChoice(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  key: string,
  choices: readonly string[],
): void {
  if (choices.includes(String(input[key]))) output[key] = input[key];
}
