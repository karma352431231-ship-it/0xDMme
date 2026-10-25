import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { Database } from '../../src/server/database/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { RepresentativeService } from '../../src/server/representatives/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';
import type { MessageProof } from '../../src/shared/messages/index.ts';
import type { ObjectStore } from '../../src/server/object-store/index.ts';
import { messageBody } from '../../src/shared/messages/index.ts';
import { sign } from '../../src/shared/devices/index.ts';
import { groupParticipant } from './group-participant.ts';

/** Real device identities and signatures; only persistence/domain side effects
 * are isolated. Database-backed suites cover their transactional authorization. */
export async function messageServiceFixture(
  t: TestContext,
  objects?: ObjectStore,
) {
  const participant = await groupParticipant();
  const db = new Database('postgresql://127.0.0.1/hash_talk_test');
  const representative = new RepresentativeService(
    db.representatives,
    { matches: () => Promise.resolve(false) },
    'https://0xdmme.app',
  );
  const service = new MessageService(db, db.devices, objects, {
    representatives: representative,
  });
  const session: AccountSession = {
    accountId: participant.accountId,
    deviceId: participant.deviceId,
    csrf: 'a'.repeat(64),
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: '',
    profileRevision: 0,
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
  };
  const data = {
    current: {
      head: participant.head,
      revision: participant.directory.revision,
      event: participant.directory,
    } as Awaited<ReturnType<Database['devices']['current']>>,
    domain: 0,
  };
  const current = t.mock.method(db.devices, 'current', (accountId: string) => {
    assert.equal(accountId, session.accountId);
    return Promise.resolve(data.current);
  });
  t.mock.method(
    representative,
    'operate',
    (authority: { session: AccountSession; directory: string }) => {
      assert.equal(authority.session, session);
      assert.equal(authority.directory, participant.head);
      data.domain++;
      return Promise.resolve({ status: 'accepted' });
    },
  );
  t.after(async () => {
    await service.close();
    await db.close();
  });
  async function proof(
    operation: string,
    payload: Record<string, unknown> = {},
  ): Promise<MessageProof> {
    const value = {
      deviceId: session.deviceId,
      directory: participant.head,
      payload,
    };
    return {
      ...value,
      signature: await sign(
        participant.signing,
        messageBody(session.accountId, session.deviceId, operation, value),
      ),
    };
  }
  return { service, db, session, participant, data, proof, current };
}
