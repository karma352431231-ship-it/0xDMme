import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import {
  PublicActionGate,
  closePublicProfileGuidance,
  missingPublicProfile,
  publicProfileGuidanceButton,
} from '../src/client/public-action-guidance/index.ts';
import type { PublicAction } from '../src/client/public-action-guidance/index.ts';
import { ApiResponseError } from '../src/client/api-response/index.ts';
import { followControl } from '../src/client/public-profile/follow.ts';
import { PublicProfiles } from '../src/client/public-profile/controller.ts';
import { PostComposer } from '../src/client/communities/post-composer.ts';
import { Communities } from '../src/client/communities/controller.ts';
import { feedFollowControl } from '../src/client/communities/feed-follow.ts';
import { communityNavigation } from '../src/client/communities/navigation.ts';
import { bindCommunityCreationEntry } from '../src/client/communities/creation-entry.ts';
import { setActiveLanguage, t as translate } from '../src/shared/i18n/index.ts';
import type { AccountSession } from '../src/shared/account/index.ts';
import type { VaultAccess } from '../src/client/vault-authority/index.ts';
import type { ExternalMediaConsent } from '../src/client/external-media/index.ts';
import { CommunityNode } from './fixtures/community-dom.ts';
import { deferred } from './fixtures/deferred.ts';

const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const session = (csrf = 'synthetic'): AccountSession =>
  ({
    accountId: 'account',
    deviceId: 'device',
    csrf,
  }) as AccountSession;

