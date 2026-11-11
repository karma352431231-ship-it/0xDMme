import { ViewOnceMediaBuffer } from '../../src/client/view-once-media-buffer/index.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { messageReceiptFixture } from '../fixtures/message-receipt-database.ts';
import { groupParticipant } from '../fixtures/group-participant.ts';
import { createCommunityAccount } from './community-fixture.ts';
import { AccountService } from '../../src/server/account/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { PublicProfileService } from '../../src/server/public-profile/index.ts';
import { CommunityService } from '../../src/server/communities/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { ObjectStore } from '../../src/server/object-store/index.ts';
import { MessageCrypto } from '../../src/client/message-crypto/index.ts';
import {
  createRecoveryKey,
  openRecoveryKey,
  openRoomKey,
} from '../../src/client/message-recovery/index.ts';
import {
  prepareViewOnce,
  viewOnceDescriptor,
  uploadViewOnce,
  decryptViewOnce,
} from '../../src/client/view-once/index.ts';
import { decodeDailyText } from '../../src/shared/daily/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { assertPersonalQuotaMatches } from '../fixtures/personal-quota-database.ts';

await test('public DM publication binds the independent encrypted payload to the real signed Megolm packet and private session', async (t) => {
  const c = await messageReceiptFixture(t);
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), '0xdmme-view-once-')),
  );
  const objects = new ObjectStore(directory);
  await objects.initialize();
  const messages = new MessageService(c.db, c.db.devices, objects);
  t.after(async () => {
    await messages.close();
    await rm(directory, { recursive: true, force: true });
  });
  const services = {
    account: new AccountService({
      store: c.db.authentication,
      origin: 'http://127.0.0.1:45127',
    }),
    devices: new DeviceService(c.db.devices),
    profiles: new PublicProfileService(c.db.publicProfiles, c.db.devices),
    communities: new CommunityService(c.db.communities, c.db.devices),
    accounts: [],
    addresses: [],
  };
  const users = await Promise.all([
    createCommunityAccount(services),
    createCommunityAccount(services),
  ]);
  const [alice, bob] = users;
  const ap = await alice.publicIdentity('a_' + crypto.randomUUID().slice(0, 8)),
    bp = await bob.publicIdentity('b_' + crypto.randomUUID().slice(0, 8));
  const a = await groupParticipant({
      accountId: ap.id,
      deviceName: 'DM device',
    }),
    b = await groupParticipant({ accountId: bp.id, deviceName: 'DM device' });
  type User = typeof alice;
  const operate = async (
    user: User,
    operation: string,
    payload: Record<string, unknown>,
    installed = false,
  ) => {
    const proof = {
      deviceId: user.login.session.deviceId,
      directory: user.directory,
      payload,
    };
    return messages.operate(
      operation,
      user.login.session,
      {
        ...proof,
        signature: await sign(
          user.identity.signing,
          messageBody(
            user.login.session.accountId,
            user.login.session.deviceId,
            operation,
            proof,
          ),
        ),
      },
      { installed },
    );
  };
  await operate(alice, 'dm-open', { peer: bp.id });
  await operate(alice, 'dm-register', { event: a.directory });
  await operate(bob, 'dm-register', { event: b.directory });
  const ar = await createRecoveryKey(a.authority),
    br = await createRecoveryKey(b.authority);
  await operate(alice, 'dm-recovery-register', { key: ar });
  await operate(bob, 'dm-recovery-register', { key: br });
  const am = await MessageCrypto.create({
    accountId: ap.id,
    deviceId: a.deviceId,
    store: null,
    transport: (op, data) => operate(alice, 'dm-' + op, data),
  });
  const bm = await MessageCrypto.create({
    accountId: bp.id,
    deviceId: b.deviceId,
    store: null,
    transport: (op, data) => operate(bob, 'dm-' + op, data),
  });
  t.after(() => {
    am.close();
    bm.close();
  });
  await am.prepare(a.authority);
  await bm.prepare(b.authority);
  const mediaBytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGNwzn4FRAwQCgAqEgZh/qKZDQAAAABJRU5ErkJggg==',
    'base64',
  );
  const content = {
    text: 'Synthetic protected public message',
    file: {
      name: 'synthetic.png',
      mime: 'image/png',
      data: mediaBytes.toString('base64'),
    },
  };
  const prepared = await prepareViewOnce({
    id: crypto.randomUUID(),
    scope: 'public',
    sender: ap.id,
    recipient: br,
    content,
  });
  const descriptor = await viewOnceDescriptor(prepared, content);
  const packet = await am.encrypt({
    authority: a.authority,
    peerHistory: [b.directory],
    recovery: [ar, br],
    id: prepared.header.id,
    text: descriptor.text,
    viewOnce: descriptor.reference,
  });
  await assert.rejects(operate(alice, 'dm-publish', { packet }), {
    status: 409,
  });
  await uploadViewOnce(prepared, (op, data) => operate(alice, op, data));
  await operate(alice, 'dm-publish', { packet });
  await operate(alice, 'dm-publish', { packet });
  const key = await openRecoveryKey(br, b.authority);
  let text: string;
  try {
    text = await bm.decrypt({
      packet,
      senderEvent: a.directory,
      exported: openRoomKey(
        key,
        packet.archives.find((k) => k.accountId === bp.id)!,
      ),
    });
  } finally {
    key.free();
  }
  assert.equal(text, descriptor.text);
  assert.equal(text.includes(content.text), false);
  const data = {
    scope: 'public',
    peer: ap.id,
    id: packet.id,
    hash: descriptor.reference.hash,
  };
  await assert.rejects(operate(bob, 'view-once-open', data), { status: 403 });
  const response = await operate(bob, 'view-once-open', data, true);
  const media = new ViewOnceMediaBuffer();
  assert.deepEqual(
    await decryptViewOnce({
      authority: b.authority,
      recovery: br,
      id: packet.id,
      scope: 'public',
      peer: ap.id,
      metadata: decodeDailyText(text).viewOnce!,
      response,
      media,
    }),
    content,
  );
  let transferred: Uint8Array | undefined;
  assert.equal(
    await media.present((bytes) => {
      transferred = bytes;
      assert.deepEqual(Buffer.from(bytes), mediaBytes);
      return Promise.resolve();
    }),
    true,
  );
  assert.ok(transferred?.every((byte) => byte === 0));
  await assert.rejects(operate(bob, 'view-once-open', data, true), {
    status: 410,
  });
  await assertPersonalQuotaMatches(
    c.inspector,
    users.map((x) => x.login.session.accountId),
  );
});
