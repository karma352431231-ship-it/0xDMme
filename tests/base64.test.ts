import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  decodeCanonicalBase64,
  encodeCanonicalBase64,
} from '../src/shared/base64/index.ts';

for (const fallback of [false, true])
  await test(`canonical decoder preserves exact bytes and strict rejection, fallback=${fallback}`, () => {
    withCodecs(fallback, () => {
      for (const size of [0, 1, 2, 3, 255, 65536, 131072]) {
        const bytes = Uint8Array.from({ length: size }, (_, i) => i % 256);
        const text = Buffer.from(bytes).toString('base64');
        assert.equal(encodeCanonicalBase64(bytes), text);
        assert.equal(
          encodeCanonicalBase64(bytes.subarray(1, Math.max(1, size - 1))),
          Buffer.from(bytes.subarray(1, Math.max(1, size - 1))).toString(
            'base64',
          ),
        );
        assert.deepEqual(decodeCanonicalBase64(text, size), bytes);
        if (size) assert.throws(() => decodeCanonicalBase64(text, size - 1));
      }
      for (const maximum of [-1, NaN, Infinity, 0.5])
        assert.throws(() => decodeCanonicalBase64('', maximum));
      for (const text of [
        'A',
        'AAA',
        'A===',
        '====',
        '=AAA',
        'AA=A',
        'AB==',
        'AAB=',
        'Zg',
        'Zg==\n',
        ' Zg==',
        'AA-_',
        'éAAA',
      ])
        assert.throws(
          () => decodeCanonicalBase64(text, 131072),
          TypeError,
          text,
        );
      for (let last = 0; last < 64; last++) {
        const alphabet =
          'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        const text = 'A' + alphabet[last]! + '==';
        assert.equal(
          Buffer.from(Buffer.from(text, 'base64')).toString('base64') === text,
          last % 16 === 0,
        );
        if (last % 16) assert.throws(() => decodeCanonicalBase64(text, 1));
        else assert.equal(decodeCanonicalBase64(text, 1).length, 1);
        const two = 'AA' + alphabet[last]! + '=';
        if (last % 4) assert.throws(() => decodeCanonicalBase64(two, 2));
        else assert.equal(decodeCanonicalBase64(two, 2).length, 2);
      }
    });
  });

function withCodecs(fallback: boolean, work: () => void): void {
  const surfaces = [
    { host: Uint8Array, key: 'fromBase64' },
    { host: Uint8Array.prototype, key: 'toBase64' },
  ];
  const descriptors = surfaces.map(({ host, key }) =>
    Object.getOwnPropertyDescriptor(host, key),
  );
  try {
    if (fallback)
      for (const { host, key } of surfaces)
        Object.defineProperty(host, key, {
          configurable: true,
          value: undefined,
        });
    work();
  } finally {
    surfaces.forEach(({ host, key }, index) => {
      const descriptor = descriptors[index];
      if (descriptor) Object.defineProperty(host, key, descriptor);
      else Reflect.deleteProperty(host, key);
    });
  }
}
