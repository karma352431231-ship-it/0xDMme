import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from 'node:http';
import { Wallet, getBytes, hashMessage, hexlify, verifyMessage } from 'ethers';
import { secp256k1 } from '@noble/curves/secp256k1';
import { ed25519 } from '@noble/curves/ed25519';
import { base58, base64urlnopad } from '@scure/base';
import {
  createProbeContext,
  openProbe,
  readProbePacket,
  recoveryMessage,
  repeatableSignatures,
  sealProbe,
} from '../src/client/wallet-recovery-probe/index.ts';
import type { ProbePacket } from '../src/client/wallet-recovery-probe/index.ts';
import { ProbePacketSelection } from '../src/client/wallet-recovery-probe/packet-selection.ts';
import { startWalletRecoveryProbe } from '../src/server/wallet-recovery-probe/index.ts';

const origin = 'https://0xdmme.app';
function evmWallet(value = 1): Wallet {
  return new Wallet(`0x${value.toString(16).padStart(64, '0')}`);
}
async function evmPacket(value = 1) {
  const wallet = evmWallet(value);
  const identity = { ecosystem: 'evm' as const, address: wallet.address };
  const context = createProbeContext({ origin, identity });
  const signature = await wallet.signMessage(recoveryMessage(context));
  return {
    wallet,
    identity,
    context,
    signature,
    packet: await sealProbe(context, signature),
  };
}
function packetFile(packet: ProbePacket, name = 'ensaio.json'): File {
  return new File([JSON.stringify(packet)], name, {
    type: 'application/json',
  });
}

