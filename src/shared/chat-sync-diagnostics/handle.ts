export const handleDiagnosticRevision = 2;
export const handleDeliveryStages = [
  'paired',
  'pair-unavailable',
  'linked',
  'overflow',
  'submit',
  'accepted',
  'sender-check',
  'downloaded',
  'processing-start',
  'processing-end',
  'decrypt-start',
  'decrypted',
  'verified',
  'stored',
  'dom',
  'frame',
  'offscreen',
] as const;
export type HandleDeliveryStage = (typeof handleDeliveryStages)[number];
export interface HandleDiagnosticFields {
  handleTimings?: boolean;
  handleRevision?: number;
  handlePairFingerprint?: string;
  handleRead?: number;
  senderMessage?: number;
  handleStage?: HandleDeliveryStage;
  handleTag?: string;
  handleVisible?: boolean;
  handleComposing?: boolean;
  handleConnecting?: boolean;
}

export function handlePairCode(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{32}$/u.test(value);
}

export function readHandlePair(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || !('handlePair' in value))
    return;
  return handlePairCode(value.handlePair) ? value.handlePair : undefined;
}

export function copyHandleDiagnostic(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  copyCoverage(input, result);
  if (input['event'] === 'handle-refresh') {
    for (const key of ['handleVisible', 'handleComposing', 'handleConnecting'])
      if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (input['event'] === 'handle-delivery') copyMessage(input, result);
}
function copyCoverage(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  if (input['event'] !== 'ready') return;
  if (typeof input['handleTimings'] === 'boolean')
    result['handleTimings'] = input['handleTimings'];
  if (Number.isSafeInteger(input['handleRevision']))
    result['handleRevision'] = input['handleRevision'];
}
function copyMessage(
  input: Record<string, unknown>,
  result: Record<string, unknown>,
): void {
  if (handleDeliveryStages.some((stage) => stage === input['handleStage']))
    result['handleStage'] = input['handleStage'];
  if (
    Number.isSafeInteger(input['senderMessage']) &&
    Number(input['senderMessage']) > 0
  )
    result['senderMessage'] = input['senderMessage'];
  if (
    input['handleStage'] === 'paired' &&
    handlePairCode(input['handlePairFingerprint'])
  )
    result['handlePairFingerprint'] = input['handlePairFingerprint'];
  if (input['handleStage'] === 'linked' && handlePairCode(input['handleTag']))
    result['handleTag'] = input['handleTag'];
}
