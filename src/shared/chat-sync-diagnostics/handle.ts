export const handleDeliveryStages = [
  'paired',
  'pair-unavailable',
  'linked',
  'overflow',
  'submit',
  'accepted',
  'sender-check',
  'downloaded',
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
  if (input['event'] === 'ready' && typeof input['handleTimings'] === 'boolean')
    result['handleTimings'] = input['handleTimings'];
  if (input['event'] === 'handle-refresh') {
    for (const key of ['handleVisible', 'handleComposing', 'handleConnecting'])
      if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (input['event'] !== 'handle-delivery') return;
  if (handleDeliveryStages.some((stage) => stage === input['handleStage']))
    result['handleStage'] = input['handleStage'];
  const tag = input['handleTag'];
  if (input['handleStage'] === 'linked' && handlePairCode(tag))
    result['handleTag'] = tag;
}
