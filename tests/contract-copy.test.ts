import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contractParts } from '../src/client/contract-copy/index.ts';

await test('contract addresses in public text: EVM and Solana are found, ordinary text is not', () => {
  const solana = 'HuAXPyDWDaMYFKuwQHpqL1oPnj93zdSJxJXhW4Mgpump';
  const evm = '0x6982508145454Ce325dDbE47a25d4ec3d2311933';
  const cases: [string, [string, boolean][]][] = [
    [
      `Comunidade de Teste\n\n${solana}`,
      [
        ['Comunidade de Teste\n\n', false],
        [solana, true],
      ],
    ],
    [
      `CA: ${evm}.`,
      [
        ['CA: ', false],
        [evm, true],
        ['.', false],
      ],
    ],
    // Too long, no mixed case, or part of a longer word: plain text.
    [`x${evm}`, [[`x${evm}`, false]]],
    [
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      [['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', false]],
    ],
    [`${solana}${solana}`, [[`${solana}${solana}`, false]]],
    ['', []],
  ];
  for (const [text, expected] of cases)
    assert.deepEqual(
      contractParts(text).map((part) => [part.text, part.contract]),
      expected,
      text,
    );
});
