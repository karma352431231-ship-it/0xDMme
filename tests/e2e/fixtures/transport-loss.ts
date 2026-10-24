import { deferred } from '../../fixtures/deferred.ts';
import { expect } from '@playwright/test';
import type { BrowserContext, Page, Route } from '@playwright/test';
import { object } from '../../../src/shared/account/index.ts';

function payload(route: Route): Record<string, unknown> {
  return object(object(route.request().postDataJSON() as unknown)['payload']);
}
/** Holds every acknowledgement for one real text until the old document has
 * been replaced. Profile publications and unrelated messages remain ordinary. */
export async function loseAcknowledgement(
  context: BrowserContext,
  operation: 'publish' | 'group-message-publish',
) {
  const acceptedOperation =
    operation === 'publish' ? 'accepted' : 'group-message-accepted';
  const publishPath = `**/api/account/messages/${operation}`;
  const acceptedPath = `**/api/account/messages/${acceptedOperation}`;
  let target: string | null = null,
    committed = false;
  const publish = async (route: Route) => {
    const packet = object(payload(route)['packet']);
    if (
      packet['kind'] !== 'text' ||
      (target !== null && packet['id'] !== target)
    )
      return route.continue();
    if (typeof packet['id'] !== 'string')
      throw new Error('Synthetic publication ID missing.');
    target = packet['id'];
    const response = await route.fetch({ timeout: 10_000, maxRetries: 0 });
    expect(response.ok()).toBe(true);
    expect(await response.json()).toMatchObject({ status: 'accepted' });
    committed = true;
    await route.abort('failed');
  };
  const accepted = (route: Route) =>
    payload(route)['id'] === target ? route.abort('failed') : route.continue();
  await context.route(publishPath, publish);
  await context.route(acceptedPath, accepted);
  return {
    waitForCommit: () => expect.poll(() => committed).toBe(true),
    close: async () => {
      try {
        await context.unroute(publishPath, publish);
      } finally {
        await context.unroute(acceptedPath, accepted);
      }
    },
  };
}
/** First actual publisher is the active owner. Its request stays uncommitted
 * until that page closes; only the surviving tab can publish it afterward. */
export async function holdPublisher(
  pages: readonly Page[],
  operation: 'publish' | 'group-message-publish',
) {
  const path = `**/api/account/messages/${operation}`;
  const released = deferred<void>();
  let owner: Page | null = null,
    parallel = 0;
  let target: unknown = null;
  const release = () => released.resolve(undefined);
  const handler = async (route: Route) => {
    const packet = object(payload(route)['packet']);
    if (
      packet['kind'] !== 'text' ||
      (target !== null && packet['id'] !== target)
    )
      return route.continue();
    if (owner === null) {
      target = packet['id'];
      owner = route.request().frame().page();
      owner.once('close', release);
      await released.promise;
      if (!owner.isClosed()) await route.abort('failed');
      return;
    }
    if (!owner.isClosed()) {
      parallel++;
      await route.abort('failed');
      return;
    }
    await route.continue();
  };
  for (const page of pages) await page.route(path, handler);
  return {
    waitForOwner: async (): Promise<Page> => {
      await expect.poll(() => owner !== null).toBe(true);
      if (!owner) throw new Error('No active publisher.');
      return owner;
    },
    assertExclusive: () =>
      expect(parallel, 'A second publisher ran before owner loss').toBe(0),
    close: async () => {
      release();
      if (owner) owner.off('close', release);
      for (const page of pages)
        if (!page.isClosed()) await page.unroute(path, handler);
    },
  };
}
