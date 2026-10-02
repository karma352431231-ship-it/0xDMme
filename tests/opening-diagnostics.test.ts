import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openingDiagnostics } from '../src/client/account/opening-diagnostics.ts';

await test('diagnóstico de abertura não reproduz valores privados nem admite texto externo', () => {
  const target =
    'https://0xdmme.app/wallet-entry?ticket=PRIVATE&ecosystem=PRIVATE&view=PRIVATE';
  const result = openingDiagnostics(
    `https://backpack.app/ul/v1/browse/${encodeURIComponent(target)}?ref=PRIVATE`,
    'PRIVATE',
  );
  assert.match(
    result ?? '',
    /plataforma=other.*destino=entrada.*modo=padrao.*pedido=invalido.*rede=outra/u,
  );
  assert.doesNotMatch(result ?? '', /PRIVATE|ticket=|https:/u);
  assert.equal(openingDiagnostics('invalid PRIVATE', 'ios'), null);
  assert.equal(
    openingDiagnostics('https://other.example/PRIVATE', 'ios'),
    null,
  );
  assert.match(
    openingDiagnostics('https://backpack.app/ul/v1/browse/%', 'ios') ?? '',
    /destino=invalido/u,
  );
});
