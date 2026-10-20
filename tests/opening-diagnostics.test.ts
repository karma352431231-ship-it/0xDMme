import assert from 'node:assert/strict';
import { test } from 'node:test';
import { openingDiagnostics } from '../src/client/account/opening-diagnostics.ts';

await test('opening diagnostics reproduce no private values and accept no external text', () => {
  const target =
    'https://0xdmme.app/wallet-entry?ticket=PRIVATE&ecosystem=PRIVATE&view=PRIVATE';
  const result = openingDiagnostics(
    `https://backpack.app/ul/v1/browse/${encodeURIComponent(target)}?ref=PRIVATE`,
    'PRIVATE',
  );
  assert.match(
    result ?? '',
    /platform=other.*destination=entrada.*mode=padrao.*request=invalido.*network=outra/u,
  );
  assert.doesNotMatch(result ?? '', /PRIVATE|ticket=|https:/u);
  assert.equal(openingDiagnostics('invalid PRIVATE', 'ios'), null);
  assert.equal(
    openingDiagnostics('https://other.example/PRIVATE', 'ios'),
    null,
  );
  assert.match(
    openingDiagnostics('https://backpack.app/ul/v1/browse/%', 'ios') ?? '',
    /destination=invalid/u,
  );
});
