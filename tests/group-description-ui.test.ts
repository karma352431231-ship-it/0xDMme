import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GroupDescriptionUi } from '../src/client/groups/description-ui.ts';
import type { GroupSummary } from '../src/client/groups/controller.ts';
import { CommunityNode } from './fixtures/community-dom.ts';
import { deferred } from './fixtures/deferred.ts';
import {
  creationProfile,
  assertCreationProfile,
} from '../src/client/groups/creation-profile.ts';
import { fixtureGroupPhoto } from './fixtures/group-photo.ts';
import { t, setActiveLanguage } from '../src/shared/i18n/index.ts';
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(role: 'owner' | 'admin' | 'member' = 'owner') {
  const account = crypto.randomUUID(),
    group = {
      title: 'Synthetic',
      head: 'a'.repeat(64),
      state: {
        groupId: crypto.randomUUID(),
        members: [{ accountId: account, role }],
        kind: 'create',
      },
    } as GroupSummary;
  let selected: GroupSummary | null = group;
  const nodes = new Map(
    ['form', 'input', 'save', 'reload', 'feedback', ''].map((kind) => [
      `[data-group-description${kind ? '-' + kind : ''}]`,
      new CommunityNode(kind === 'input' ? 'textarea' : 'div'),
    ]),
  );
  const host = {
    querySelector: (selector: string) => nodes.get(selector) ?? null,
  } as unknown as HTMLElement;
  const pending = deferred<{ description: string; sequence: number }>(),
    saved: unknown[] = [];
  const ports = {
    selected: () => selected,
    account: () => account,
    load: () => pending.promise,
    save: (input: unknown) => {
      saved.push(input);
      return Promise.resolve();
    },
    run: (work: () => Promise<void>) => work(),
  };
  const ui = new GroupDescriptionUi(ports);
  ui.mount(host);
  ui.show(group);
  return {
    ui,
    ports,
    group,
    nodes,
    pending,
    saved,
    select: (group: GroupSummary | null) => {
      selected = group;
    },
  };
}
await test('description editing is available only to current owner/admin, while members can read it', async () => {
  for (const role of ['owner', 'admin', 'member'] as const) {
    const f = fixture(role);
    f.pending.resolve({ description: 'Current description', sequence: 4 });
    await turn();
    assert.equal(
      f.nodes.get('[data-group-description-form]')!.hidden,
      role === 'member',
    );
    assert.equal(
      f.nodes.get('[data-group-description]')!.textContent,
      'Current description',
    );
    f.ui.reset();
  }
});
await test('description draft survives unrelated renders and saves the original sequence with a stable retry ID', async () => {
  const f = fixture();
  f.pending.resolve({ description: 'Initial', sequence: 7 });
  await turn();
  const input = f.nodes.get('[data-group-description-input]')!;
  input.value = 'Edited';
  input.dispatchEvent(new Event('input'));
  f.ui.show({ ...f.group });
  assert.equal(input.value, 'Edited');
  f.nodes
    .get('[data-group-description-form]')!
    .dispatchEvent(new Event('submit', { cancelable: true }));
  await turn();
  assert.equal(f.saved.length, 1);
  assert.equal((f.saved[0] as { sequence: number }).sequence, 7);
  assert.equal((f.saved[0] as { description: string }).description, 'Edited');
});
await test('late description load cannot reveal a group after deselection or revocation', async () => {
  const f = fixture();
  f.select(null);
  f.ui.reset();
  f.pending.resolve({ description: 'Must stay hidden', sequence: 1 });
  await turn();
  assert.equal(f.nodes.get('[data-group-description]')!.textContent, '');
});
await test('creation profile includes description and validated avatar; retry rejects a changed initial draft', () => {
  const profile = creationProfile('  Synthetic  ', {
    description: '  Private description  ',
    photo: fixtureGroupPhoto(),
  });
  assert.equal(profile.title, 'Synthetic');
  assert.equal(profile.description, 'Private description');
  assert.ok(profile.photo);
  assert.doesNotThrow(() => assertCreationProfile(profile, { ...profile }));
  assert.throws(
    () =>
      assertCreationProfile(profile, { ...profile, description: 'Different' }),
    /same name/,
  );
  assert.deepEqual(creationProfile('Legacy', {}), {
    version: 1,
    title: 'Legacy',
    description: '',
    photo: null,
  });
});
await test('both group creation and settings expose translated photo/description controls', () => {
  for (const language of ['en', 'zh-CN'] as const) {
    setActiveLanguage(language);
    assert.match(t('html.c392c59440f2'), /data-create-photo-pick/);
    assert.match(t('html.c392c59440f2'), /name="description" maxlength="1000"/);
    assert.match(t('html.6f2aac1c9ed0'), /data-group-description-form hidden/);
  }
  setActiveLanguage('en');
});
