import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  StatusEncryption,
  openStatus,
} from '../src/client/status-crypto/index.ts';
import { groupParticipant } from './fixtures/group-participant.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../src/client/message-recovery/index.ts';
import {
  statusAudienceHead,
  statusEnvelopeHash,
} from '../src/shared/status/index.ts';
await test('status usa SDK real e cápsula individual sem expor outros contatos; audiência, origem e 24h são verificáveis', async (t) => {
  const author = await groupParticipant(),
    viewer = await groupParticipant(),
    outsider = await groupParticipant();
  const recovery = await createRecoveryKey(viewer.authority),
    key = await openRecoveryKey(recovery, viewer.authority);
  const status = await StatusEncryption.create({
    authority: author.authority,
    id: crypto.randomUUID(),
    kind: 'text',
    text: 'Status sintético privado',
  });
  t.after(() => {
    status.close();
    key.free();
  });
  const envelope = await status.recipient({
    authority: author.authority,
    history: [viewer.directory],
    recovery,
  });
  const publishedAt = Date.now();
  const packet = await status.publish({
    authority: author.authority,
    publishedAt,
    audienceHead: await statusAudienceHead(null, [envelope]),
  });
  const exported = openRoomKey(key, envelope.recipient.archive);
  const input = {
    authority: viewer.authority,
    packet,
    envelope,
    origin: author.directory,
    exported,
    now: publishedAt,
  };
  assert.equal(await openStatus(input), 'Status sintético privado');
  await assert.rejects(openStatus({ ...input, authority: outsider.authority }));
  await assert.rejects(openStatus({ ...input, now: publishedAt + 86_400_000 }));
  await assert.rejects(
    openStatus({ ...input, packet: { ...packet, id: crypto.randomUUID() } }),
  );
  await assert.rejects(
    openStatus({
      ...input,
      envelope: {
        ...envelope,
        recipient: { ...envelope.recipient, accountId: outsider.accountId },
      },
    }),
  );
  assert.ok(!JSON.stringify(envelope).includes(outsider.accountId));
  assert.equal((await statusEnvelopeHash(envelope)).length, 64);
  status.close();
  await assert.rejects(
    status.publish({
      authority: author.authority,
      publishedAt,
      audienceHead: packet.audienceHead,
    }),
  );
});