class ActionNode extends CommunityNode {
  open = false;
  href = '';
  override classList = {
    add: (...names: string[]) => {
      this.className = [
        ...new Set([...this.className.split(' '), ...names]),
      ].join(' ');
    },
    remove: (...names: string[]) => {
      this.className = this.className
        .split(' ')
        .filter((name) => !names.includes(name))
        .join(' ');
    },
  };
  get isConnected(): boolean {
    return this.tag === 'body' || this.parent !== null;
  }
  focus(): void {}
  showModal(): void {
    this.open = true;
  }
  close(): void {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
  override closest(selector: string): CommunityNode | null {
    if (selector === '[data-community-compose]')
      return 'communityCompose' in this.dataset
        ? this
        : (this.parent?.closest(selector) ?? null);
    if (selector === 'a[href]') return this.tag === 'a' ? this : null;
    return super.closest(selector);
  }
}
function dom(t: TestContext) {
  const body = new ActionNode('body'),
    source = new ActionNode('button');
  body.append(source);
  const document = Object.assign(new ActionNode('#document'), {
    body,
    activeElement: source,
    createElement: (tag: string) => new ActionNode(tag),
    createTextNode: (text: string) => {
      const node = new ActionNode('#text');
      node.textContent = text;
      return node;
    },
    createElementNS: (_namespace: string, tag: string) => new ActionNode(tag),
  });
  const window = new EventTarget();
  const values = {
    document,
    window,
    Element: ActionNode,
    HTMLElement: ActionNode,
    matchMedia: () => ({ matches: false }),
  };
  const saved = Object.keys(values).map(
    (key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const,
  );
  for (const [key, value] of Object.entries(values))
    Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => {
    closePublicProfileGuidance();
    setActiveLanguage('en');
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  });
  return { body, document, window, source };
}
const descriptions: Record<PublicAction, string> = {
  'follow-community': 'Create a public profile to follow this community.',
  'follow-profile': 'Create a public profile to follow this profile.',
  post: 'Create a public profile to publish a post.',
  'create-community': 'Create a public profile to create a community.',
  participate: 'Create a public profile to vote, reply or share.',
};
for (const language of ['en', 'zh-CN'] as const)
  for (const action of Object.keys(descriptions) as PublicAction[])
    await test(`signed-out ${action} shows contextual guidance and the direct setup link in ${language}`, async (t) => {
      const f = dom(t);
      setActiveLanguage(language);
      const gate = new PublicActionGate({
        session: () => null,
        profile: () =>
          assert.fail('A visitor must not open private account state'),
      });
      assert.equal(
        await gate.allow(action, new AbortController().signal),
        false,
      );
      const dialog = f.body.querySelector('dialog')!;
      assert.match(
        dialog.textContent,
        new RegExp(
          translate(descriptions[action]).replace(
            /[.*+?^${}()|[\]\\]/gu,
            '\\$&',
          ),
          'u',
        ),
      );
      assert.equal(
        dialog.getAttribute('aria-label'),
        translate('A public profile is required'),
      );
      const link = dialog.querySelector('a') as ActionNode;
      assert.equal(link.textContent, translate('Create public profile'));
      assert.equal(link.href, '#settings?section=profile');
      dialog.querySelector('button')!.click();
      assert.equal(f.body.querySelector('dialog'), null);
    });

await test('a signed-in account without a profile is guided; an existing public profile proceeds without a prompt', async (t) => {
  const f = dom(t);
  let exists = false;
  const gate = new PublicActionGate({
    session: () => session(),
    profile: () => Promise.resolve(exists),
  });
  assert.equal(await gate.allow('post', new AbortController().signal), false);
  assert.ok(f.body.querySelector('dialog'));
  closePublicProfileGuidance();
  exists = true;
  assert.equal(await gate.allow('post', new AbortController().signal), true);
  assert.equal(f.body.querySelector('dialog'), null);
});

for (const interrupt of [
  'navigation',
  'account',
  'same-account-new-session',
] as const)
  await test(`a late prerequisite check cannot open or authorize a stale action after ${interrupt}`, async (t) => {
    const f = dom(t),
      pending = deferred<boolean>(),
      abort = new AbortController();
    let current: AccountSession | null = session();
    const gate = new PublicActionGate({
      session: () => current,
      profile: () => pending.promise,
    });
    const checking = gate.allow('post', abort.signal);
    if (interrupt === 'navigation') abort.abort();
    else if (interrupt === 'account') {
      current = null;
      gate.reset();
    } else current = session('new-session');
    pending.resolve(interrupt === 'navigation');
    assert.equal(await checking, false);
    assert.equal(f.body.querySelector('dialog'), null);
  });

await test('repeated clicks coalesce only the current check; errors still propagate and closing never replays an action', async (t) => {
  const f = dom(t),
    pending = deferred<boolean>();
  let reads = 0;
  const gate = new PublicActionGate({
    session: () => session(),
    profile: () => {
      reads++;
      return pending.promise;
    },
  });
  const first = gate.allow('post', new AbortController().signal),
    second = gate.allow('create-community', new AbortController().signal);
  pending.resolve(false);
  assert.deepEqual(await Promise.all([first, second]), [false, false]);
  assert.equal(reads, 1);
  assert.equal(f.body.querySelectorAll('dialog').length, 1);
  f.window.dispatchEvent(new Event('hashchange'));
  assert.equal(f.body.querySelector('dialog'), null);
  const error = new Error('Synthetic authorization failure');
  const failing = new PublicActionGate({
    session: () => session(),
    profile: () => Promise.reject(error),
  });
  await assert.rejects(
    failing.allow('post', new AbortController().signal),
    (actual) => actual === error,
  );
  assert.equal(f.body.querySelector('dialog'), null);
});

await test('only the explicit missing-profile HTTP 403 is a public read prerequisite; revocation and transport failures are not', () => {
  const message = 'Create your public profile in Profile before participating.';
  const error = (
    status: number,
    reason = message,
    failure: 'http' | 'timeout' = 'http',
  ) =>
    new ApiResponseError({
      operation: 'communities/state',
      status,
      failure,
      message: reason,
    });
  assert.equal(missingPublicProfile(error(403)), true);
  for (const value of [
    error(401),
    error(409),
    error(403, 'Device revoked.'),
    error(403, message, 'timeout'),
    new Error(message),
  ])
    assert.equal(missingPublicProfile(value), false);
});

await test('profile follow controls show guidance for visitors and missing profiles, without fetching follow state', async (t) => {
  const f = dom(t),
    controller = new PublicProfiles({} as VaultAccess);
  t.mock.method(controller, 'hasSession', () => true);
  t.mock.method(controller, 'refresh', () => Promise.resolve());
  t.mock.method(controller, 'perform', () =>
    assert.fail('No follow read or write without a public identity'),
  );
  for (const value of [undefined, controller]) {
    const host = new ActionNode();
    f.body.append(host);
    await followControl(host as unknown as HTMLElement, {
      controller: value,
      target: 'target',
      signal: new AbortController().signal,
      failed: () => assert.fail('Prerequisites are not errors'),
    });
    const follow = host.querySelector('button')!;
    assert.equal(follow.textContent, 'Follow');
    follow.click();
    assert.ok(
      f.body
        .querySelector('dialog')
        ?.textContent.includes(descriptions['follow-profile']),
    );
    closePublicProfileGuidance();
  }
});

await test('closing a hover card does not dismiss guidance; account replacement and Escape do', (t) => {
  const f = dom(t),
    hover = new AbortController();
  const control = publicProfileGuidanceButton(
    f.body as unknown as HTMLElement,
    'follow-profile',
    hover.signal,
  );
  control.click();
  hover.abort();
  assert.ok(f.body.querySelector('dialog'));
  f.body
    .querySelector('dialog')!
    .dispatchEvent(new Event('cancel', { cancelable: true }));
  assert.equal(f.body.querySelector('dialog'), null);
  publicProfileGuidanceButton(
    f.body as unknown as HTMLElement,
    'follow-community',
    new AbortController().signal,
  ).click();
  const gate = new PublicActionGate({
    session: () => null,
    profile: () => Promise.resolve(false),
  });
  gate.reset();
  assert.equal(f.body.querySelector('dialog'), null);
});

await test('the guest feed Follow control opens guidance without requesting a signed relation or mutation', async (t) => {
  const f = dom(t),
    host = new ActionNode();
  f.body.append(host);
  feedFollowControl(
    host as unknown as HTMLElement,
    { community: { id: 'group', name: 'Synthetic community' }, author: null },
    {
      controller: new Communities({} as VaultAccess),
      profiles: {
        inspect: () => assert.fail('No private read'),
        set: () => assert.fail('No follow'),
      },
      participation: new PublicActionGate({
        session: () => null,
        profile: () => assert.fail('No profile read for a visitor'),
      }),
      run: (work) => work(),
      valid: () => true,
      changed: () => Promise.resolve(),
      signal: new AbortController().signal,
      chooseOnMobile: true,
    },
  );
  host.querySelector('button')!.click();
  await turn();
  assert.ok(
    f.body
      .querySelector('dialog')
      ?.textContent.includes(descriptions['follow-community']),
  );
});

await test('guest Post opens guidance rather than a composer; leaving cancels an in-flight profile check', async (t) => {
  const f = dom(t);
  const gate = new PublicActionGate({
    session: () => null,
    profile: () => assert.fail('No profile read'),
  });
  const composer = new PostComposer(
    new Communities({} as VaultAccess),
    {} as ExternalMediaConsent,
    gate,
    () => {},
  );
  composer.open();
  await turn();
  assert.equal(f.body.querySelector('.post-composer-dialog'), null);
  assert.ok(
    f.body.querySelector('dialog')?.textContent.includes(descriptions.post),
  );
  closePublicProfileGuidance();
  const pending = deferred<boolean>();
  const delayed = new PostComposer(
    new Communities({} as VaultAccess),
    {} as ExternalMediaConsent,
    { allow: () => pending.promise },
    () => {},
  );
  delayed.open();
  f.window.dispatchEvent(new Event('hashchange'));
  pending.resolve(true);
  await turn();
  assert.equal(f.body.querySelector('dialog'), null);
});

await test('visitors see both floating actions; the creation link opens guidance before navigation', async (t) => {
  const f = dom(t),
    host = new ActionNode();
  f.body.append(host);
  communityNavigation(host as unknown as HTMLElement, {
    view: 'feed',
    selected: null,
    signedIn: false,
  });
  const choices = host.querySelector('.community-create-choices')!;
  assert.equal(choices.children.length, 2);
  const create = choices.children[1] as ActionNode;
  create.setAttribute('href', create.href);
  const gate = new PublicActionGate({
    session: () => null,
    profile: () => assert.fail('No profile read'),
  });
  bindCommunityCreationEntry({
    access: gate,
    signal: () => new AbortController().signal,
    signedIn: () => false,
    failed: () => assert.fail('Guidance is not a failure'),
  });
  const click = new Event('click', { cancelable: true });
  Object.defineProperty(click, 'target', { value: create });
  Object.defineProperty(click, 'button', { value: 0 });
  f.document.dispatchEvent(click);
  await turn();
  assert.equal(click.defaultPrevented, true);
  assert.ok(
    f.body
      .querySelector('dialog')
      ?.textContent.includes(descriptions['create-community']),
  );
});

await test('a failing prerequisite check after logout is discarded instead of reporting an error for the new screen', async (t) => {
  const f = dom(t),
    pending = deferred<boolean>();
  let current: AccountSession | null = session();
  const gate = new PublicActionGate({
    session: () => current,
    profile: () => pending.promise,
  });
  const checking = gate.allow('post', new AbortController().signal);
  current = null;
  gate.reset();
  pending.reject(new Error('Old session ended.'));
  assert.equal(await checking, false);
  assert.equal(f.body.querySelector('dialog'), null);
});

await test('an existing public profile opens the normal post composer once and keeps ordinary reads and cancellation', async (t) => {
  const f = dom(t),
    controller = new Communities({} as VaultAccess);
  let checks = 0,
    lists = 0;
  t.mock.method(controller, 'list', () => {
    lists++;
    return Promise.resolve({ items: [], next: null });
  });
  const composer = new PostComposer(
    controller,
    {} as ExternalMediaConsent,
    {
      allow: () => {
        checks++;
        return Promise.resolve(true);
      },
    },
    () => {},
  );
  composer.open();
  composer.open();
  await turn();
  assert.ok(f.body.querySelector('.post-composer-dialog'));
  assert.equal(f.body.querySelector('.public-action-dialog'), null);
  assert.equal(checks, 1);
  assert.equal(lists, 1);
  composer.close();
  assert.equal(f.body.querySelector('dialog'), null);
});
