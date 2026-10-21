import { object } from '../account/index.ts';
export const groupDescriptionLimit = 1000;
export function groupDescription(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > groupDescriptionLimit ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) < 32 && !['\t', '\n', '\r'].includes(character),
    )
  )
    throw new Error('Invalid group description.');
  return value.trim();
}
export function groupProfileDescription(value: unknown): string | undefined {
  const data = object(value);
  return Object.hasOwn(data, 'description')
    ? groupDescription(data['description'])
    : undefined;
}
/** Legacy name/photo profiles cannot erase a newer description. Empty is explicit removal. */
export function profileDescriptionUpdate(
  value: unknown,
  previous: unknown,
): { description?: string } {
  const incoming = groupProfileDescription(value);
  const description =
    incoming === undefined && previous !== null
      ? groupProfileDescription(previous)
      : incoming;
  return description === undefined ? {} : { description };
}
