import assert from 'node:assert/strict';
import { test } from 'node:test';
import { storageSize } from '../src/client/vault-ui/index.ts';

await test('medidor do cofre mostra MB abaixo de 1 GB e GB a partir dele', () => {
  const cases: [number, string][] = [
    [0, '0 MB'],
    [2_340_000, '2,3 MB'],
    [312_400_000, '312 MB'],
    [1_000_000_000, '1 GB'],
    [1_250_000_000, '1,3 GB'],
  ];
  for (const [bytes, label] of cases) assert.equal(storageSize(bytes), label);
});
