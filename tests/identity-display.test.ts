import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  avatarInitials,
  avatarTone,
  displayName,
  shortAddress,
} from '../src/client/appearance/index.ts';

const evm = '0xbff0cfec02510766e10c40c3bf3420eac1367867';
const solana = '7K52aYt9kq1Lr3wDcPq8sXv6mN2bJ4hF5EcxLhQz9TfA';

await test('carteiras sem nome aparecem abreviadas; nomes escolhidos ficam intactos', () => {
  assert.equal(displayName(evm), '0xbff0…7867');
  assert.equal(displayName(solana), '7K52aY…9TfA');
  assert.equal(displayName('Ana Ribeiro'), 'Ana Ribeiro');
  assert.equal(displayName('0x curto'), '0x curto');
  assert.equal(shortAddress('abc'), 'abc');
});

await test('iniciais usam o nome ou os caracteres após 0x', () => {
  const cases: [string, string][] = [
    ['Ana Ribeiro', 'AR'],
    ['builders dao grupo', 'BD'],
    ['Marina', 'MA'],
    [evm, 'BF'],
    [solana, '7K'],
    ['   ', '#'],
  ];
  for (const [label, initials] of cases)
    assert.equal(avatarInitials(label), initials);
});

await test('a cor do avatar é estável para o mesmo endereço, sem distinguir maiúsculas', () => {
  const tone = avatarTone(evm);
  assert.equal(avatarTone(evm.toUpperCase().replace('0X', '0x')), tone);
  assert.match(tone, /^[0-5]$/u);
  const tones = new Set(
    Array.from({ length: 60 }, (_, i) => avatarTone(`0x${String(i)}`)),
  );
  assert.ok(tones.size > 3);
});
