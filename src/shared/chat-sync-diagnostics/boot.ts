export const bootMilestones = [
  'snapshot',
  'shell-frame',
  'contacts-frame',
  'conversations-frame',
] as const;
export type BootMilestone = (typeof bootMilestones)[number];
export interface NativeBootTiming {
  activityMs: number;
  webViewMs: number;
  documentMs: number;
  documentStartedMs: number;
}
/** Strict, fixed metadata contract; never forward arbitrary bridge properties. */
export function readNativeBootTiming(input: unknown): NativeBootTiming {
  if (typeof input !== 'object' || input === null)
    throw new TypeError('Invalid startup timing.');
  const value = input as Record<string, unknown>;
  const keys = ['activityMs', 'webViewMs', 'documentMs', 'documentStartedMs'];
  if (
    Object.keys(value).length !== keys.length ||
    !keys.every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isSafeInteger(value[key]) &&
        value[key] >= 0 &&
        value[key] <= 600_000,
    )
  )
    throw new TypeError('Invalid startup timing.');
  if (
    Number(value['webViewMs']) > Number(value['documentMs']) ||
    Number(value['documentStartedMs']) > Number(value['documentMs']) ||
    Number(value['documentMs']) > Number(value['activityMs'])
  )
    throw new TypeError('Invalid startup timing.');
  return value as unknown as NativeBootTiming;
}
