export const cryptoStages = [
  'decrypt-integrity',
  'decrypt-runtime',
  'decrypt-sdk',
  'decrypt-validate',
] as const;
export type CryptoStage = (typeof cryptoStages)[number];
export interface CryptoTiming {
  stage: CryptoStage;
  ms: number;
}
export type CryptoReporter = (stage: CryptoStage, ms: number) => void;
/** Worker replies contain bounded measurements, never crypto inputs/results. */
export function readCryptoTimings(value: unknown): CryptoTiming[] {
  if (!Array.isArray(value) || value.length > 8)
    throw new Error('Invalid local processing timing.');
  return value.map((raw: unknown) => {
    if (typeof raw !== 'object' || raw === null)
      throw new Error('Invalid local processing timing.');
    const input = raw as Record<string, unknown>;
    const stage = cryptoStages.find((choice) => choice === input['stage']);
    if (
      !stage ||
      Object.keys(input).length !== 2 ||
      typeof input['ms'] !== 'number' ||
      !Number.isSafeInteger(input['ms']) ||
      input['ms'] < 0 ||
      input['ms'] > 30_000
    )
      throw new Error('Invalid local processing timing.');
    return { stage, ms: input['ms'] };
  });
}
