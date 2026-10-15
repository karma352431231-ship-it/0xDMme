import { object } from '../account/index.ts';

export interface MessagePresentation {
  sentAt?: number;
}
/** Optional authenticated application metadata. Legacy encrypted bodies omit it. */
export function messagePresentation(value: unknown): MessagePresentation {
  if (value === undefined) return {};
  const data = object(value);
  if (data['version'] !== 1) throw new Error('Invalid message presentation.');
  return optionalSentAt(data['sentAt']);
}
export function optionalSentAt(value: unknown): MessagePresentation {
  if (value === undefined) return {};
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 8640000000000000
  )
    throw new Error('Invalid message time.');
  return { sentAt: value };
}
export function sentAtKeys(data: Record<string, unknown>): string[] {
  return Object.hasOwn(data, 'sentAt') ? ['sentAt'] : [];
}
