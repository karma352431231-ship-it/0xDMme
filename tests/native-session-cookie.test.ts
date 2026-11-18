import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { sessionSeconds } from '../src/server/account/service.ts';

// The installed apps parse Set-Cookie themselves and reject a session cookie
// that lives longer than their own limit, which fails every sign-in as a
// "network" error. Their limit must cover the server's session lifetime.
const parsers = [
  {
    file: 'mobile/ios/App/App/NativeCookies.swift',
    limit: /session \? (\d+) \* 24 \* 60 \* 60 : 300/u,
  },
  {
    file: 'mobile/android/app/src/main/java/app/zeroxdmme/development/session/NativeCookies.java',
    limit: /SESSION\) \? (\d+)L \* 24 \* 60 \* 60 : 300/u,
  },
];

await test('the installed apps accept the server session cookie lifetime', async () => {
  for (const parser of parsers) {
    const source = await readFile(parser.file, 'utf8');
    const days = parser.limit.exec(source)?.[1];
    assert.ok(days, `${parser.file} session limit not found`);
    assert.ok(Number(days) * 24 * 60 * 60 >= sessionSeconds, parser.file);
  }
});
