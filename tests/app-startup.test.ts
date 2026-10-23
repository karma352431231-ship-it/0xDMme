import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { AccountSession } from '../src/shared/account/index.ts';
import { MessageReadiness } from '../src/client/message-live/index.ts';

// Exercise the real entry point, routing and panels against the IDs in each
// authored document. Feature controllers have their own behavioral tests.
const featureExports: Record<string, string[]> = {
  language: ['startLanguage', 'mountLanguageSettings', 'applyLanguage'],
  'public-search': ['mountPublicSearch'],
  appearance: ['startAppearance', 'paintAvatar'],
  pwa: ['startPwa'],
  account: ['startAccount'],
  devices: ['startDevices', 'startEnrollmentEntry', 'mountEnrollmentLogin'],
  'message-live': ['MessageReadiness'],
  backups: ['startBackups'],
  'vault-ui': ['startVault'],
  messages: ['startMessages'],
  status: ['startStatus'],
  representatives: ['startRepresentatives'],
  contacts: ['bindContactShortcuts', 'startContacts'],
  'voice-playback': ['VoicePlayback'],
  calls: ['CallLog', 'startCalls'],
  communities: ['startCommunities', 'startRankingSide'],
  'public-profile': ['startPublicProfile'],
  activity: ['startActivity'],
  'external-media': ['ExternalMediaConsent'],
  'file-drop': ['keepPageOnStrayDrop'],
  'transient-menu': ['startTransientMenus'],
  scrollbars: ['startScrollbarFade'],
  'account-settings': ['AccountSettingsController'],
  daily: ['Daily'],
  'notification-sound': ['applySoundPreference', 'storedSoundPreference'],
};
const bundle = await build({
  entryPoints: ['src/client/app/index.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  plugins: [
    {
      name: 'feature-controllers',
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/[^/]+\/index\.ts$/ }, ({ path }) =>
          path === '../app-navigation/index.ts'
            ? undefined
            : {
                path: path.split('/')[1] ?? '',
                namespace: 'fixture',
              },
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => {
          const names = featureExports[path];
          if (!names) throw new Error(`Fixture ausente: ${path}`);
          return {
            contents: names
              .map((name) => `export const ${name} = fixture.${name};`)
              .join('\n'),
            loader: 'js',
          };
        });
      },
    },
  ],
});
const source = bundle.outputFiles[0]?.text ?? '';
if (!source) throw new Error('Build de teste ausente.');

class Node extends EventTarget {
  dataset: Record<string, string> = {};
  className = '';
  innerHTML = '';
  textContent = '';
  children: Node[] = [];
  get lastElementChild(): Node {
    return new Node();
  }
  querySelector(): null {
    return null;
  }
  querySelectorAll(): Node[] {
    return [];
  }
  setAttribute(): void {}
  after(): void {}
  prepend(node: Node): void {
    this.children.unshift(node);
  }
  append(...nodes: Node[]): void {
    this.children.push(...nodes);
  }
  replaceChildren(...nodes: Node[]): void {
    this.children = nodes;
  }
}

async function page(
  approval: boolean,
  userAgent: string,
  hash = '#conversas',
  authorized = false,
) {
  const html = await readFile(
    `src/client/app/${approval ? 'wallet' : 'index'}.html`,
    'utf8',
  );
  const nodes = new Map(
    [...html.matchAll(/\bid="([^"]+)"/gu)].map((match) => [
      match[1],
      new Node(),
    ]),
  );
  const document = Object.assign(new Node(), {
    title: '',
    getElementById: (id: string) => nodes.get(id) ?? null,
    createElement: () => new Node(),
  });
  const mounted: Node[] = [];
  const enrollments: Node[] = [];
  const modes: (string | undefined)[] = [];
  let pwaStarts = 0;
  const readied: string[] = [];
  let directorySettled: (session: AccountSession | null) => void = () => {};
  let changed: (session: AccountSession | null) => void = () => {};
  const feature = {
    sync: {},
    setSession: () => {},
    reset: () => {},
    leave: () => {},
    pause: () => {},
    resume: () => {},
    viewChanged: () => {},
    closeContact: () => {},
    dmEvent: () => {},
    forgetReturn: () => {},
    mount: () => {},
    mountEditor: () => {},
    mountMeter: () => {},
    ready: () => {},
    authorized: () => authorized,
    activeAuthors: () => Promise.resolve(new Set<string>()),
    statusesChanged: () => {},
  };
  const fixture: Record<string, unknown> = {};
  for (const names of Object.values(featureExports))
    for (const name of names) fixture[name] = () => feature;
  for (const name of [
    'startPublicProfile',
    'startCommunities',
    'startContacts',
    'startActivity',
    'startStatus',
    'startVault',
    'startCalls',
  ])
    fixture[name] = () => ({
      ...feature,
      ready: () => readied.push(name),
      sessionReady: () => readied.push(name),
    });
  Object.assign(fixture, {
    mountEnrollmentLogin: (node: Node) => enrollments.push(node),
    startAccount: (options: { changed: typeof changed }) => {
      changed = options.changed;
      return {
        approvalPage: approval,
        mount: (node: Node, mode?: string) => {
          mounted.push(node);
          modes.push(mode);
        },
      };
    },
    startPwa: () => {
      pwaStarts++;
      return { render: () => {} };
    },
    MessageReadiness,
    startMessages: (
      _access: unknown,
      _sync: unknown,
      options: { directorySettled?: typeof directorySettled },
    ) => {
      directorySettled = options.directorySettled ?? (() => {});
      return { ...feature, ready: () => readied.push('startMessages') };
    },
    VoicePlayback: class {},
    keepPageOnStrayDrop: () => {},
    bindContactShortcuts: () => {},
    ExternalMediaConsent: class {
      setSession(): void {}
      storageChanged(): void {}
    },
    CallLog: class {
      reset(): void {}
    },
    AccountSettingsController: class {
      setSession(): void {}
      ready(): void {}
    },
    Daily: class {},
  });
  const location = {
    hash: approval ? '#configuracoes' : hash,
    pathname: '/',
    search: '',
  };
  const setAddress = (
    _state: unknown,
    _unused: string,
    value: string,
  ): void => {
    const url = new URL(value, 'http://local.invalid');
    Object.assign(location, {
      hash: url.hash,
      pathname: url.pathname,
      search: url.search,
    });
  };
  Object.assign(document, { documentElement: new Node() });
  runInNewContext(source, {
    fixture,
    document,
    window: new EventTarget(),
    navigator: { onLine: true, userAgent },
    location,
    history: { replaceState: setAddress, pushState: setAddress },
    MutationObserver: class {
      observe(): void {}
    },
    HTMLAnchorElement: class extends Node {},
    Element: Node,
    Event,
    queueMicrotask,
    matchMedia: () => Object.assign(new EventTarget(), { matches: !approval }),
    localStorage: { getItem: () => null, setItem: () => {} },
    URLSearchParams,
    HTMLElement: Node,
  });
  return {
    nodes,
    mounted,
    enrollments,
    modes,
    document,
    pwaStarts,
    changed,
    readied,
    directorySettled,
  };
}

