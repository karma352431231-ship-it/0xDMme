import assert from 'node:assert/strict';
import { test } from 'node:test';
import { encode } from '../src/shared/account/index.ts';
import {
  groupPhoto,
  groupProfilePhoto,
  groupTitle,
  profilePhotoUpdate,
} from '../src/shared/group-messages/index.ts';
import { backupRecord } from '../src/client/backup-records/index.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
await test('avatar é restrito em formato, bytes, pixels e metadados; perfil antigo e remoção explícita permanecem distintos', () => {
  const photo = fixtureGroupPhoto();
  assert.equal(groupTitle({ version: 1, title: 'Grupo', photo }), 'Grupo');
  assert.equal(groupProfilePhoto({ version: 1, title: 'Grupo' }), undefined);
  assert.deepEqual(
    profilePhotoUpdate(
      { version: 1, title: 'Novo' },
      { version: 1, title: 'Grupo', photo },
    ),
    { photo },
  );
  assert.deepEqual(
    profilePhotoUpdate(
      { version: 1, title: 'Grupo', photo: null },
      { version: 1, title: 'Grupo', photo },
    ),
    { photo: null },
  );
  for (const bad of [
    { ...photo, type: 'image/svg+xml' },
    { ...photo, base64: encode(new Uint8Array(16_385)) },
    { ...photo, base64: 'erro' },
    { ...photo, url: 'https://example.com' },
  ])
    assert.throws(() => groupPhoto(bad));
  assert.throws(() => fixtureGroupPhoto(193));
  const metadata = Uint8Array.from([
    255, 216, 255, 225, 0, 4, 1, 2, 255, 192, 0, 11, 8, 0, 1, 0, 1, 1, 1, 17, 0,
    255, 218, 0, 2, 0, 255, 217,
  ]);
  assert.throws(
    () => groupPhoto({ type: 'image/jpeg', base64: encode(metadata) }),
    /metadados/u,
  );
});
await test('backup existente conserva o avatar no texto do perfil sem alterar seu formato', () => {
  const text = JSON.stringify({
    version: 1,
    title: 'Grupo',
    photo: fixtureGroupPhoto(),
  });
  const record = backupRecord({
    type: 'group-message',
    id: crypto.randomUUID(),
    hash: 'a'.repeat(64),
    groupId: crypto.randomUUID(),
    sequence: 3,
    epoch: 2,
    sender: crypto.randomUUID(),
    own: false,
    kind: 'profile',
    text,
  });
  assert.equal(record.type, 'group-message');
  if (record.type === 'group-message') assert.equal(record.text, text);
});
