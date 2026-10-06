import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageKey } from '../src/client/app/pages.ts';

await test('links antigos de configurações e retornos da wallet abrem o Perfil', () => {
  for (const fragment of [
    '#perfil',
    '#configuracoes',
    '#configuracoes?ticket=pedido-sintetico&wallet=Phantom&ecosystem=solana',
    '#configuracoes?wallet=MetaMask&ecosystem=evm&ticket=pedido-sintetico',
  ])
    assert.equal(pageKey(fragment), 'perfil');
});

await test('âncora de acessibilidade não navega e rotas desconhecidas não expõem páginas herdadas', () => {
  assert.equal(pageKey('#workspace'), null);
  for (const fragment of ['', '#desconhecida', '#constructor', '#__proto__'])
    assert.equal(pageKey(fragment), 'conversas');
  assert.equal(pageKey('#contatos?convite=convite-sintetico'), 'contatos');
});
