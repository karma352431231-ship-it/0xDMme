import type { PrivateAudiences } from '../../src/client/message-crypto/index.ts';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import * as sdk from '@matrix-org/matrix-sdk-crypto-wasm';
import { MessageCrypto } from '../../src/client/message-crypto/index.ts';
import {
  sealLocal,
  openLocal,
} from '../../src/client/message-storage/index.ts';
import type { LocalCipher } from '../../src/client/message-storage/index.ts';
import type { Messages } from '../../src/client/messages/controller.ts';
import { createRecoveryKey } from '../../src/client/message-recovery/index.ts';
import {
  messagePacket,
  verifyPacket,
} from '../../src/shared/messages/index.ts';
import type { MessagePacket } from '../../src/shared/messages/index.ts';
import { object } from '../../src/shared/account/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import { eventHash } from '../../src/shared/devices/index.ts';
import type {
  VaultAccess,
  VaultAuthority,
} from '../../src/client/vault-authority/index.ts';
import type { VaultSync } from '../../src/client/vault-sync/index.ts';
import { groupParticipant } from './group-participant.ts';
import { messageTransport } from './message-transport.ts';

// Keep the actual controller, signatures, pin verification, encryption and SDK.
// Replace only browser persistence/store opening and the network with in-memory
// adapters. These tests do not claim browser durability or database acceptance.
const exportsByAdapter = {
  'message-storage': [
    'localGet',
    'localPut',
    'localDelete',
    'localPage',
    'sealLocal',
    'openLocal',
    'enqueueOutbox',
    'enqueueOutboxBatch',
    'outboxPage',
    'removeOutbox',
  ],
  'message-session': ['openMessageMachine'],
  sdk: Object.keys(sdk),
};
const bundle = await build({
  stdin: {
    contents: "export { Messages } from './src/client/messages/controller.ts';",
    resolveDir: process.cwd(),
    loader: 'ts',
  },
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'sendController',
  define: {
    'import.meta.url': '"https://0xdmme.app/synthetic.js"',
    ATTACHMENT_WORKER_URL: '"/unused"',
  },
  plugins: [
    {
      name: 'sender-browser-adapters',
      setup(builder) {
        builder.onResolve(
          { filter: /^@matrix-org\/matrix-sdk-crypto-wasm$/ },
          () => ({ path: 'sdk', namespace: 'send-fixture' }),
        );
        builder.onResolve(
          { filter: /^\.\.\/(message-storage|message-session)\/index\.ts$/ },
          ({ path, importer }) =>
            importer.endsWith('/messages/controller.ts') ||
            importer.endsWith('/messages/outbox.ts') ||
            importer.endsWith('/messages/profile-chunks.ts')
              ? { path: path.split('/')[1]!, namespace: 'send-fixture' }
              : undefined,
        );
        builder.onLoad(
          { filter: /.*/, namespace: 'send-fixture' },
          ({ path }) => ({
            contents: exportsByAdapter[path as keyof typeof exportsByAdapter]
              .map(
                (name) =>
                  `export const ${name} = fixture.${path === 'sdk' ? 'sdk.' : ''}${name};`,
              )
              .join('\n'),
            loader: 'js',
          }),
        );
      },
    },
  ],
});
const source = bundle.outputFiles[0]!.text;

interface Draft {
  id: string;
  peer: string;
  kind: MessagePacket['kind'];
  transferStarted?: boolean;
  relation?: MessagePacket['relation'];
  packet: MessagePacket | null;
  draft: LocalCipher[];
}

