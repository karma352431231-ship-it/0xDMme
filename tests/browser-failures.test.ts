import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BrowserFailures } from './e2e/browser-failures.ts';
const input = {
  browser: 'webkit',
  origin: 'http://127.0.0.1:45111',
  provisional: true,
  message:
    'Fetch API cannot load http://127.0.0.1:45111/api/account/devices/read due to access control checks.',
};
await test('only the exact provisional WebKit diagnostic is classified; native exceptions always fail', () => {
  const failures = new BrowserFailures();
  failures.engine(input);
  assert.deepEqual(failures.errors, []);
  assert.equal(failures.report().provisionalNavigationTransportDiagnostics, 1);
  failures.native('error');
  failures.native('unhandledrejection');
  assert.deepEqual(failures.errors, [
    'Unhandled browser error',
    'Unhandled browser rejection',
  ]);
});
for (const change of [
  { provisional: false },
  { browser: 'chromium' },
  { origin: 'http://127.0.0.1:45112' },
  { message: input.message.replace('/devices/read', '/messages/publish') },
  {
    message: input.message.replace('/devices/read', '/devices/read?private=1'),
  },
  { message: 'Unexpected script failure' },
])
  await test(`engine error remains a failure for ${Object.keys(change)[0]}`, () => {
    const failures = new BrowserFailures();
    failures.engine({ ...input, ...change });
    assert.deepEqual(failures.errors, ['Unexpected browser engine error']);
    assert.equal(
      failures.report().provisionalNavigationTransportDiagnostics,
      0,
    );
  });
await test('stopping observation disposes capture and its bounded counter budget fails closed', () => {
  const failures = new BrowserFailures();
  for (let index = 0; index < 10_001; index++) failures.engine(input);
  assert.equal(
    failures.report().provisionalNavigationTransportDiagnostics,
    10_000,
  );
  assert.equal(failures.report().overflow, true);
  assert.deepEqual(failures.errors, [
    'Browser failure observation budget exceeded',
  ]);
  failures.stop();
  failures.native('error');
  assert.equal(failures.report().nativeErrors, 0);
});