await test('EVM: nova instância da mesma conta abre somente o pacote cifrado, sem estado secreto anterior', async () => {
  const { context, signature, packet } = await evmPacket();
  const restored = evmWallet();
  const fresh = await restored.signMessage(recoveryMessage(context));
  assert.equal(
    repeatableSignatures({ context, first: signature, second: fresh }),
    true,
  );
  const json = JSON.stringify(packet);
  assert.equal(json.includes(signature), false);
  assert.equal(json.includes(restored.privateKey), false);
  assert.equal(json.includes('conteúdo fictício'), false);
  await openProbe({
    packet: readProbePacket(json),
    origin,
    identity: { ecosystem: 'evm', address: restored.address },
    signature: fresh,
  });
});
await test('Solana: duas instâncias Ed25519 determinísticas abrem o pacote sem chaves locais do ensaio', async () => {
  const privateKey = new Uint8Array(32).fill(7);
  const identity = {
    ecosystem: 'solana' as const,
    address: base58.encode(ed25519.getPublicKey(privateKey)),
  };
  const context = createProbeContext({ origin, identity });
  const message = new TextEncoder().encode(recoveryMessage(context));
  const first = base58.encode(ed25519.sign(message, privateKey));
  const second = base58.encode(
    ed25519.sign(message, Uint8Array.from(privateKey)),
  );
  assert.equal(repeatableSignatures({ context, first, second }), true);
  const packet = readProbePacket(
    JSON.stringify(await sealProbe(context, first)),
  );
  await openProbe({ packet, origin, identity, signature: second });
});
await test('conta Z não abre o pacote de Y, inclusive se declarar o endereço de Y', async () => {
  const { packet, context } = await evmPacket();
  const outsider = evmWallet(2);
  const signature = await outsider.signMessage(recoveryMessage(context));
  await assert.rejects(
    openProbe({
      packet,
      origin,
      identity: { ecosystem: 'evm', address: outsider.address },
      signature,
    }),
    /conta selecionada/,
  );
  await assert.rejects(
    openProbe({ packet, origin, identity: packet.context, signature }),
    /não pertence/,
  );
});
await test('assinaturas EVM diferentes e válidas da mesma conta falham na recuperação: determinismo não é garantido por validade', async () => {
  const { wallet, context, signature, packet, identity } = await evmPacket();
  const alternative = secp256k1.sign(
    getBytes(hashMessage(recoveryMessage(context))),
    getBytes(wallet.privateKey),
    { extraEntropy: true },
  );
  const otherSignature = `${hexlify(alternative.toCompactRawBytes())}${(27 + alternative.recovery).toString(16)}`;
  assert.equal(
    verifyMessage(recoveryMessage(context), otherSignature),
    wallet.address,
  );
  assert.equal(
    repeatableSignatures({ context, first: signature, second: otherSignature }),
    false,
  );
  await assert.rejects(
    openProbe({ packet, origin, identity, signature: otherSignature }),
    /assinatura diferente/,
  );
  await openProbe({ packet, origin, identity, signature });
});
await test('adulteração de ciphertext, nonce e salt falha sem danificar o pacote original', async () => {
  const { packet, signature, identity } = await evmPacket();
  for (const field of ['ciphertext', 'iv', 'salt'] as const) {
    const bytes = base64urlnopad.decode(packet[field]);
    bytes[0] = (bytes[0] ?? 0) ^ 1;
    await assert.rejects(
      openProbe({
        packet: { ...packet, [field]: base64urlnopad.encode(bytes) },
        origin,
        identity,
        signature,
      }),
      /assinatura diferente/,
    );
  }
  await openProbe({ packet, origin, identity, signature });
});
await test('outra origem, outro ensaio e outro ecossistema não reutilizam uma assinatura como chave', async () => {
  const { packet, context, signature, identity } = await evmPacket();
  await assert.rejects(
    openProbe({ packet, origin: 'https://other.invalid', identity, signature }),
    /outra origem/,
  );
  const changed = createProbeContext({ origin, identity });
  await assert.rejects(
    openProbe({
      packet: { ...packet, context: changed },
      origin,
      identity,
      signature,
    }),
    /não pertence/,
  );
  await assert.rejects(
    openProbe({
      packet,
      origin,
      identity: {
        ecosystem: 'solana',
        address: base58.encode(
          ed25519.getPublicKey(new Uint8Array(32).fill(8)),
        ),
      },
      signature,
    }),
    /conta selecionada/,
  );
  assert.notEqual(recoveryMessage(context), recoveryMessage(changed));
});
await test('assinatura comum de login não abre pacote exclusivo de recuperação', async () => {
  const { packet, wallet, identity } = await evmPacket();
  const signature = await wallet.signMessage(
    'Login fictício com nonce e prazo',
  );
  await assert.rejects(
    openProbe({ packet, origin, identity, signature }),
    /não pertence/,
  );
});
await test('risco demonstrado: cópia da assinatura exclusiva abre o pacote sem nova interação com a wallet', async () => {
  const { packet, signature } = await evmPacket();
  // The public origin in a message is data; it cannot prevent a generic signer
  // from signing that exact message elsewhere. No wallet object is used here.
  await openProbe({
    packet: readProbePacket(JSON.stringify(packet)),
    origin,
    identity: packet.context,
    signature,
  });
});
await test('entrada externa é limitada e recusa campos secretos, versões estranhas e bytes não canônicos', async () => {
  const { packet } = await evmPacket();
  assert.throws(() => readProbePacket(' '.repeat(4097)), /excedido/);
  for (const input of [
    { ...packet, signature: 'segredo fictício' },
    { ...packet, context: { ...packet.context, version: 2 } },
    { ...packet, format: 'cofre-real' },
    { ...packet, salt: packet.salt + '=' },
    { ...packet, iv: '' },
  ])
    assert.throws(() => readProbePacket(JSON.stringify(input)));
});
await test('importar B sobre A troca o alvo: cada arquivo abre somente com sua conta, inclusive após nova troca para A', async () => {
  const first = await evmPacket(1);
  const second = await evmPacket(2);
  let stored = '';
  const selection = new ProbePacketSelection({
    origin,
    persist: (packet) => {
      stored = JSON.stringify(packet);
    },
  });
  selection.created(first.packet);
  for (const [expected, other] of [
    [second, first],
    [first, second],
  ] as const) {
    const name = `ensaio-${expected.context.id}.json`;
    const target = await selection.importFile(
      packetFile(expected.packet, name),
      () => {},
    );
    assert.deepEqual(target.source, { kind: 'file', name });
    assert.equal(target.packet.context.id, expected.context.id);
    assert.deepEqual(readProbePacket(stored), expected.packet);
    await assert.rejects(
      openProbe({
        packet: selection.requireTarget().packet,
        origin,
        identity: other.identity,
        signature: await other.wallet.signMessage(
          recoveryMessage(target.packet.context),
        ),
      }),
      /conta selecionada/,
    );
    await openProbe({
      packet: selection.requireTarget().packet,
      origin,
      identity: expected.identity,
      signature: await expected.wallet.signMessage(
        recoveryMessage(target.packet.context),
      ),
    });
  }
});
await test('arquivos com o mesmo nome e a mesma conta ainda selecionam o pacote exato, sem reutilizar a assinatura do anterior', async () => {
  const first = await evmPacket();
  const second = await evmPacket();
  const selection = new ProbePacketSelection({ origin, persist: () => {} });
  selection.restore(JSON.stringify(first.packet));
  await selection.importFile(packetFile(second.packet), () => {});
  assert.notEqual(first.context.id, second.context.id);
  await assert.rejects(
    openProbe({
      packet: selection.requireTarget().packet,
      origin,
      identity: first.identity,
      signature: first.signature,
    }),
    /não pertence/,
  );
  await openProbe({
    packet: selection.requireTarget().packet,
    origin,
    identity: second.identity,
    signature: second.signature,
  });
});
await test('arquivo inválido, excessivo, de outra origem ou ilegível deixa nenhum alvo ativo e preserva o ciphertext anterior', async () => {
  const { packet } = await evmPacket();
  const previous = JSON.stringify(packet);
  let stored = previous;
  const selection = new ProbePacketSelection({
    origin,
    persist: (replacement) => {
      stored = JSON.stringify(replacement);
    },
  });
  const unreadable = {
    name: 'ilegivel.json',
    size: 20,
    text: () => Promise.reject(new Error('Leitura recusada')),
  };
  for (const file of [
    new File(['{'], 'invalido.json'),
    new File([' '.repeat(4097)], 'excessivo.json'),
    packetFile({
      ...packet,
      context: { ...packet.context, origin: 'https://other.invalid' },
    }),
    unreadable,
  ]) {
    selection.restore(previous);
    await assert.rejects(selection.importFile(file, () => {}));
    assert.equal(selection.active, null);
    assert.throws(() => selection.requireTarget(), /Nenhum pacote ativo/);
    assert.equal(stored, previous);
  }
});
await test('falha ao guardar o arquivo válido não confirma importação nem recupera o pacote anterior', async () => {
  const first = await evmPacket();
  const second = await evmPacket(2);
  const selection = new ProbePacketSelection({
    origin,
    persist: () => {
      throw new Error('Armazenamento recusado');
    },
  });
  selection.restore(JSON.stringify(first.packet));
  await assert.rejects(
    selection.importFile(packetFile(second.packet), () => {}),
    /Armazenamento recusado/,
  );
  assert.equal(selection.active, null);
  assert.throws(() => selection.requireTarget(), /Nenhum pacote ativo/);
});
await test('selecionar arquivo invalida A antes de ler B; leitura tardia de operação interrompida não publica resultado', async () => {
  const first = await evmPacket();
  const second = await evmPacket(2);
  let stored = JSON.stringify(first.packet);
  const selection = new ProbePacketSelection({
    origin,
    persist: (packet) => {
      stored = JSON.stringify(packet);
    },
  });
  selection.restore(stored);
  let provideText: ((text: string) => void) | undefined;
  const read = new Promise<string>((resolve) => {
    provideText = resolve;
  });
  const pending = selection.importFile(
    { name: 'ensaio-B.json', size: 600, text: () => read },
    () => {
      throw new Error('Operação interrompida');
    },
  );
  assert.equal(selection.active, null);
  assert.throws(() => selection.requireTarget(), /Nenhum pacote ativo/);
  assert.ok(provideText);
  provideText(JSON.stringify(second.packet));
  await assert.rejects(pending, /Operação interrompida/);
  assert.equal(selection.active, null);
  assert.deepEqual(readProbePacket(stored), first.packet);
});
await test('laboratório só serve GET local; não recebe assinaturas, não tem API/cofre nem fixture no modo real', async (t) => {
  const server = await startWalletRecoveryProbe({ port: 0 });
  t.after(() => {
    server.close();
    server.closeAllConnections();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const local = `http://127.0.0.1:${address.port}`;
  const response = await fetch(local);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(
    response.headers
      .get('content-security-policy')
      ?.includes("connect-src 'none'"),
  );
  assert.ok((await response.text()).includes('src="/probe.js"'));
  for (const path of [
    '/api/session',
    '/api/vault',
    '/fixture.js',
    '/?signature=ficticia',
  ])
    assert.equal((await fetch(local + path)).status, 404);
  assert.equal(
    (await fetch(local, { method: 'POST', body: 'assinatura-ficticia' }))
      .status,
    404,
  );
  assert.equal(
    (await fetch(local, { headers: { Origin: 'https://other.invalid' } }))
      .status,
    403,
  );
  assert.equal(
    await new Promise<number | undefined>((resolve, reject) => {
      // fetch normalizes Host in Node; exercise the actual HTTP trust boundary.
      const request = get(
        local,
        { headers: { Host: 'other.invalid' } },
        (response) => {
          response.resume();
          resolve(response.statusCode);
        },
      );
      request.on('error', reject);
    }),
    403,
  );
});
