import { object } from '../account/index.ts';

export interface MessagePresentation {
  sentAt?: number;
  contentFormat?: 'daily';
}
/** Optional authenticated application metadata. Legacy encrypted bodies omit it. */
export function messagePresentation(value: unknown): MessagePresentation {
  if (value === undefined) return {};
  const data = object(value);
  if (data['version'] !== 1) throw new Error('Invalid message presentation.');
  return {
    ...optionalSentAt(data['sentAt']),
    ...messageContentFormat(data['contentFormat']),
  };
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

/** Only new structured group bodies opt in; legacy raw text stays literal. */
export function messageContentFormat(
  value: unknown,
): Pick<MessagePresentation, 'contentFormat'> {
  if (value === undefined) return {};
  if (value !== 'daily') throw new Error('Invalid message content format.');
  return { contentFormat: 'daily' };
}
export function contentFormatKeys(data: Record<string, unknown>): string[] {
  return Object.hasOwn(data, 'contentFormat') ? ['contentFormat'] : [];
}
