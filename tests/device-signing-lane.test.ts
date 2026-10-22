import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SigningLane } from '../src/client/devices/signing-lane.ts';
import type {
  DirectoryPosition,
  VerifiedSigner,
} from '../src/client/devices/signing-lane.ts';
import { deferred } from './fixtures/deferred.ts';

const directory = 'b'.repeat(64);
function lane(input: {
  verified?: VerifiedSigner | null;
  position?: (after: number) => Promise<DirectoryPosition>;
}) {
  const calls = { positions: [] as number[], exclusive: 0 };
  const signer: VerifiedSigner = {
    session: { accountId: 'account', deviceId: 'device', csrf: 'csrf' },
    directory,
    events: 3,
    sign: () => Promise.resolve('signature'),
    current: () => true,
  };
  const subject = new SigningLane({
    verified: () => (input.verified === undefined ? signer : input.verified),
    position: (_signer, after) => {
      calls.positions.push(after);
      return (
        input.position?.(after) ??
        Promise.resolve({ events: 0, revision: 3, head: directory })
      );
    },
    exclusive: (work) => {
      calls.exclusive++;
      return work({
        session: signer.session,
        directory: 'exclusive',
        sign: signer.sign,
      });
    },
  });
  return { subject, calls };
}

await test('an unchanged verified directory signs outside the exclusive turn after one server check', async () => {
  const { subject, calls } = lane({});
  assert.equal(
    await subject.run((authority) => Promise.resolve(authority.directory)),
    directory,
  );
  assert.deepEqual(calls, { positions: [3], exclusive: 0 });
});

for (const [name, position] of [
  ['a new directory event', { events: 1, revision: 4, head: 'c'.repeat(64) }],
  ['another head', { events: 0, revision: 3, head: 'c'.repeat(64) }],
  ['another revision', { events: 0, revision: 2, head: directory }],
] as [string, DirectoryPosition][])
  await test(`${name} sends the work to an exclusive turn that verifies it`, async () => {
    const { subject, calls } = lane({
      position: () => Promise.resolve(position),
    });
    assert.equal(
      await subject.run((authority) => Promise.resolve(authority.directory)),
      'exclusive',
    );
    assert.equal(calls.exclusive, 1);
  });

await test('startup work waits for the first verification instead of taking the exclusive turn', async () => {
  let state: VerifiedSigner | null = null;
  const positions: number[] = [];
  const verified = new SigningLane({
    verified: () => state,
    position: (_signer, after) => {
      positions.push(after);
      return Promise.resolve({ events: 0, revision: 3, head: directory });
    },
    exclusive: () => Promise.reject(new Error('Not expected.')),
  });
  const running = verified.run((authority) =>
    Promise.resolve(authority.directory),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(positions, []);
  state = {
    session: { accountId: 'account', deviceId: 'device', csrf: 'csrf' },
    directory,
    events: 3,
    sign: () => Promise.resolve('signature'),
    current: () => true,
  };
  verified.verifiedChanged();
  assert.equal(await running, directory);
  assert.deepEqual(positions, [3]);
});

await test('without any verification in eight seconds the work runs in an exclusive turn', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { subject, calls } = lane({ verified: null });
  const running = subject.run((authority) =>
    Promise.resolve(authority.directory),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls.exclusive, 0);
  t.mock.timers.tick(8000);
  assert.equal(await running, 'exclusive');
  assert.deepEqual(calls, { positions: [], exclusive: 1 });
});

await test('a session change during the check rejects before any signing', async () => {
  let current = true,
    ran = false;
  const { subject } = lane({
    verified: {
      session: { accountId: 'account', deviceId: 'device', csrf: 'csrf' },
      directory,
      events: 3,
      sign: () => Promise.resolve('signature'),
      current: () => current,
    },
    position: () => {
      current = false;
      return Promise.resolve({ events: 0, revision: 3, head: directory });
    },
  });
  await assert.rejects(
    subject.run(() => {
      ran = true;
      return Promise.resolve();
    }),
    /Session changed/u,
  );
  assert.equal(ran, false);
});

await test('at most four signed operations run at once; later ones wait their turn', async () => {
  const { subject } = lane({}),
    gate = deferred<void>();
  let active = 0,
    maximum = 0;
  const jobs = Array.from({ length: 6 }, () =>
    subject.run(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await gate.promise;
      active--;
    }),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(active, 4);
  gate.resolve();
  await Promise.all(jobs);
  assert.equal(maximum, 4);
});