await test('authorized mobile boot starts the directory and calls before optional startup reads', async () => {
  const view = await page(false, 'Android', '#chats', true);
  view.readied.length = 0;
  const session = {
    accountId: 'synthetic-account',
    deviceId: 'synthetic-device',
    csrf: 'synthetic',
    name: 'Synthetic',
  } as AccountSession;
  view.changed(session);
  view.changed({ ...session });
  assert.equal(
    view.readied.filter((value) => value === 'startMessages').length,
    1,
  );
  assert.ok(view.readied.includes('startCalls'));
  assert.ok(!view.readied.includes('startActivity'));
  assert.ok(!view.readied.includes('startPublicProfile'));
  view.directorySettled(session);
  assert.ok(view.readied.includes('startActivity'));
  assert.ok(view.readied.includes('startPublicProfile'));
  assert.ok(view.readied.includes('startCommunities'));
});

for (const route of ['#communities', '#contacts'])
  await test(`${route} keeps its foreground startup independent of the private directory`, async () => {
    const view = await page(false, 'Android', route, true);
    view.readied.length = 0;
    view.changed({
      accountId: 'synthetic-account',
      deviceId: 'synthetic-device',
      csrf: 'synthetic',
    } as AccountSession);
    assert.ok(view.readied.includes('startCommunities'));
    assert.ok(view.readied.includes('startContacts'));
    assert.ok(view.readied.includes('startCalls'));
  });

await test('wallet document initializes confirmation on Android and iPhone without app panels', async () => {
  for (const agent of ['Android', 'iPhone']) {
    const view = await page(true, agent);
    assert.equal(view.nodes.has('app-shell'), false);
    assert.equal(view.nodes.has('feed-body'), false);
    assert.equal(view.nodes.has('public-directory'), false);
    assert.equal(view.mounted.length, 1);
    assert.equal(view.nodes.get('page-content')?.children[0], view.mounted[0]);
    assert.equal(view.document.title, 'Confirm signature · 0xDMme');
    assert.equal(view.pwaStarts, 0);
    assert.equal(view.enrollments.length, 0);
    view.changed(null);
    assert.match(
      view.nodes.get('connection')?.textContent ?? '',
      /Connection available/u,
    );
  }
});

await test('full app preserves panels and desktop PWA initialization', async () => {
  const view = await page(false, 'Macintosh');
  assert.equal(view.nodes.get('app-shell')?.dataset['page'], 'conversas');
  assert.equal(view.nodes.get('app-shell')?.dataset['layout'], 'all');
  assert.equal(view.nodes.get('app-shell')?.dataset['contactScope'], 'private');
  assert.equal(view.mounted.length, 1);
  assert.equal(view.enrollments.length, 1);
  assert.equal(view.enrollments[0], view.mounted[0]);
  assert.equal(view.pwaStarts, 1);
  view.changed(null);
  assert.match(
    view.nodes.get('connection')?.textContent ?? '',
    /Connection available/u,
  );
});

await test('mobile Profile mounts settings only after login and removes them on logout', async () => {
  const view = await page(false, 'Android', '#perfil');
  const content = view.nodes.get('page-content')!;
  assert.equal(content.innerHTML, '');
  assert.equal(view.modes.at(-1), 'login');
  assert.equal(view.enrollments.length, 1);
  view.changed({
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    csrf: 'synthetic',
    ecosystem: 'evm',
    address: '0x' + '1'.repeat(40),
    name: 'Sintético',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: '2027-01-01T00:00:00.000Z',
    profileRevision: 0,
  });
  assert.match(content.innerHTML, /profile-settings/u);
  assert.equal(view.modes.at(-1), 'settings');
  view.changed(null);
  assert.equal(content.innerHTML, '');
  assert.equal(view.modes.at(-1), 'login');
});
