import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { startModerationReview } from '../src/client/public-profile/moderation-review.ts';
import { showModerationImage } from '../src/client/public-profile/moderation-image.ts';
import type { PublicProfiles } from '../src/client/public-profile/controller.ts';
import { AccountError } from '../src/shared/account/index.ts';
import { publicModerationPolicy } from '../src/shared/public-moderation/index.ts';
import type { PublicModerationDetails } from '../src/shared/moderation-details/index.ts';
import { setActiveLanguage, t as text } from '../src/shared/i18n/index.ts';
import { CommunityNode, communityDocument } from './fixtures/community-dom.ts';

const media = {
  type: 'image/png',
  bytes: (
    await readFile(new URL('../src/client/app/icon-192.png', import.meta.url))
  ).toString('base64'),
};
function detail(): PublicModerationDetails {
  return {
    notice: {
      id: crypto.randomUUID(),
      target: crypto.randomUUID(),
      kind: 'community-banner',
      status: 'failed',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      appeal: null,
      decision: null,
    },
    policy: publicModerationPolicy,
    automaticVerdict: null,
    frames: null,
    post: null,
  };
}
function setup(context: TestContext) {
  const document = communityDocument(),
    create = document.createElement;
  document.createElement = (tag) =>
    Object.assign(create(tag), { isConnected: true });
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: document,
  });
  context.after(() => {
    setActiveLanguage('en');
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const revoked: string[] = [];
  context.mock.method(URL, 'createObjectURL', () => 'blob:restricted');
  context.mock.method(URL, 'revokeObjectURL', (url: string) =>
    revoked.push(url),
  );
  return { revoked, host: new CommunityNode() as unknown as HTMLElement };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

await test('review shows the private community banner without the duplicate subject block in both languages', async (context) => {
  const { host, revoked } = setup(context);
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const value = detail(),
      requests: string[] = [];
    const controller = {
      perform(operation: string, payload: Record<string, unknown>) {
        requests.push(operation);
        assert.equal(payload['id'], value.notice.id);
        return Promise.resolve(
          operation === 'moderation-details' ? value : media,
        );
      },
    } as PublicProfiles;
    const review = startModerationReview(controller, () =>
      assert.fail('a banner is not post media'),
    );
    review.mount(host, value.notice.id);
    await settle();
    assert.equal(host.querySelectorAll('img').length, 1);
    assert.equal(
      host.querySelector('img')?.alt,
      text('Mídia restrita à sua conta'),
    );
    assert.equal(host.querySelector('.moderation-subject'), null);
    assert.equal(host.textContent?.includes(text('Conteúdo analisado')), false);
    assert.equal(
      host.textContent?.includes(text('Resultado da análise')),
      true,
    );
    assert.deepEqual(requests, ['moderation-details', 'moderation-media']);
    await review.ready();
    assert.equal(host.querySelectorAll('img').length, 1);
    review.leave();
  }
  assert.equal(revoked.length, 4);
});

await test('private preview handles unavailable media and a transient error, and suppresses late bytes after leaving', async (context) => {
  const { host, revoked } = setup(context);
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    const stop = new AbortController();
    let attempts = 0;
    showModerationImage(host, detail().notice, {
      signal: stop.signal,
      controller: {
        perform: () =>
          ++attempts === 1
            ? Promise.reject(new Error('Prévia indisponível.'))
            : Promise.reject(
                new AccountError(404, 'Arquivo da análise indisponível.'),
              ),
      },
    });
    await settle();
    assert.equal(
      host.querySelector('button')?.textContent,
      text('Tentar novamente'),
    );
    host.querySelector('button')?.click();
    await settle();
    assert.equal(host.querySelectorAll('button').length, 0);
    assert.ok(
      host.textContent?.includes(
        text(
          'Este arquivo não está mais disponível. Ele pode ter sido substituído, removido ou atingido o prazo de retenção.',
        ),
      ),
    );
    stop.abort();
    host.replaceChildren();
  }
  const stop = new AbortController();
  let finish: (value: unknown) => void = () => {};
  showModerationImage(host, detail().notice, {
    signal: stop.signal,
    controller: {
      perform: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    },
  });
  stop.abort();
  finish(media);
  await settle();
  assert.equal(host.querySelectorAll('img').length, 0);
  assert.equal(revoked.length, 0);
});

await test('the private preview closes at its original deadline and never downloads an expired or removed candidate', async (context) => {
  const { host, revoked } = setup(context);
  const value = detail();
  const stop = new AbortController();
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() });
  showModerationImage(host, value.notice, {
    signal: stop.signal,
    controller: { perform: () => Promise.resolve(media) },
  });
  await settle();
  assert.equal(host.querySelectorAll('img').length, 1);
  context.mock.timers.tick(60_001);
  assert.equal(host.querySelectorAll('img').length, 0);
  assert.equal(revoked.length, 1);
  stop.abort();
  for (const status of ['expired', 'removed', 'discarding'] as const) {
    const signal = new AbortController();
    showModerationImage(
      host,
      { ...detail().notice, status },
      {
        signal: signal.signal,
        controller: {
          perform: () => {
            assert.fail('no download beyond retention');
          },
        },
      },
    );
    signal.abort();
  }
});
