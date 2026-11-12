/** Integer microseconds keep short chunk costs measurable without wall-clock data. */
export const nativeTimingFields = [
  'nativeServerUnixMs',
  'nativeReceiveUs',
  'nativeEncodeUs',
  'nativeReceiveSamples',
  'nativeBridgeUs',
  'nativeBridgeOnlyUs',
  'nativeWireUs',
  'nativeDecodeUs',
  'nativeReadBlocks',
  'nativeBodyReadUs',
  'nativeJsonParseUs',
] as const;
export type NativeTimingField = (typeof nativeTimingFields)[number];
export type NativeTimingFields = Partial<Record<NativeTimingField, number>> & {
  nativeJsonSuccess?: boolean;
};
export function copyNativeTiming(
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): void {
  for (const key of nativeTimingFields)
    if (
      typeof input[key] === 'number' &&
      Number.isSafeInteger(input[key]) &&
      input[key] >= 0
    )
      output[key] = input[key];
  if (typeof input['nativeJsonSuccess'] === 'boolean')
    output['nativeJsonSuccess'] = input['nativeJsonSuccess'];
}
export interface NativeWireTiming {
  receiveUs: number;
  encodeUs: number;
}
/** Optional Android diagnostic metadata; old/native production replies omit it. */
export function readNativeWireTiming(
  value: unknown,
): NativeWireTiming | undefined {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null)
    throw new TypeError('Native API exchange failed.');
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).length !== 2 ||
    !['receiveUs', 'encodeUs'].every(
      (key) =>
        typeof input[key] === 'number' &&
        Number.isSafeInteger(input[key]) &&
        input[key] >= 0 &&
        input[key] <= 600_000_000,
    )
  )
    throw new TypeError('Native API exchange failed.');
  return {
    receiveUs: Number(input['receiveUs']),
    encodeUs: Number(input['encodeUs']),
  };
}
