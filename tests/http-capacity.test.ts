import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { AccountError } from '../src/shared/account/index.ts';
import { Database } from '../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../src/server/account/index.ts';
import { createCommunityHandler } from '../src/server/communities/index.ts';
import { createPublicProfileHandler } from '../src/server/public-profile/index.ts';
import {
  PublicMediaService,
  createPublicMediaHandler,
} from '../src/server/public-media/index.ts';

const id = '11111111-1111-4111-8111-111111111111';
type Kind = 'account' | 'communities' | 'profiles' | 'media';
const urls: Record<Kind, string> = {
  account: '/api/account/session',
  communities: '/api/communities',
  profiles: '/api/public-profiles/synthetic',
  media: `/api/public-media/avatar/${id}/${id}`,
};

function handler(kind: Kind, work: () => Promise<void>, t: TestContext) {
  if (kind === 'account') {
    // The pool stays disconnected; only the real HTTP adapter is under test.
    const database = new Database('postgresql://127.0.0.1/hash_talk_test');
    t.after(() => database.close());
    const service = new AccountService({
      store: database.authentication,
      origin: 'http://127.0.0.1:45100',
    });
    t.mock.method(service, 'session', async () => {
      await work();
      throw new AccountError(401, 'Session ended or expired.');
    });
    return createAccountHandler({ service, origin: 'http://127.0.0.1:45100' });
  }
  if (kind === 'communities')
    return createCommunityHandler({
      list: async () => {
        await work();
        return { items: [], next: null };
      },
      read: () => Promise.reject(new Error('Unexpected route.')),
    });
  if (kind === 'profiles')
    return createPublicProfileHandler(async () => {
      await work();
      return { id, handle: 'synthetic', avatar: null };
    });
  return createPublicMediaHandler(
    new PublicMediaService({
      profiles: {
        releasedAvatar: async () => {
          await work();
          return { type: 'image/png', bytes: new Uint8Array([1]) };
        },
      },
      communities: { releasedPhoto: () => Promise.resolve(null) },
    }),
  );
}

for (const kind of ['account', 'communities', 'profiles', 'media'] as const)
  await test(`${kind}: unrelated requests are not rejected by a four-operation ceiling`, async (t) => {
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const current = handler(
      kind,
      () => {
        started++;
        return gate;
      },
      t,
    );
    t.after(() => current.close());
    const responses: ServerResponse[] = [];
    const jobs = Array.from({ length: 16 }, () => {
      const request = new IncomingMessage(new Socket());
      request.method = 'GET';
      request.url = urls[kind];
      const response = new ServerResponse(request);
      responses.push(response);
      return current.handle(request, response);
    });
    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      assert.equal(started, 16);
      assert.ok(responses.every((response) => response.statusCode !== 503));
    } finally {
      release();
      await Promise.all(jobs);
      for (const response of responses) response.destroy();
    }
    // Removing transport admission must not turn an unauthorized session into success.
    assert.ok(
      responses.every(
        (response) => response.statusCode === (kind === 'account' ? 401 : 200),
      ),
    );
  });

await test('unauthenticated call traffic cannot exhaust a shared visitor window', async (t) => {
  const database = new Database('postgresql://127.0.0.1/hash_talk_test');
  t.after(() => database.close());
  const origin = 'http://127.0.0.1:45100';
  const service = new AccountService({
    store: database.authentication,
    origin,
  });
  t.mock.method(service, 'authorize', () =>
    Promise.reject(new AccountError(401, 'Session ended or expired.')),
  );
  const current = createAccountHandler({ service, origin });
  t.after(() => current.close());
  for (let i = 0; i < 1000; i++) {
    const request = new IncomingMessage(new Socket());
    request.method = 'POST';
    request.url = '/api/account/calls/sync';
    request.headers = { origin, 'content-type': 'application/json' };
    request.push(Buffer.from('{}'));
    request.push(null);
    const response = new ServerResponse(request);
    try {
      await current.handle(request, response);
      assert.equal(response.statusCode, 401);
    } finally {
      response.destroy();
      request.destroy();
    }
  }
});

await test('account adapter keeps Unix-proxied login budgets isolated and fails closed', async (t) => {
  const database = new Database('postgresql://127.0.0.1/hash_talk_test');
  t.after(() => database.close());
  const origin = 'http://127.0.0.1:45100';
  const service = new AccountService({
    store: database.authentication,
    origin,
  });
  const challenges = t.mock.method(service, 'challenge', () =>
    Promise.resolve({
      id,
      message: 'synthetic',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      browserToken: '0'.repeat(64),
    }),
  );
  const current = createAccountHandler({
    service,
    origin,
    trustUnixProxy: true,
  });
  t.after(() => current.close());
  async function challenge(address: string): Promise<number> {
    const request = new IncomingMessage(new Socket());
    request.method = 'POST';
    request.url = '/api/account/challenge';
    request.headers = {
      origin,
      'content-type': 'application/json',
      'x-0xdmme-client-address': address,
    };
    request.push(Buffer.from('{}'));
    request.push(null);
    const response = new ServerResponse(request);
    try {
      await current.handle(request, response);
      return response.statusCode;
    } finally {
      response.destroy();
      request.destroy();
    }
  }
  for (let i = 0; i < 6; i++)
    assert.equal(await challenge('198.51.100.1'), 200);
  assert.equal(await challenge('198.51.100.1'), 429);
  assert.equal(await challenge('198.51.100.2'), 200);
  assert.equal(await challenge('forged, invalid'), 503);
  assert.equal(challenges.mock.callCount(), 7);
});
