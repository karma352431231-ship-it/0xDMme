import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import type { publishGroupProfile } from '../src/client/groups/profile-edit.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
const bundle = await build({
  entryPoints: ['src/client/groups/profile-edit.ts'],
  bundle: true,
  write: false,
  platform: 'browser',
  format: 'iife',
  globalName: 'profile',
  plugins: [
    {
      name: 'profile-boundary',
      setup(builder) {
        builder.onResolve(
          { filter: /^\.\/(cache|reader|outbox)\.ts$/ },
          ({ path, importer }) =>
            importer.endsWith('/groups/profile-edit.ts')
              ? { path, namespace: 'fixture' }
              : undefined,
        );
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
          loader: 'js',
          contents:
            path === './cache.ts'
              ? 'export class GroupCache {async get(name){return fixture.get(name);}}'
              : path === './reader.ts'
                ? 'export const readGroupPage=async (_c,raw)=>raw;'
                : 'export const composeGroup=fixture.compose;export const sendGroupPending=fixture.send;',
        }));
      },
    },
  ],
});
function fixture() {
  const photo = fixtureGroupPhoto(),
    data = {
      raw: {
        version: 1,
        title: 'Synthetic',
        photo,
        description: 'Initial',
        sequence: 9,
      },
      latest: null as { id: string; kind: string; text: string } | null,
      pending: null as unknown,
      composed: [] as { id: string; text: string }[],
      sent: 0,
    };
  const context = {
    profile: undefined as
      { publishGroupProfile: typeof publishGroupProfile } | undefined,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    fixture: {
      get: (name: string) => (name === 'profile' ? data.raw : data.pending),
      compose: (input: { id: string; text: string }) => {
        data.composed.push(input);
        return Promise.resolve(input.id);
      },
      send: () => {
        data.sent++;
        return Promise.resolve();
      },
    },
  };
  runInNewContext(bundle.outputFiles[0]!.text, context);
  const publish = context.profile!.publishGroupProfile;
  const edit = (
    patch: { description?: string; photo?: typeof photo | null },
    id = crypto.randomUUID(),
  ) =>
    publish({
      authority: {} as Parameters<typeof publish>[0]['authority'],
      governance: {} as Parameters<typeof publish>[0]['governance'],
      machine: {} as Parameters<typeof publish>[0]['machine'],
      identities: {} as Parameters<typeof publish>[0]['identities'],
      group: {
        state: { groupId: crypto.randomUUID() },
        head: 'a'.repeat(64),
      } as Parameters<typeof publish>[0]['group'],
      api: () => Promise.resolve({ views: data.latest ? [data.latest] : [] }),
      id,
      patch,
      sequence: 9,
    });
  return { data, photo, edit };
}
await test('changing a group description preserves its photo and changing/removing a photo preserves its description', async () => {
  const f = fixture();
  await f.edit({ description: 'Edited' });
  assert.deepEqual(JSON.parse(f.data.composed[0]!.text), {
    version: 1,
    title: 'Synthetic',
    photo: f.photo,
    description: 'Edited',
  });
  await f.edit({ photo: null });
  assert.equal(
    (JSON.parse(f.data.composed[1]!.text) as { description: string })
      .description,
    'Initial',
  );
});
await test('accepted retry verifies the same requested content without creating or transmitting a duplicate', async () => {
  const f = fixture(),
    id = crypto.randomUUID();
  f.data.latest = {
    id,
    kind: 'profile',
    text: JSON.stringify({ ...f.data.raw, description: 'Saved' }),
  };
  await f.edit({ description: 'Saved' }, id);
  assert.equal(f.data.composed.length, 0);
  assert.equal(f.data.sent, 0);
  await assert.rejects(
    f.edit({ description: 'Different' }, id),
    /different content/,
  );
});
await test('concurrent description edit and altered pending draft are rejected before any transmission', async () => {
  const f = fixture();
  f.data.raw.sequence = 10;
  await assert.rejects(
    f.edit({ description: 'Stale' }),
    /Reload before editing/,
  );
  assert.equal(f.data.sent, 0);
  f.data.raw.sequence = 9;
  f.data.pending = {
    kind: 'profile',
    text: JSON.stringify({ ...f.data.raw, description: 'Different draft' }),
  };
  await assert.rejects(
    f.edit({ description: 'Requested' }),
    /different content/,
  );
  assert.equal(f.data.sent, 0);
});
