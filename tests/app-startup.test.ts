import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import type { AccountSession } from '../src/shared/account/index.ts';

// Exercise the real entry point, routing and panels against the IDs in each
// authored document. Feature controllers have their own behavioral tests.
const featureExports: Record<string, string[]> = {
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
  contacts: ['startContacts'],
  'voice-playback': ['VoicePlayback'],
  calls: ['CallLog', 'startCalls'],
  communities: ['startCommunities'],
  'public-profile': ['startPublicProfile'],
  activity: ['startActivity'],
  'external-media': ['ExternalMediaConsent'],
  'file-drop': ['keepPageOnStrayDrop'],
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
        builder.onResolve(
          { filter: /^\.\.\/[^/]+\/index\.ts$/ },
          ({ path }) => ({
            path: path.split('/')[1] ?? '',
            namespace: 'fixture',
          }),
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

async function page(approval: boolean, userAgent: string, hash = '#conversas') {
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
  const modes: (string | undefined)[] = [];
  let pwaStarts = 0;
  let changed: (session: AccountSession | null) => void = () => {};
  const feature = {
    sync: {},
    setSession: () => {},
    reset: () => {},
    leave: () => {},
    forgetReturn: () => {},
    mount: () => {},
    mountMeter: () => {},
    ready: () => {},
    authorized: () => false,
  };
  const fixture: Record<string, unknown> = {};
  for (const names of Object.values(featureExports))
    for (const name of names) fixture[name] = () => feature;
  Object.assign(fixture, {
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
    MessageReadiness: class {
      update(): boolean {
        return false;
      }
    },
    VoicePlayback: class {},
    keepPageOnStrayDrop: () => {},
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
  runInNewContext(source, {
    fixture,
    document,
    window: new EventTarget(),
    navigator: { onLine: true, userAgent },
    location: { hash: approval ? '#configuracoes' : hash },
    matchMedia: () => Object.assign(new EventTarget(), { matches: !approval }),
    localStorage: { getItem: () => null, setItem: () => {} },
    URLSearchParams,
    HTMLElement: Node,
  });
  return { nodes, mounted, modes, document, pwaStarts, changed };
}

await test('documento da wallet inicializa a confirmação em Android e iPhone sem os painéis do app', async () => {
  for (const agent of ['Android', 'iPhone']) {
    const view = await page(true, agent);
    assert.equal(view.nodes.has('app-shell'), false);
    assert.equal(view.nodes.has('feed-body'), false);
    assert.equal(view.nodes.has('public-directory'), false);
    assert.equal(view.mounted.length, 1);
    assert.equal(view.nodes.get('page-content')?.children[0], view.mounted[0]);
    assert.equal(view.document.title, 'Confirmar assinatura · 0xDMme');
    assert.equal(view.pwaStarts, 0);
    view.changed(null);
    assert.match(
      view.nodes.get('connection')?.textContent ?? '',
      /Conexão disponível/u,
    );
  }
});

await test('app completo conserva os painéis e a inicialização da PWA no desktop', async () => {
  const view = await page(false, 'Macintosh');
  assert.equal(view.nodes.get('app-shell')?.dataset['page'], 'conversas');
  assert.equal(view.nodes.get('app-shell')?.dataset['layout'], 'all');
  assert.equal(view.nodes.get('app-shell')?.dataset['contactScope'], 'private');
  assert.equal(view.mounted.length, 1);
  assert.equal(view.pwaStarts, 1);
  view.changed(null);
  assert.match(
    view.nodes.get('connection')?.textContent ?? '',
    /Conexão disponível/u,
  );
});

await test('Perfil no mobile só monta configurações depois do login e as retira no logout', async () => {
  const view = await page(false, 'Android', '#perfil');
  const content = view.nodes.get('page-content')!;
  assert.equal(content.innerHTML, '');
  assert.equal(view.modes.at(-1), 'login');
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
