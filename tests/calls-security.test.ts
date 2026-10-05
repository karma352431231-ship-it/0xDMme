import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createIdentity,
  sealTo,
  openFrom,
} from '../src/client/device-keys/index.ts';
import {
  verifyCallDescription,
  iceConfiguration,
} from '../src/client/calls/index.ts';
import {
  callContext,
  callDescription,
  descriptionBody,
  relaySdp,
} from '../src/shared/calls/index.ts';
import type { CallDescription, CallView } from '../src/shared/calls/index.ts';
import { sign } from '../src/shared/devices/index.ts';

await test('SDP/fingerprint cifrados e assinados: adulteração, outra conta/aparelho/chamada/época e replay falham', async () => {
  const sender = await createIdentity(crypto.randomUUID(), 'Sintético A'),
    recipient = await createIdentity(crypto.randomUUID(), 'Sintético B');
  const sdp = relaySdp(
    [
      'v=0',
      'o=- 1 1 IN IP4 0.0.0.0',
      's=-',
      't=0 0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'c=IN IP4 0.0.0.0',
      'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'),
      'a=candidate:1 1 udp 1 203.0.113.10 49160 typ relay raddr 0.0.0.0 rport 0',
      'a=ice-ufrag:abcd',
      'a=ice-pwd:abcdefghijklmnopqrstuvwxyz',
      'a=rtcp-mux',
    ].join('\r\n'),
  );
  const body: Omit<CallDescription, 'signature'> = {
    id: crypto.randomUUID(),
    from: crypto.randomUUID(),
    fromDevice: sender.public.id,
    to: crypto.randomUUID(),
    toDevice: recipient.public.id,
    fromDirectory: 'a'.repeat(64),
    toDirectory: 'b'.repeat(64),
    sequence: 1,
    type: 'offer',
    sdp,
  };
  const signed = {
    ...body,
    signature: await sign(sender.signing, descriptionBody(body)),
  };
  const context = callContext(body.id, recipient.public.id),
    envelope = await sealTo(recipient.public.wrapping, signed, context);
  assert.ok(!JSON.stringify(envelope).includes('fingerprint'));
  const description = callDescription(
    await openFrom(recipient.wrapping, envelope, context),
  );
  const view: CallView = {
    id: body.id,
    peer: body.from,
    caller: false,
    peerDevice: body.fromDevice,
    peerDirectory: body.fromDirectory,
    phase: 'ringing',
    deadline: Date.now() + 45_000,
    authorizedFor: 20_000,
    sequence: 1,
    signal: envelope,
  };
  const binding = {
    view,
    account: body.to,
    device: body.toDevice,
    directory: body.toDirectory,
  };
  await verifyCallDescription(description, binding, sender.public.signing);
  await assert.rejects(openFrom(sender.wrapping, envelope, context));
  await assert.rejects(
    openFrom(
      recipient.wrapping,
      envelope,
      callContext(crypto.randomUUID(), body.toDevice),
    ),
  );
  await assert.rejects(
    verifyCallDescription(
      { ...description, sdp: sdp.replace(/AB/gu, 'CD') },
      binding,
      sender.public.signing,
    ),
  );
  await assert.rejects(
    verifyCallDescription(description, binding, recipient.public.signing),
  );
  for (const patch of [
    { id: crypto.randomUUID() },
    { sequence: 2 },
    { from: crypto.randomUUID() },
    { fromDevice: crypto.randomUUID() },
    { to: crypto.randomUUID() },
    { toDevice: crypto.randomUUID() },
    { fromDirectory: 'c'.repeat(64) },
    { toDirectory: 'c'.repeat(64) },
    { type: 'answer' as const },
  ])
    await assert.rejects(
      verifyCallDescription(
        { ...description, ...patch },
        binding,
        sender.public.signing,
      ),
    );
});
await test('configuração da mídia só usa TURN e força relay, sem STUN/fallback', () => {
  const config = iceConfiguration({
    iceServers: [
      {
        urls: ['turn:relay.example:3478?transport=udp'],
        username: 'temporary',
        credential: 'temporary',
      },
    ],
  });
  assert.equal(config.iceTransportPolicy, 'relay');
  assert.equal(config.iceCandidatePoolSize, 0);
  for (const raw of [
    { iceServers: [] },
    {
      iceServers: [{ urls: ['stun:example'], username: 'x', credential: 'y' }],
    },
    {
      iceServers: [
        { urls: ['https://example'], username: 'x', credential: 'y' },
      ],
    },
    { iceServers: [{ urls: ['turn:example:3478?transport=udp'] }] },
  ])
    assert.throws(() => iceConfiguration(raw));
});
