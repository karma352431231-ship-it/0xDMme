import { mkdir, stat, writeFile } from 'node:fs/promises';
import { ProbeClient } from '../client/crypto-probe/index.ts';
import {
  newRecoverySecret,
  openHistory,
  sealHistory,
} from '../client/vault-probe/index.ts';
import { ProbeRelay } from '../server/crypto-probe/index.ts';
import { identity } from '../shared/crypto-probe/index.ts';
import type { Role } from '../shared/crypto-probe/index.ts';

const relay = new ProbeRelay();
const clients: ProbeClient[] = [];
const initialize = async (role: Role) => {
  const client = await ProbeClient.create(role, (operation, body) =>
    Promise.resolve().then(() => relay.dispatch(role, operation, body)),
  );
  clients.push(client);
  await client.publishKeys();
  return client;
};
const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)];

try {
  const initial = performance.now();
  const alice = await initialize('alice');
  const bob = await initialize('bob');
  const initializeMs = performance.now() - initial;
  await alice.confirmPeer(bob.fingerprint);
  await bob.confirmPeer(alice.fingerprint);
  const encryptMs: number[] = [];
  const decryptMs: number[] = [];
  for (let index = 0; index < 11; index += 1) {
    const sending = performance.now();
    const event = await alice.send('x'.repeat(512));
    encryptMs.push(performance.now() - sending);
    await bob.receive();
    const reading = performance.now();
    await bob.decrypt(event);
    decryptMs.push(performance.now() - reading);
  }
  const secret = newRecoverySecret();
  const sealing = performance.now();
  const envelope = await sealHistory(
    {
      owner: identity('alice').user,
      revision: 1,
      messages: [{ id: 'synthetic', body: 'x'.repeat(512) }],
    },
    secret,
  );
  const sealMs = performance.now() - sealing;
  const opening = performance.now();
  await openHistory(JSON.stringify(envelope), secret, identity('alice').user);
  const openMs = performance.now() - opening;
  const wasm = await stat(
    new URL(
      '../../node_modules/@matrix-org/matrix-sdk-crypto-wasm/pkg/matrix_sdk_crypto_wasm_bg.wasm',
      import.meta.url,
    ),
  );
  const summary = {
    date: new Date().toISOString(),
    environment: 'Node; fixtures e relay em memória; não mede celular ou rede',
    initializeTwoClientsMs: initializeMs,
    firstSendWithKeyExchangeMs: encryptMs[0],
    medianSend512BytesMs: median(encryptMs.slice(1)),
    medianDecrypt512BytesMs: median(decryptMs.slice(1)),
    vaultSealMs: sealMs,
    vaultOpenMs: openMs,
    vaultEnvelopeBytes: Buffer.byteLength(JSON.stringify(envelope)),
    matrixWasmBytes: wasm.size,
    memory: process.memoryUsage(),
  };
  const directory = new URL('../../.local/', import.meta.url);
  await mkdir(directory, { recursive: true });
  await writeFile(
    new URL('BLOCO_01_MEDIDAS_NODE.json', directory),
    JSON.stringify(summary, null, 2) + '\n',
  );
  process.stdout.write(
    'Medições sintéticas gravadas somente em .local/BLOCO_01_MEDIDAS_NODE.json.\n',
  );
} finally {
  for (const client of clients) client.close();
}