export async function sendFixture() {
  await sdk.initAsync();
  const sender = await groupParticipant(),
    peer = await groupParticipant();
  const recovery = await createRecoveryKey(sender.authority),
    peerRecovery = await createRecoveryKey(peer.authority);
  const requests: string[] = [],
    publications: MessagePacket[] = [],
    machines: MessageCrypto[] = [];
  const records = new Map<string, Draft>(),
    persisted = new Map<
      string,
      { change: { entity: string }; value: string }
    >();
  const state = {
    authority: sender.authority,
    peerEvents: [peer.directory],
    recovery,
    peerRecovery,
    beforeAuthority: undefined as ((count: number) => void) | undefined,
    beforePublish: undefined as (() => void) | undefined,
    beforeKeys: undefined as (() => void) | undefined,
    savedPin: undefined as (() => void) | undefined,
    machineOpens: 0,
    authorityReads: 0,
    reuseOwnDirectory: false,
    ownDirectoryReads: 0,
    lastAuthorityReused: false,
    expectedPriority: 'interactive' as 'interactive' | undefined,
    losePublishResponse: false,
    combinedPreparation: true,
    retainMachine: false,
    stalePublishCount: 0,
    staleKeysCount: 0,
    publishFailureStatus: 503,
    preparationOffsets: [] as number[],
    failPublish: false,
    closedMachines: 0,
    events: [] as { id: string; peer: string }[],
  };
  const transport = messageTransport();
  const reader = await MessageCrypto.create({
    accountId: peer.accountId,
    deviceId: peer.deviceId,
    store: null,
    transport: transport.transport,
  });
  machines.push(reader);
  await reader.prepare(peer.authority);
  const access: VaultAccess = {
    withVault: (_offline, work, options) => {
      assert.equal(options?.priority, state.expectedPriority);
      state.beforeAuthority?.(++state.authorityReads);
      state.lastAuthorityReused =
        state.reuseOwnDirectory && options?.ownDirectory === 'reuse';
      if (state.lastAuthorityReused)
        return work({ ...state.authority, reusedOwnDirectory: true });
      state.ownDirectoryReads++;
      return work(state.authority);
    },
    withLocalVault: (locator, work) => {
      assert.equal(locator.accountId, sender.accountId);
      assert.equal(locator.deviceId, sender.deviceId);
      return work({ ...state.authority, offline: true });
    },
  };
  const sync = {
    complete: true,
    refresh: () => Promise.resolve(),
    currentHeads: () => new Map(),
    isRemoved: () => false,
    openMany: () => Promise.resolve([]),
    save: (entry: { change: { entity: string }; value: string }) => {
      persisted.set(entry.change.entity, entry);
      state.savedPin?.();
      return Promise.resolve();
    },
  } as unknown as VaultSync;
  const page = (names?: readonly string[]) =>
    [...records]
      .filter(([name]) => !names || names.includes(name))
      .slice(0, 16)
      .map(([name, value]) => ({ name, value }));
  let retained: MessageCrypto | null = null;
  const disposers: (() => void)[] = [];
  const fixture = {
    sdk,
    sealLocal,
    openLocal,
    localGet: (_scope: string, name: string) =>
      Promise.resolve(records.get(name) ?? null),
    localPut: (_scope: string, name: string, value: Draft) => {
      records.set(name, value);
      return Promise.resolve();
    },
    localDelete: (_scope: string, name: string) => {
      records.delete(name);
      return Promise.resolve();
    },
    localPage: () => Promise.resolve({ items: page(), next: null }),
    enqueueOutboxBatch: () =>
      Promise.reject(
        new Error('View-once admission uses the real storage suite.'),
      ),
    enqueueOutbox: (input: { id: string; value: Draft }) => {
      records.set(`outbox:${input.id}`, input.value);
      return Promise.resolve();
    },
    outboxPage: (_scope: string, names?: readonly string[]) =>
      Promise.resolve(page(names)),
    removeOutbox: (_scope: string, name: string) => {
      records.delete(name);
      return Promise.resolve();
    },
    openMessageMachine: async (
      authority: VaultAuthority,
      api: (op: string, payload: Record<string, unknown>) => Promise<unknown>,
      audiences?: PrivateAudiences,
    ) => {
      state.machineOpens++;
      if (state.retainMachine && retained) return retained;
      const machine = await MessageCrypto.create({
        accountId: authority.session.accountId,
        deviceId: authority.session.deviceId,
        store: null,
        transport: api,
        ...(audiences ? { audiences } : {}),
      });
      machines.push(machine);
      const close = machine.close.bind(machine);
      disposers.push(close);
      if (state.retainMachine) retained = machine;
      machine.close = () => {
        state.closedMachines++;
        if (!state.retainMachine) close();
      };
      return machine;
    },
  };
  const publish = async (payload: Record<string, unknown>) => {
    state.beforePublish?.();
    if (state.stalePublishCount > 0) {
      state.stalePublishCount--;
      return Response.json(
        { error: 'Synthetic stale material', code: 'stale-send-material' },
        { status: 409 },
      );
    }
    if (state.failPublish)
      return Response.json(
        { error: 'Synthetic publication failure' },
        { status: state.publishFailureStatus },
      );
    const packet = messagePacket(payload['packet']);
    if (
      packet.recipientDirectory !==
        (await eventHash(state.peerEvents.at(-1)!)) ||
      packet.archives.some(
        (archive) =>
          archive.keyId !==
          (archive.accountId === sender.accountId
            ? state.recovery.id
            : state.peerRecovery.id),
      )
    )
      return Response.json(
        {
          error: 'Devices changed during sending. Encrypt again.',
          code: 'stale-send-material',
        },
        { status: 409 },
      );
    await verifyPacket(packet, state.authority.events.at(-1)!);
    publications.push(packet);
    if (state.losePublishResponse) {
      state.losePublishResponse = false;
      throw new Error('Synthetic lost publication response');
    }
    return Response.json({});
  };
  const matrixResponse = async (
    operation: string,
    payload: Record<string, unknown>,
  ) => {
    if (operation === 'matrix-send') state.beforeKeys?.();
    if (operation === 'matrix-send' && state.staleKeysCount > 0) {
      state.staleKeysCount--;
      return Response.json(
        {
          error: 'Synthetic revoked key recipient',
          code: 'stale-send-material',
        },
        { status: 403 },
      );
    }
    return Response.json(
      await transport.transport(
        operation as Parameters<typeof transport.transport>[0],
        payload,
      ),
    );
  };
  const prepareDirectory = async (operation: string, after: number) => {
    if (operation === 'send-preparation' && !state.combinedPreparation)
      return Response.json(
        { error: 'Message operation unavailable.' },
        { status: 404 },
      );
    const directory = {
      events: state.peerEvents.slice(after, after + 8),
      revision: state.peerEvents.length,
      head: await eventHash(state.peerEvents.at(-1)!),
    };
    if (operation === 'peer-directory') return Response.json(directory);
    state.preparationOffsets.push(after);
    return Response.json({
      directory,
      recovery: { own: state.recovery, peer: state.peerRecovery },
    });
  };
  const respond = async (path: string, input: RequestInit) => {
    const operation = path.split('/').at(-1)!;
    requests.push(operation);
    if (typeof input.body !== 'string')
      throw new Error('Missing sender request.');
    const body = object(JSON.parse(input.body) as unknown),
      payload = object(body['payload']);
    if (operation === 'peer-directory' || operation === 'send-preparation')
      return prepareDirectory(operation, Number(payload['after']));
    if (operation === 'recovery-current') return Response.json(state.recovery);
    if (operation === 'recovery-peer') return Response.json(state.peerRecovery);
    if (operation.startsWith('matrix-'))
      return matrixResponse(operation, payload);
    if (operation === 'publish') return publish(payload);
    if (operation === 'accepted')
      return Response.json(
        publications.some((packet) => packet.id === payload['id']),
      );
    if (operation === 'delete') return Response.json({});
    throw new Error(`Unexpected sender operation: ${operation}`);
  };
  const context = {
    fixture,
    crypto,
    atob,
    btoa,
    TextEncoder,
    TextDecoder,
    AbortSignal,
    AbortController,
    structuredClone,
    URL,
    Response,
    Error,
    setTimeout,
    clearTimeout,
    fetch: respond,
    navigator: { onLine: true },
    sendController: undefined as { Messages: typeof Messages } | undefined,
  };
  runInNewContext(source, context);
  assert.ok(context.sendController);
  const controller = new context.sendController.Messages(
    access,
    sync,
    () => {},
    { published: (value) => state.events.push(value) },
  );
  controller.setSession(sender.authority.session as AccountSession);
  const queue = async (id = crypto.randomUUID()) => {
    await controller.queueText({
      id,
      peer: peer.accountId,
      text: 'Synthetic sender regression text',
    });
    return id;
  };
  const pinnedRevision = () => {
    const value = persisted.get(peer.accountId)?.value;
    if (!value) return null;
    return Number(
      object(object(JSON.parse(value) as unknown)['pin'])['revision'],
    );
  };
  return {
    controller,
    sender,
    peer,
    state,
    requests,
    publications,
    records,
    queue,
    pinnedRevision,
    close: () => {
      disposers.forEach((dispose) => dispose());
      reader.close();
    },
  };
}
