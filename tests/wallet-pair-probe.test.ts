import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Wallet } from 'ethers';
import { ed25519 } from '@noble/curves/ed25519';
import { base58 } from '@scure/base';
import {
  createProbeContext,
  recoveryMessage,
} from '../src/client/wallet-recovery-probe/index.ts';
import type { ProbeContext } from '../src/client/wallet-recovery-probe/index.ts';
import { openPair, sealPair } from '../src/client/wallet-pair-probe/index.ts';

const origin = 'https://0xdmme.app';
interface Signer {
  context: ProbeContext;
  sign: () => Promise<string>;
}
function evm(value: number): Signer {
  const wallet = new Wallet(`0x${value.toString(16).padStart(64, '0')}`);
  const context = createProbeContext({
    origin,
    identity: { ecosystem: 'evm', address: wallet.address },
  });
  return {
    context,
    sign: () => wallet.signMessage(recoveryMessage(context)),
  };
}
function solana(value: number): Signer {
  const secret = new Uint8Array(32).fill(value);
  const context = createProbeContext({
    origin,
    identity: {
      ecosystem: 'solana',
      address: base58.encode(ed25519.getPublicKey(secret)),
    },
  });
  return {
    context,
    sign: () =>
      Promise.resolve(
        base58.encode(
          ed25519.sign(
            new TextEncoder().encode(recoveryMessage(context)),
            secret,
          ),
        ),
      ),
  };
}
async function sealed(first: Signer, second: Signer) {
  const signatures = [await first.sign(), await second.sign()];
  return {
    signatures,
    packet: await sealPair({
      contexts: [first.context, second.context],
      signatures,
    }),
  };
}

await test('a pair opens with fresh signatures from both wallets in either order', async () => {
  for (const [first, second] of [
    [evm(1), evm(2)],
    [evm(1), solana(7)],
    [solana(7), solana(8)],
  ] as const) {
    const { packet } = await sealed(first, second);
    await openPair({
      packet,
      signatures: [await first.sign(), await second.sign()],
    });
    await openPair({
      packet,
      signatures: [await second.sign(), await first.sign()],
    });
  }
});

await test('sealing in the opposite wallet order gives a package the same pair opens', async () => {
  const first = evm(1);
  const second = solana(7);
  const { packet } = await sealed(second, first);
  assert.deepEqual(
    packet.contexts.map((context) => context.ecosystem),
    ['evm', 'solana'],
  );
  await openPair({
    packet,
    signatures: [await first.sign(), await second.sign()],
  });
});

await test('one wallet alone never opens a pair', async () => {
  const first = evm(1);
  const second = evm(2);
  const { packet } = await sealed(first, second);
  const own = await first.sign();
  await assert.rejects(
    openPair({ packet, signatures: [own, own] }),
    /signature from each wallet/u,
  );
  await assert.rejects(
    openPair({ packet, signatures: [own] }),
    /exactly two signatures/u,
  );
});

await test('a wallet outside the pair cannot stand in for a member', async () => {
  const first = evm(1);
  const second = evm(2);
  const outsider = evm(3);
  const { packet } = await sealed(first, second);
  await assert.rejects(
    openPair({
      packet,
      signatures: [await first.sign(), await outsider.sign()],
    }),
    /signature from each wallet/u,
  );
});

await test('a pair needs two different wallets', async () => {
  const wallet = evm(1);
  const signature = await wallet.sign();
  await assert.rejects(
    sealPair({
      contexts: [wallet.context, wallet.context],
      signatures: [signature, signature],
    }),
    /two different wallets/u,
  );
});

await test('tampered salt, ciphertext or member statement is rejected', async () => {
  const first = evm(1);
  const second = evm(2);
  const { packet, signatures } = await sealed(first, second);
  const flipped = (value: string) =>
    (value.startsWith('A') ? 'B' : 'A') + value.slice(1);
  await assert.rejects(
    openPair({
      packet: { ...packet, salt: flipped(packet.salt) },
      signatures,
    }),
    /could not open/u,
  );
  await assert.rejects(
    openPair({
      packet: { ...packet, ciphertext: flipped(packet.ciphertext) },
      signatures,
    }),
    /could not open/u,
  );
  // A member re-issued under a new test id has a different statement, so the
  // earlier signature no longer belongs to it.
  const reissued = createProbeContext({
    origin,
    identity: {
      ecosystem: 'evm',
      address: packet.contexts[0].address,
    },
  });
  await assert.rejects(
    openPair({
      packet: { ...packet, contexts: [reissued, packet.contexts[1]] },
      signatures,
    }),
    /signature from each wallet/u,
  );
});
