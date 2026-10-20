import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageKey, pageContent } from '../src/client/app/pages.ts';

await test('legacy settings links and wallet returns open Profile', () => {
  for (const fragment of [
    '#perfil',
    '#configuracoes',
    '#configuracoes?ticket=pedido-sintetico&wallet=Phantom&ecosystem=solana',
    '#configuracoes?wallet=MetaMask&ecosystem=evm&ticket=pedido-sintetico',
  ])
    assert.equal(pageKey(fragment), 'perfil');
});

await test('accessibility anchor does not navigate and unknown routes expose no legacy pages', () => {
  assert.equal(pageKey('#workspace'), null);
  for (const fragment of ['', '#desconhecida', '#constructor', '#__proto__'])
    assert.equal(pageKey(fragment), 'conversas');
  assert.equal(pageKey('#contatos?convite=convite-sintetico'), 'contatos');
  assert.equal(pageKey('#comunidades?view=following'), 'comunidades');
  assert.equal(pageKey('#comunidades?id=identificador'), 'comunidades');
});

await test('logged-out Profile mounts only the login entry; settings require a session', () => {
  assert.equal(pageContent('perfil', false), '');
  assert.match(pageContent('perfil', true), /data-device-settings/u);
  assert.equal(
    pageContent('comunidades', false),
    pageContent('comunidades', true),
  );
});
