import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bindSettingsSections } from '../src/client/app/pages.ts';

await test('categorias abrem uma por vez e notificam o fechamento de aparelhos', () => {
  const account = Object.assign(new EventTarget(), {
    open: true,
    dataset: { settingsSection: 'account' },
  });
  const devices = Object.assign(new EventTarget(), {
    open: false,
    dataset: { settingsSection: 'devices' },
  });
  const app = Object.assign(new EventTarget(), {
    open: false,
    dataset: { settingsSection: 'app' },
  });
  const sections = [account, devices, app];
  const host = { querySelectorAll: () => sections } as unknown as HTMLElement;
  const closed: string[] = [];
  bindSettingsSections(host, (id) => closed.push(id));
  devices.open = true;
  devices.dispatchEvent(new Event('toggle'));
  assert.equal(account.open, false);
  assert.equal(devices.open, true);
  app.open = true;
  app.dispatchEvent(new Event('toggle'));
  assert.equal(devices.open, false);
  devices.dispatchEvent(new Event('toggle'));
  assert.deepEqual(closed, ['devices']);
  assert.equal(app.open, true);
});
