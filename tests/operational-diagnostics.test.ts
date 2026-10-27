import { realpath } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtemp, readFile, rm, stat, chmod, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  OperationalHealth,
  TrafficDiagnostics,
  DiagnosticJournal,
  diagnosticDirectory,
  readDiagnostics,
} from '../src/server/operational-health/index.ts';
import type { DiagnosticEvent } from '../src/server/operational-health/index.ts';
import { deferred, waitForBoundary } from './fixtures/deferred.ts';

const db = {
  poolConnections: 1,
  poolIdle: 1,
  poolWaiting: 0,
  queryAvailable: true,
  activeTransactions: 0,
  lockWaiters: 0,
  oldestTransactionSeconds: 0,
};
function record() {
  return {
    reason: 'server-error',
    observedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    metrics: {
      traffic: {
        started: 1,
        completed: 1,
        errors: 1,
        slow: 0,
        aborted: 0,
        activeRequests: 0,
        activeConnections: 1,
      },
      resources: null,
      database: db,
    },
  };
}
class Response extends EventEmitter {
  statusCode = 200;
  writableFinished = false;
  stream = false;
  getHeader() {
    return this.stream ? 'text/event-stream' : 'application/json';
  }
  finish() {
    this.writableFinished = true;
    this.emit('finish');
    this.emit('close');
  }
  get response() {
    return this as unknown as ServerResponse;
  }
}
function request(): IncomingMessage {
  return {
    url: '/api/account/messages/secret?token=private',
    headers: { cookie: 'secret' },
  } as unknown as IncomingMessage;
}
await test('request failures and deadline delays retain only fixed areas and numeric counters', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const events: DiagnosticEvent[] = [];
  const traffic = new TrafficDiagnostics((event) => events.push(event));
  const response = new Response();
  traffic.observe(request(), response.response);
  t.mock.timers.tick(2000);
  assert.equal(events[0]?.reason, 'slow-request');
  response.statusCode = 503;
  response.finish();
  assert.equal(response.listenerCount('close'), 0);
  assert.equal(response.listenerCount('finish'), 0);
  assert.ok(events.some((event) => event.reason === 'server-error'));
  assert.equal(traffic.snapshot().activeRequests, 0);
  assert.doesNotMatch(
    JSON.stringify(events),
    /secret|private|token|cookie|messages/u,
  );
  const aborted = new Response();
  traffic.observe(request(), aborted.response);
  aborted.emit('close');
  assert.equal(events.at(-1)?.reason, 'request-aborted');
  const count = events.length;
  const stream = new Response();
  stream.stream = true;
  traffic.observe(request(), stream.response);
  t.mock.timers.tick(2000);
  stream.emit('close');
  assert.equal(
    events.length,
    count,
    'Normal SSE lifetime/disconnect is not lag/failure',
  );
});
await test('normal traffic and idle time do not run collection; events coalesce and suppress repeats', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'xdmme-diagnostics-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = createServer();
  let calls = 0;
  let entered = deferred<void>();
  const release = deferred<void>();
  const health = new OperationalHealth({
    server,
    directory,
    database: {
      operationalSnapshot: async () => {
        calls++;
        entered.resolve();
        if (calls === 1) await release.promise;
        return db;
      },
    },
  });
  await health.start();
  await waitForBoundary(entered.promise);
  t.mock.timers.tick(90000);
  assert.equal(calls, 1, 'No periodic SQL or sampling loop');
  for (let i = 0; i < 500; i++) health.note({ reason: 'server-error' });
  health.note({ reason: 'health-unavailable' });
  assert.equal(calls, 1, 'One owned collection at a time');
  release.resolve();
  entered = deferred<void>();
  const closing = health.close();
  await closing;
  assert.ok(calls <= 3);
  const result = await readDiagnostics(diagnosticDirectory(directory));
  assert.equal(
    result.events.filter((e) => e.reason === 'server-error').length,
    1,
  );
  assert.ok(result.events.some((e) => e.reason === 'health-unavailable'));
  assert.ok(result.events.some((e) => e.reason === 'shutdown'));
  const bytes = await readFile(
    join(diagnosticDirectory(directory), 'events.json'),
    'utf8',
  );
  assert.ok(bytes.length < 131072);
  assert.equal(
    (await stat(join(diagnosticDirectory(directory), 'events.json'))).mode &
      0o777,
    0o600,
  );
});
await test('bounded incident history survives restart and strips unapproved metadata', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'xdmme-journal-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const first = new DiagnosticJournal(directory);
  assert.equal(await first.initialize(), false);
  for (let i = 0; i < 40; i++)
    await first.append({ ...record(), message: 'SECRET', ip: '127.0.0.2' });
  const second = new DiagnosticJournal(directory);
  assert.equal(
    await second.initialize(),
    true,
    'Running marker identifies an interrupted prior session',
  );
  const result = await readDiagnostics(directory);
  assert.equal(result.events.length, 32);
  assert.doesNotMatch(
    await readFile(join(directory, 'events.json'), 'utf8'),
    /SECRET|127.0.0.2/u,
  );
  await second.lifecycle('stopped');
  assert.equal(await new DiagnosticJournal(directory).initialize(), false);
  await chmod(join(directory, 'events.json'), 0o644);
  await assert.rejects(readDiagnostics(directory), /Private diagnostics/u);
});
await test('diagnostics refuse symbolic-link directories and report storage failure explicitly', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'xdmme-diagnostics-links-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  await symlink(directory, join(directory, 'link'));
  await assert.rejects(
    new DiagnosticJournal(join(directory, 'link')).initialize(),
    /symbolic links/u,
  );
  const journal = new DiagnosticJournal(directory);
  await journal.initialize();
  await symlink(
    join(directory, 'lifecycle.json'),
    join(directory, 'events.json.pending'),
  );
  await assert.rejects(journal.append(record()));
  assert.equal(
    (
      JSON.parse(await readFile(join(directory, 'lifecycle.json'), 'utf8')) as {
        state: string;
      }
    ).state,
    'running',
  );
});
await test('fatal monitor preserves the default failing exit and excludes exception contents', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'xdmme-fatal-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const module = new URL(
    '../src/server/operational-health/index.ts',
    import.meta.url,
  ).href;
  const code = `import { createServer } from 'node:http';
    import { OperationalHealth } from ${JSON.stringify(module)};
    const health = new OperationalHealth({server:createServer(), directory:process.argv[1],
      database:{operationalSnapshot:()=>Promise.resolve(${JSON.stringify(db)})}});
    await health.start(); setImmediate(() => { throw new Error('PRIVATE_EXCEPTION_CONTENT'); });`;
  await assert.rejects(
    promisify(execFile)(process.execPath, [
      '--input-type=module',
      '-e',
      code,
      directory,
    ]),
  );
  const report = await readFile(
    join(diagnosticDirectory(directory), 'fatal.json'),
    'utf8',
  );
  assert.equal(
    (JSON.parse(report) as { reason: string }).reason,
    'uncaught-exception',
  );
  assert.doesNotMatch(report, /PRIVATE_EXCEPTION_CONTENT|stack/u);
  const history = await readDiagnostics(diagnosticDirectory(directory));
  assert.equal(history.fatal?.reason, 'uncaught-exception');
});

await test('native HTTP wiring records a server failure and releases healthy request callbacks', async (t) => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), 'xdmme-http-diagnostics-')),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const server = createServer((_request, response) => {
    response.writeHead(503).end();
  });
  const health = new OperationalHealth({
    server,
    directory,
    database: { operationalSnapshot: () => Promise.resolve(db) },
  });
  await health.start();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await health.close();
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(
    `http://127.0.0.1:${address.port}/api/account/messages/PRIVATE?secret=TOKEN`,
  );
  assert.equal(response.status, 503);
  await response.arrayBuffer();
  await health.close();
  const history = await readDiagnostics(diagnosticDirectory(directory));
  const error = history.events.find((event) => event.reason === 'server-error');
  assert.equal(error?.area, 'account');
  assert.equal(error?.metrics.traffic['activeRequests'], 0);
  assert.doesNotMatch(
    JSON.stringify(history),
    /PRIVATE|TOKEN|secret=|127\.0\.0\.1/u,
  );
});
