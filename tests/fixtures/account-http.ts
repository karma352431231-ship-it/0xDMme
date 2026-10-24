import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { Database } from '../../src/server/database/index.ts';
import {
  AccountService,
  createAccountHandler,
} from '../../src/server/account/index.ts';
import { MessageService } from '../../src/server/messages/index.ts';
import { CallService } from '../../src/server/calls/index.ts';
import { DeviceService } from '../../src/server/devices/index.ts';
import { AccountError } from '../../src/shared/account/index.ts';
import type { AccountSession } from '../../src/shared/account/index.ts';

/** Real request streams/headers; only response bytes are captured without a socket. */
class CapturedResponse extends ServerResponse {
  content = '';
  override end(chunk?: unknown): this {
    if (typeof chunk === 'string') this.content += chunk;
    else if (chunk instanceof Uint8Array)
      this.content += Buffer.from(chunk).toString();
    return this;
  }
}

/** Exercise the HTTP adapter. Domain/storage methods are isolated here; the
 * PostgreSQL integration suites exercise their actual authorization and crypto. */
export function accountHttpFixture(t: TestContext) {
  const origin = 'https://0xdmme.app',
    token = 'a'.repeat(64);
  const database = new Database('postgresql://127.0.0.1/hash_talk_test');
  const service = new AccountService({
    store: database.authentication,
    origin,
  });
  const messages = new MessageService(database, database.devices);
  const devices = new DeviceService(database.devices);
  const calls = new CallService({
    store: database.calls,
    messages,
    changes: database.changes,
    config: null,
  });
  const session: AccountSession = {
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'b'.repeat(64),
    address: '0x' + '1'.repeat(40),
    ecosystem: 'evm',
    name: '',
    profileRevision: 0,
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    deviceState: 'pending',
    historyAuthorized: false,
  };
  const data = { session, operations: [] as string[] };
  t.mock.method(service, 'authorize', (candidate: string, csrf: unknown) => {
    if (candidate !== token || csrf !== data.session.csrf)
      return Promise.reject(
        new AccountError(401, 'Synthetic unauthorized session.'),
      );
    return Promise.resolve();
  });
  t.mock.method(service, 'session', (candidate: string) => {
    assert.equal(candidate, token);
    return Promise.resolve(data.session);
  });
  t.mock.method(messages, 'operate', (operation: string) => {
    data.operations.push(operation);
    return Promise.resolve({ status: 'accepted' });
  });
  t.mock.method(calls, 'operate', (operation: string) => {
    data.operations.push(operation);
    return Promise.resolve({ status: 'accepted' });
  });
  const handler = createAccountHandler({
    origin,
    service,
    messages,
    calls,
    devices,
  });
  t.after(async () => {
    handler.close();
    await database.close();
  });
  function request(path: string, body: string | null = '{}') {
    const incoming = new IncomingMessage(new Socket());
    incoming.method = 'POST';
    incoming.url = '/api/account/' + path;
    incoming.headers = {
      origin,
      'content-type': 'application/json',
      cookie: '__Host-hash-talk-session=' + token,
      'x-hash-talk-csrf': data.session.csrf,
    };
    if (body !== null) {
      incoming.push(Buffer.from(body));
      incoming.push(null);
    }
    const response = new CapturedResponse(incoming);
    t.after(() => {
      response.destroy();
      incoming.destroy();
    });
    return {
      incoming,
      response,
      run: () => handler.handle(incoming, response),
    };
  }
  return { request, handler, data, service, messages, calls, devices };
}
