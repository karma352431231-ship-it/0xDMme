import { base64, encode, keys, object } from '../../shared/account/index.ts';
import { validatePhoto } from '../account-profile/index.ts';
export interface ProfileCard {
  name: string;
  revision: number;
  photo: { type: string; bytes: Uint8Array<ArrayBuffer> } | null;
}
export function profileCard(input: unknown): ProfileCard {
  const data = object(input);
  keys(data, ['name', 'revision', 'photo']);
  if (
    typeof data['name'] !== 'string' ||
    data['name'].length > 80 ||
    typeof data['revision'] !== 'number' ||
    !Number.isSafeInteger(data['revision']) ||
    data['revision'] < 0
  )
    throw new Error('Cartão de perfil inválido.');
  if (data['photo'] === null)
    return { name: data['name'], revision: data['revision'], photo: null };
  const photo = object(data['photo']);
  keys(photo, ['type', 'base64']);
  if (typeof photo['type'] !== 'string')
    throw new Error('Tipo de foto inválido.');
  const bytes = Uint8Array.from(base64(photo['base64'], 3_000_000));
  validatePhoto(photo['type'], bytes);
  return {
    name: data['name'],
    revision: data['revision'],
    photo: { type: photo['type'], bytes },
  };
}
export function encodeProfileCard(card: ProfileCard): string {
  return JSON.stringify({
    name: card.name,
    revision: card.revision,
    photo: card.photo
      ? { type: card.photo.type, base64: encode(card.photo.bytes) }
      : null,
  });
}
