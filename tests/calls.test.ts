import assert from 'node:assert/strict';
import { test, type TestContext } from 'node:test';
import { reserveOperationMemory } from '../src/server/memory-admission/index.ts';
import { createHmac } from 'node:crypto';
import {
  CallState,
  readTurnConfiguration,
  turnCredentials,
} from '../src/server/calls/index.ts';
import type {
  ContactAuthority,
  CallGate,
} from '../src/server/database/index.ts';
import type { SealedSecret } from '../src/shared/devices/index.ts';
import {
  relaySdp,
  relayCandidate,
  leaseMs,
  ringMs,
} from '../src/shared/calls/index.ts';

function authority(account: string = crypto.randomUUID()): ContactAuthority {
  return {
    directory: 'a'.repeat(64),
    session: {
      accountId: account,
      deviceId: crypto.randomUUID(),
      csrf: crypto.randomUUID(),
      name: 'Sintético',
      address: '0x' + '1'.repeat(40),
      ecosystem: 'evm',
      profileRevision: 0,
      deviceState: 'pending',
      historyAuthorized: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
  };
}
const gate: CallGate = {
  enabled: true,
  revision: 0,
  allowed: true,
  receiving: true,
  peerReceiving: true,
  peerDirectory: 'a'.repeat(64),
};
const body: SealedSecret = {
  iv: Buffer.alloc(12).toString('base64'),
  wrappedKey: Buffer.alloc(384).toString('base64'),
  ciphertext: Buffer.alloc(32).toString('base64'),
};
function fixture(t: TestContext) {
  let now = 100_000;
  const state = new CallState(() => now);
  t.after(() => state.close());
  const caller = authority(),
    callee = authority(),
    otherDevice = authority(callee.session.accountId);
  const sequences = new Map<ContactAuthority, number>(),
    channels = new Map<ContactAuthority, string>();
  function endpoint(a: ContactAuthority, register = true, invitation = false) {
    const sequence = (sequences.get(a) ?? 0) + 1;
    sequences.set(a, sequence);
    const channel = channels.get(a) ?? crypto.randomUUID();
    channels.set(a, channel);
    return state.endpoint(
      a,
      { channel, sequence, at: now },
      register,
      invitation,
    );
  }
  function sync(
    a: ContactAuthority,
    input: Partial<Parameters<CallState['synchronize']>[1]> = {},
    g = gate,
  ) {
    return state.synchronize(
      endpoint(a),
      { listening: true, media: 'idle', ack: 0, ...input },
      g,
    );
  }
  sync(caller);
  sync(callee);
  sync(otherDevice);
  const start = () =>
    state.start(
      endpoint(caller, false),
      callee.session.accountId,
      gate.peerDirectory!,
      gate,
    );
  const offer = (id: string, sequence = 1) =>
    state.offer(endpoint(caller, false), {
      id,
      sequence,
      packets: [callee, otherDevice].map((a) => ({
        device: a.session.deviceId,
        body,
      })),
    });
  return {
    state,
    caller,
    callee,
    otherDevice,
    endpoint,
    sync,
    start,
    offer,
    advance: (ms: number) => {
      now += ms;
    },
    now: () => now,
  };
}
await test('primeiro atendimento vence; outras abas/aparelhos perdem autoridade; recusa encerra em todos', (t) => {
  const f = fixture(t),
    call = f.start();
  f.offer(call.id);
  assert.ok(f.sync(f.callee)?.signal);
  assert.ok(f.sync(f.otherDevice)?.signal);
  const winner = f.state.accept(f.endpoint(f.callee, false), call.id);
  assert.equal(winner.phase, 'connecting');
  assert.throws(
    () => f.state.accept(f.endpoint(f.otherDevice, false), call.id),
    /[Uu]navailable/u,
  );
  assert.equal(f.sync(f.otherDevice), null);
  f.state.answer(f.endpoint(f.callee, false), {
    id: call.id,
    sequence: 1,
    body,
  });
  assert.equal(f.sync(f.caller)?.peerDevice, f.callee.session.deviceId);
  assert.ok(f.sync(f.caller)?.signal);
  assert.throws(
    () =>
      f.state.answer(f.endpoint(f.callee, false), {
        id: call.id,
        sequence: 1,
        body,
      }),
    /[Uu]navailable/u,
  );
  f.sync(f.caller, { media: 'connected', ack: 1 });
  f.sync(f.callee, { media: 'connected', ack: 1 });
  assert.equal(f.sync(f.caller, { media: 'connected' })?.phase, 'active');
  f.advance(15_000);
  assert.equal(
    f.sync(f.caller, { media: 'connected' })?.authorizedFor,
    5000,
    'a lease do outro lado limita também a autorização local',
  );
  const recovering = f.sync(f.caller, { media: 'disconnected', ack: 1 });
  assert.equal(recovering?.deadline, f.now() + leaseMs);
  f.state.offer(f.endpoint(f.caller, false), {
    id: call.id,
    sequence: 2,
    packets: [{ device: f.callee.session.deviceId, body }],
  });
  assert.equal(f.sync(f.callee, { media: 'connected', ack: 1 })?.sequence, 2);
  assert.equal(f.sync(f.otherDevice), null);
  f.state.answer(f.endpoint(f.callee, false), {
    id: call.id,
    sequence: 2,
    body,
  });
  assert.equal(
    f.sync(f.caller, { media: 'connected', ack: 2 })?.deadline,
    null,
    'renegociação mantém os extremos e retoma a chamada dentro do prazo',
  );
  assert.equal(f.state.usage.packets, 0);
  f.state.end(f.endpoint(f.caller, false), call.id);
  assert.equal(f.sync(f.callee), null);
  assert.equal(f.state.usage.calls, 0);
});
await test('ocupado/offline/bloqueio/silêncio/preferência desligada não revelam estados diferentes', (t) => {
  const f = fixture(t);
  for (const patch of [
    { allowed: false },
    { peerReceiving: false },
    { peerDirectory: 'b'.repeat(64) },
  ])
    assert.throws(
      () =>
        f.state.start(
          f.endpoint(f.caller, false),
          f.callee.session.accountId,
          gate.peerDirectory!,
          { ...gate, ...patch },
        ),
      /Call unavailable/u,
    );
  const call = f.start();
  assert.throws(() => f.start(), /Call unavailable/u);
  f.offer(call.id);
  assert.equal(
    f.sync(f.caller, {}, { ...gate, enabled: false, receiving: false })?.id,
    call.id,
    'recebimento desligado não impede ligar',
  );
  assert.equal(f.sync(f.callee, {}, { ...gate, receiving: false }), null);
  assert.equal(f.state.usage.calls, 0);
  f.sync(f.callee);
  f.start();
  f.state.endAccounts([f.callee.session.accountId]);
  assert.equal(f.state.usage.calls, 0);
});
await test('toque expira em 60s, conexão em 20s e duração conectada não tem limite artificial', (t) => {
  const f = fixture(t);
  f.start();
  for (let i = 0; i < 11; i++) {
    f.advance(5000);
    f.sync(f.caller);
    f.sync(f.callee);
  }
  f.advance(ringMs - 55_000);
  f.state.clean();
  assert.equal(f.state.usage.calls, 0);
  f.sync(f.callee);
  f.sync(f.otherDevice);
  const call = f.start();
  f.offer(call.id);
  f.state.accept(f.endpoint(f.callee, false), call.id);
  f.advance(leaseMs);
  f.state.clean();
  assert.equal(f.state.usage.calls, 0);
  f.sync(f.caller);
  f.sync(f.callee);
  f.sync(f.otherDevice);
  const live = f.start();
  f.offer(live.id);
  f.state.accept(f.endpoint(f.callee, false), live.id);
  for (let i = 0; i < 1000; i++) {
    f.sync(f.caller, { media: 'connected' });
    f.sync(f.callee, { media: 'connected' });
    f.advance(5000);
  }
  assert.equal(f.state.usage.calls, 1);
  f.advance(leaseMs);
  f.state.clean();
  f.advance(10_000);
  f.state.clean();
  assert.deepEqual(f.state.usage, { calls: 0, endpoints: 0, packets: 0 });
});
await test('aparelhos inscritos podem acordar durante o convite, recebem oferta apenas uma vez e primeiro atendimento vence', (t) => {
  const f = fixture(t),
    recipient = authority(),
    sibling = authority(recipient.session.accountId);
  const call = f.state.start(
    f.endpoint(f.caller, false),
    recipient.session.accountId,
    gate.peerDirectory!,
    {
      ...gate,
      wakeDevices: [recipient.session.deviceId, sibling.session.deviceId],
    },
  );
  assert.deepEqual(
    new Set(f.state.targets(f.endpoint(f.caller, false), call.id)),
    new Set([recipient.session.deviceId, sibling.session.deviceId]),
  );
  f.state.offer(f.endpoint(f.caller, false), {
    id: call.id,
    sequence: 1,
    packets: [recipient, sibling].map((a) => ({
      device: a.session.deviceId,
      body,
    })),
  });
  for (let i = 0; i < 6; i++) {
    f.advance(5000);
    f.sync(f.caller);
  }
  assert.equal(
    f.state.usage.calls,
    1,
    'ausência de endpoint não encurta convite push',
  );
  assert.equal(
    f.state.pending(recipient.session.accountId, recipient.session.deviceId),
    true,
  );
  const received = f.sync(recipient);
  assert.deepEqual(received?.signal, body);
  assert.equal(received?.id, call.id);
  assert.equal(f.sync(recipient, { ack: 1 })?.signal, null);
  assert.equal(
    f.sync(recipient, { ack: 1 })?.signal,
    null,
    'oferta reconhecida não é recolocada',
  );
  f.sync(sibling);
  f.state.accept(f.endpoint(sibling, false), call.id);
  assert.equal(f.sync(recipient), null);
  assert.equal(
    f.state.pending(recipient.session.accountId, recipient.session.deviceId),
    false,
  );
  assert.throws(
    () => f.state.accept(f.endpoint(recipient, false), call.id),
    /[Uu]navailable/u,
  );
});
await test('convite para aparelho fechado não sobrevive a cancelamento, perda da lease ou 60 segundos', (t) => {
  const f = fixture(t),
    recipient = authority();
  const start = () =>
    f.state.start(
      f.endpoint(f.caller, false),
      recipient.session.accountId,
      gate.peerDirectory!,
      { ...gate, wakeDevices: [recipient.session.deviceId] },
    );
  const offer = (id: string) =>
    f.state.offer(f.endpoint(f.caller, false), {
      id,
      sequence: 1,
      packets: [{ device: recipient.session.deviceId, body }],
    });
  const canceled = start();
  offer(canceled.id);
  f.state.end(f.endpoint(f.caller, false), canceled.id);
  assert.equal(f.sync(recipient), null);
  const lost = start();
  offer(lost.id);
  f.advance(leaseMs);
  f.state.clean();
  assert.equal(f.state.usage.calls, 0);
  f.sync(f.caller);
  const expired = start();
  offer(expired.id);
  for (let i = 0; i < 11; i++) {
    f.advance(5000);
    f.sync(f.caller);
  }
  f.advance(5000);
  f.state.clean();
  assert.equal(f.sync(recipient), null);
  assert.equal(f.state.usage.packets, 0);
});
await test('replay, novos participantes, negociação fora de ordem e orçamento são rejeitados', (t) => {
  const f = fixture(t),
    call = f.start();
  const outsider = authority();
  f.sync(outsider);
  assert.throws(
    () => f.state.accept(f.endpoint(outsider, false), call.id),
    /[Uu]navailable/u,
  );
  assert.throws(
    () =>
      f.state.offer(f.endpoint(f.caller, false), {
        id: call.id,
        sequence: 2,
        packets: [],
      }),
    /[Uu]navailable/u,
  );
  f.offer(call.id);
  assert.throws(() => f.offer(call.id), /[Uu]navailable/u);
  const a = authority(),
    channel = crypto.randomUUID();
  f.state.endpoint(a, { channel, sequence: 1, at: f.now() }, true);
  assert.throws(
    () => f.state.endpoint(a, { channel, sequence: 1, at: f.now() }, false),
    /[Dd]uplicate|repeated/u,
  );
  assert.throws(
    () =>
      f.state.endpoint(
        a,
        { channel, sequence: 2, at: f.now() - 10_001 },
        false,
      ),
    /time/u,
  );
  f.state.close();
  assert.deepEqual(f.state.usage, { calls: 0, endpoints: 0, packets: 0 });
});
await test('fechar mídia é terminal no heartbeat; contador transitório impede replay após a lease expirar', (t) => {
  const f = fixture(t),
    call = f.start();
  f.offer(call.id);
  f.state.accept(f.endpoint(f.callee, false), call.id);
  f.sync(f.caller, { media: 'connected' });
  f.sync(f.callee, { media: 'connected' });
  assert.equal(f.sync(f.caller, { media: 'idle' }), null);
  assert.equal(f.state.usage.calls, 0);
  const a = authority(),
    channel = crypto.randomUUID(),
    request = { channel, sequence: 1, at: f.now() + 10_000 };
  f.state.endpoint(a, request, true);
  f.advance(leaseMs);
  f.state.clean();
  assert.throws(
    () => f.state.endpoint(a, request, true),
    /[Dd]uplicate|repeated/u,
  );
});
await test('endpoint admission exceeds 1024 global and 64 account channels while retaining expiry', (t) => {
  t.mock.method(process, 'availableMemory', () => 1_073_741_824);
  let now = 100_000;
  const bounded = new CallState(() => now);
  t.after(() => bounded.close());
  const register = (a: ContactAuthority) =>
    bounded.endpoint(
      a,
      { channel: crypto.randomUUID(), sequence: 1, at: now },
      true,
    );
  const a = authority();
  for (let channel = 0; channel < 1100; channel++) register(a);
  assert.equal(bounded.usage.endpoints, 1100);
  assert.equal(bounded.nextExpiry(), now + leaseMs + 10_000);
  now += leaseMs + 10_000;
  bounded.clean();
  assert.deepEqual(bounded.usage, { calls: 0, endpoints: 0, packets: 0 });
  assert.ok(register(authority()));
});
await test('independent calls exceed both the old default and configurable ceiling', (t) => {
  t.mock.method(process, 'availableMemory', () => 1_073_741_824);
  const f = fixture(t);
  for (let i = 0; i < 132; i++) {
    const caller = authority(),
      recipient = authority();
    f.sync(caller);
    f.sync(recipient);
    assert.ok(
      f.state.start(
        f.endpoint(caller, false),
        recipient.session.accountId,
        gate.peerDirectory!,
        gate,
      ).id,
    );
  }
  assert.equal(f.state.usage.calls, 132);
  f.advance(leaseMs + 10_000);
  f.state.clean();
  assert.deepEqual(f.state.usage, { calls: 0, endpoints: 0, packets: 0 });
});
await test('memory pressure preserves existing calls and releases their budget on end and shutdown', (t) => {
  let available = 16_777_216;
  t.mock.method(process, 'availableMemory', () => available);
  const f = fixture(t),
    call = f.start();
  available = 0;
  assert.throws(() => f.sync(authority()), { status: 429 });
  assert.equal(f.sync(f.caller)?.id, call.id);
  f.state.end(f.endpoint(f.caller, false), call.id);
  assert.throws(() => f.start(), { status: 409 });
  available = 16_777_216;
  assert.ok(f.start().id);
  f.state.close();
  f.state.close();
  const release = reserveOperationMemory(available);
  assert.ok(
    release,
    'shutdown must release every endpoint and call reservation',
  );
  release();
});
const fingerprintLine =
  'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':');
const sdp = [
  'v=0',
  'o=- 1 2 IN IP4 192.168.1.3',
  's=-',
  't=0 0',
  'm=audio 40001 UDP/TLS/RTP/SAVPF 111',
  'c=IN IP4 192.168.1.3',
  fingerprintLine,
  'a=candidate:1 1 udp 1 203.0.113.10 40001 typ relay raddr 192.168.1.3 rport 43210',
  'a=ice-ufrag:abcd',
  'a=ice-pwd:abcdefghijklmnopqrstuvwxyz',
  'a=rtcp-mux',
  'a=sendrecv',
  'a=rtpmap:111 opus/48000/2',
].join('\r\n');
await test('SDP não transporta endereços locais/relacionados e recusa host/STUN/vídeo/sem fingerprint', () => {
  const clean = relaySdp(sdp);
  assert.ok(!clean.includes('192.168.1.3'));
  assert.ok(!clean.includes('43210'));
  assert.equal(relaySdp(clean), clean);
  for (const bad of [
    sdp.replace('typ relay', 'typ host'),
    sdp.replace('typ relay', 'typ srflx'),
    sdp.replace('m=audio', 'm=video'),
    sdp.replace(fingerprintLine, ''),
    sdp + '\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  ])
    assert.throws(() => relaySdp(bad));
  assert.throws(() =>
    relayCandidate('candidate:1 1 udp 1 host.local 9 typ relay'),
  );
});
await test('TURN usa credenciais temporárias sem identidade; configuração parcial não vira relay aberto', () => {
  const config = readTurnConfiguration({
    HASH_TALK_TURN_URLS:
      'turn:turn.example:3478?transport=udp,turns:turn.example:5349?transport=tcp',
    HASH_TALK_TURN_SECRET: 'x'.repeat(43),
  });
  assert.ok(config);
  assert.deepEqual(
    readTurnConfiguration({
      HASH_TALK_TURN_URLS: config.urls.join(','),
      HASH_TALK_TURN_SECRET: config.secret,
      HASH_TALK_CALL_CAPACITY: '1',
    }),
    config,
    'the retired visitor-count setting must not restore a call ceiling',
  );
  const credentials = turnCredentials(config, 100_000),
    server = credentials.iceServers[0];
  assert.ok(server);
  assert.equal(credentials.expiresAt, 700_000);
  assert.ok(server.username.startsWith('700:'));
  assert.equal(
    server.credential,
    createHmac('sha1', config.secret).update(server.username).digest('base64'),
  );
  assert.notEqual(
    server.username,
    turnCredentials(config, 100_000).iceServers[0]?.username,
  );
  assert.equal(readTurnConfiguration({}), null);
  for (const env of [
    { HASH_TALK_TURN_URLS: 'stun:example:3478' },
    { HASH_TALK_TURN_SECRET: 'short' },
    {
      HASH_TALK_TURN_URLS: 'stun:example:3478',
      HASH_TALK_TURN_SECRET: 'x'.repeat(43),
    },
  ])
    assert.throws(() => readTurnConfiguration(env));
});

await test('negotiated encrypted invitation permits one early accept and preserves frozen first-offer targets', (t) => {
  const f = fixture(t);
  const caller = f.endpoint(f.caller, false, true);
  f.endpoint(f.callee, false, true);
  const call = f.state.start(
    caller,
    f.callee.session.accountId,
    gate.peerDirectory!,
    gate,
  );
  const packets = [f.callee, f.otherDevice].map((a) => ({
    device: a.session.deviceId,
    body,
  }));
  assert.throws(
    () => f.state.invite(caller, call.id, packets.slice(0, 1)),
    /[Uu]navailable/u,
  );
  f.state.invite(caller, call.id, packets);
  assert.throws(
    () => f.state.invite(caller, call.id, packets),
    /[Uu]navailable/u,
  );
  const incoming = f.state.synchronize(
    f.endpoint(f.callee, false, true),
    { listening: true, media: 'idle', ack: 0 },
    gate,
  );
  assert.ok(incoming?.invitation);
  assert.equal(incoming.signal, null);
  assert.equal(incoming.sequence, 0);
  const legacy = f.sync(f.otherDevice);
  assert.equal(
    Object.hasOwn(legacy!, 'invitation'),
    false,
    'legacy strict parser never sees invitation framing',
  );
  assert.throws(
    () => f.state.accept(f.endpoint(f.otherDevice, false), call.id),
    /[Uu]navailable/u,
  );
  const winner = f.state.accept(f.endpoint(f.callee, false, true), call.id);
  assert.equal(winner.phase, 'connecting');
  assert.equal(winner.deadline, f.now() + leaseMs);
  assert.equal(f.sync(f.otherDevice), null);
  f.state.offer(f.endpoint(f.caller, false, true), {
    id: call.id,
    sequence: 1,
    packets,
  });
  assert.ok(
    f.state.synchronize(
      f.endpoint(f.callee, false, true),
      { listening: true, media: 'connecting', ack: 0 },
      gate,
    )?.signal,
  );
  f.state.answer(f.endpoint(f.callee, false, true), {
    id: call.id,
    sequence: 1,
    body,
  });
  assert.ok(f.sync(f.caller, { media: 'connecting' })?.signal);
  f.advance(1001);
  assert.throws(
    () =>
      f.state.offer(f.endpoint(f.caller, false, true), {
        id: call.id,
        sequence: 2,
        packets,
      }),
    /[Uu]navailable/u,
  );
  f.state.offer(f.endpoint(f.caller, false, true), {
    id: call.id,
    sequence: 2,
    packets: packets.slice(0, 1),
  });
  f.state.end(f.endpoint(f.caller, false, true), call.id);
  assert.equal(f.state.usage.calls, 0);
  assert.equal(f.sync(f.callee), null);
});
await test('legacy callers cannot publish invitations; unaccepted invitations expire without retaining call memory', (t) => {
  const f = fixture(t),
    call = f.start();
  const packets = [f.callee, f.otherDevice].map((a) => ({
    device: a.session.deviceId,
    body,
  }));
  assert.throws(
    () => f.state.invite(f.endpoint(f.caller, false), call.id, packets),
    /[Uu]navailable/u,
  );
  f.state.invite(f.endpoint(f.caller, false, true), call.id, packets);
  f.advance(leaseMs + 1);
  assert.equal(f.sync(f.callee), null);
  assert.equal(f.state.usage.calls, 0);
});
