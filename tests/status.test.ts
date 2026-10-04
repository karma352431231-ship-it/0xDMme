import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  statusAudiencePage,
  statusCanRead,
  statusExpiresAt,
  statusIsActive,
  statusLifetime,
} from '../src/shared/status/index.ts';
import { backupTarget } from '../src/shared/backups/index.ts';

await test('status congela a audiência aprovada, mudanças afetam os próximos e bloqueio impede leitura', () => {
  const author = crypto.randomUUID(),
    first = crypto.randomUUID(),
    hidden = crypto.randomUUID(),
    newcomer = crypto.randomUUID();
  const page = statusAudiencePage({
    author,
    contacts: [first, hidden],
    excluded: new Set([hidden]),
  });
  assert.deepEqual(page, [first]);
  const audience = new Set(page),
    post = { author, audience, blocked: false, publishedAt: 1000, now: 2000 };
  const next = statusAudiencePage({
    author,
    contacts: [hidden, newcomer],
    excluded: new Set([first]),
  });
  assert.deepEqual(next, [hidden, newcomer]);
  assert.equal(statusCanRead({ ...post, viewer: first }), true);
  assert.equal(statusCanRead({ ...post, viewer: hidden }), false);
  assert.equal(statusCanRead({ ...post, viewer: newcomer }), false);
  assert.equal(statusCanRead({ ...post, viewer: first, blocked: true }), false);
  assert.equal(statusCanRead({ ...post, viewer: author }), true);
  assert.equal(
    statusCanRead({ ...post, viewer: first, now: statusExpiresAt(1000) }),
    false,
  );
  assert.equal(statusIsActive({ publishedAt: 1000, now: 999 }), false);
  assert.equal(statusExpiresAt(1000), 1000 + statusLifetime);
});

await test('status não é um item permitido no backup e audiência não aceita identidades repetidas', () => {
  const author = crypto.randomUUID(),
    peer = crypto.randomUUID();
  assert.throws(() =>
    backupTarget({
      kind: 'status',
      id: crypto.randomUUID(),
      hash: 'a'.repeat(64),
    }),
  );
  assert.throws(() =>
    statusAudiencePage({ author, contacts: [peer, peer], excluded: new Set() }),
  );
  assert.throws(() =>
    statusAudiencePage({ author, contacts: [author], excluded: new Set() }),
  );
  assert.throws(() =>
    statusAudiencePage({
      author,
      contacts: Array.from({ length: 17 }, () => crypto.randomUUID()),
      excluded: new Set(),
    }),
  );
  assert.throws(() => statusExpiresAt(Number.MAX_SAFE_INTEGER));
});
