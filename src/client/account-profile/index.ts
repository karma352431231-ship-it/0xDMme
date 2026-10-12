import type { ProfilePreferences } from './preferences-draft.ts';
import { validatePhoto } from './photo-validation.ts';
export { validatePhoto } from './photo-validation.ts';
import {
  base64,
  encode,
  encryptedProfileLimit,
  object,
  keys,
  profileEnvelope,
  profileLimit,
} from '../../shared/account/index.ts';
import type { EncryptedProfile } from '../../shared/account/index.ts';

export { PrivatePreferencesDraft } from './preferences-draft.ts';
export type { ProfilePreferences } from './preferences-draft.ts';
export interface PrivateProfile {
  preferences: ProfilePreferences;
  photo: { type: string; bytes: Uint8Array<ArrayBuffer> } | null;
}
export function emptyProfile(): PrivateProfile {
  return {
    preferences: {
      discoverable: false,
      online: false,
      lastSeen: false,
      readReceipts: false,
      backupReminder: false,
    },
    photo: null,
  };
}

function preferences(value: unknown): ProfilePreferences {
  const data = object(value);
  keys(
    data,
    data['backupReminder'] === undefined
      ? ['discoverable', 'online', 'lastSeen', 'readReceipts']
      : [
          'discoverable',
          'online',
          'lastSeen',
          'readReceipts',
          'backupReminder',
        ],
  );
  const result = emptyProfile().preferences;
  for (const name of Object.keys(result) as (keyof ProfilePreferences)[]) {
    if (name === 'backupReminder' && data[name] === undefined) continue;
    if (typeof data[name] !== 'boolean')
      throw new Error('Preferência inválida.');
    result[name] = data[name];
  }
  return result;
}
export function encodePrivateProfile(profile: PrivateProfile): string {
  return JSON.stringify({
    preferences: preferences(profile.preferences),
    photo: profile.photo
      ? { type: profile.photo.type, bytes: encode(profile.photo.bytes) }
      : null,
  });
}
export function decodePrivateProfile(value: string): PrivateProfile {
  const data = object(JSON.parse(value) as unknown);
  keys(data, ['preferences', 'photo']);
  const result: PrivateProfile = {
    preferences: preferences(data['preferences']),
    photo: null,
  };
  if (data['photo'] !== null) {
    const photo = object(data['photo']);
    keys(photo, ['type', 'bytes']);
    if (typeof photo['type'] !== 'string')
      throw new Error('Foto de perfil inválida.');
    const bytes = base64(photo['bytes'], profileLimit);
    validatePhoto(photo['type'], bytes);
    result.photo = { type: photo['type'], bytes };
  }
  return result;
}

function additionalData(
  accountId: string,
  revision: number,
): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    JSON.stringify(['hash-talk-private-profile', 1, accountId, revision]),
  );
}

export async function sealProfile(input: {
  profile: PrivateProfile;
  key: CryptoKey;
  accountId: string;
  revision: number;
}): Promise<EncryptedProfile> {
  const photo = input.profile.photo;
  if (photo) validatePhoto(photo.type, photo.bytes);
  const metadata = new TextEncoder().encode(
    JSON.stringify({
      preferences: preferences(input.profile.preferences),
      photoType: photo?.type ?? null,
    }),
  );
  const plaintext = new Uint8Array(
    4 + metadata.length + (photo?.bytes.length ?? 0),
  );
  new DataView(plaintext.buffer).setUint32(0, metadata.length);
  plaintext.set(metadata, 4);
  if (photo) plaintext.set(photo.bytes, 4 + metadata.length);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const encrypted = await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv,
        additionalData: additionalData(input.accountId, input.revision),
      },
      input.key,
      plaintext,
    );
    return profileEnvelope({
      version: 1,
      revision: input.revision,
      iv: encode(iv),
      ciphertext: encode(new Uint8Array(encrypted)),
    });
  } finally {
    plaintext.fill(0);
  }
}

export async function openProfile(input: {
  envelope: EncryptedProfile;
  key: CryptoKey;
  accountId: string;
}): Promise<PrivateProfile> {
  const envelope = profileEnvelope(input.envelope);
  const plaintext = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: base64(envelope.iv, 12),
        additionalData: additionalData(input.accountId, envelope.revision),
      },
      input.key,
      base64(envelope.ciphertext, encryptedProfileLimit),
    ),
  );
  try {
    if (plaintext.length < 4) throw new Error('Perfil inválido.');
    const size = new DataView(plaintext.buffer).getUint32(0);
    if (size > 2048 || size > plaintext.length - 4)
      throw new Error('Perfil inválido.');
    const metadata = object(
      JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(
          plaintext.subarray(4, size + 4),
        ),
      ) as unknown,
    );
    const bytes = plaintext.slice(size + 4);
    const type = metadata['photoType'];
    if (type !== null && typeof type !== 'string')
      throw new Error('Foto inválida.');
    if (type) validatePhoto(type, bytes);
    else if (bytes.length) throw new Error('Perfil inválido.');
    return {
      preferences: preferences(metadata['preferences']),
      photo: type ? { type, bytes } : null,
    };
  } finally {
    plaintext.fill(0);
  }
}

export { profileKey } from './key-store.ts';
export { PrivatePhotoDraft } from './photo-draft.ts';
