import assert from 'node:assert/strict';
import { test } from 'node:test';
import { updateBlockReason } from '../src/client/app/update-readiness.ts';

await test('atualização ignora painéis privados desconectados e preserva bloqueios reais com destino explícito', () => {
  let authenticated = false;
  let deviceReason: string | null = null;
  const ready = { canActivate: () => true },
    draft = { canActivate: () => false };
  const features = {
    authenticated: () => authenticated,
    account: ready,
    devices: { ...ready, updateBlockReason: () => deviceReason },
    vault: ready,
    backups: ready,
    contacts: ready,
    messages: ready,
    statuses: ready,
    representatives: ready,
    activity: ready,
    publicProfiles: draft,
    communities: ready,
    calls: { active: () => false },
  };
  assert.equal(updateBlockReason(features), null);
  authenticated = true;
  assert.match(updateBlockReason(features) ?? '', /Profile → Public profile/u);
  deviceReason = 'Conclua a vinculação.';
  authenticated = false;
  assert.equal(updateBlockReason(features), deviceReason);
});
