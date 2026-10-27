import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AccountSession } from '../src/shared/account/index.ts';
import type { VaultChange, VaultCommit } from '../src/shared/vault/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';

// The controller listens on window; a plain EventTarget is enough here.
const page = new EventTarget();
Object.assign(globalThis, {
  window: page,
  document: { querySelector: () => null },
});
const { accountSettings, presetPack, sameSettings, withChange } =
  await import('../src/client/account-settings/record.ts');
const { SettingsRecord } =
  await import('../src/client/account-settings/vault-record.ts');
const { AccountSettingsController } =
  await import('../src/client/account-settings/index.ts');
const { SettingsCompletion } =
  await import('../src/client/account-settings/completion.ts');
const { LanguageRecord, languageRecordLabel } =
  await import('../src/client/language-record/index.ts');
const { announcePreference } =
  await import('../src/client/preference-events/index.ts');
type AccountSettings = ReturnType<typeof accountSettings>;

const base: AccountSettings = {
  version: 1,
  theme: 'navy',
  sound: true,
  externalMedia: false,
  push: { enabled: false, messages: true, calls: true, showCalls: false },
};
function session(accountId = crypto.randomUUID()): AccountSession {
  return {
    accountId,
    deviceId: crypto.randomUUID(),
    csrf: 'a'.repeat(64),
    name: 'Private',
    address: `0x${'1'.repeat(40)}`,
    ecosystem: 'evm',
    deviceState: 'pending',
    historyAuthorized: false,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    profileRevision: 1,
    walletConfirmed: true,
  };
}

/** Versioned entries with parents, as the vault keeps them. */
class FakeSync {
  complete = true;
  refreshes = 0;
  entries = new Map<string, VaultEntry & { value: string }>();
  sequence = 0;
  refresh(): Promise<void> {
    this.refreshes++;
    this.complete = true;
    return Promise.resolve();
  }
  heads(entity: string): VaultEntry[] {
    const versions = [...this.entries.values()].filter(
      (entry) => entry.change.entity === entity,
    );
    const superseded = new Set(versions.flatMap((e) => e.change.parents));
    return versions.filter((entry) => !superseded.has(entry.commit.id));
  }
  isRemoved(): boolean {
    return false;
  }
  open(id: string): Promise<string> {
    return Promise.resolve(this.entries.get(id)!.value);
  }
  save(input: { change: VaultChange; value: string }): Promise<void> {
    const id = crypto.randomUUID();
    this.entries.set(id, {
      commit: { id, sequence: ++this.sequence } as VaultCommit,
      change: input.change,
      value: input.value,
    });
    return Promise.resolve();
  }
}

await test('account record accepts only the known format', () => {
  assert.throws(() => accountSettings({ ...base, language: 'zh-CN' }));
  assert.deepEqual(accountSettings(base), base);
  for (const invalid of [
    { ...base, version: 2 },
    { ...base, theme: 'pink' },
    { ...base, sound: 'true' },
    { ...base, extra: true },
    { ...base, push: { ...base.push, enabled: 1 } },
    { ...base, push: { enabled: true } },
  ])
    assert.throws(() => accountSettings(invalid));
});

await test('ready profile changes privacy and notifications while preserving theme, sound and backup reminder', () => {
  const current = {
    settings: { ...base, theme: 'white' as const, sound: false },
    privacy: {
      online: false,
      lastSeen: false,
      readReceipts: false,
      backupReminder: true,
    },
    discovery: 'invite' as const,
  };
  const social = presetPack('social', current);
  assert.equal(social.settings.theme, 'white');
  assert.equal(social.settings.sound, false);
  assert.equal(social.privacy.backupReminder, true);
  assert.equal(social.privacy.online, true);
  assert.equal(social.settings.push.enabled, true);
  assert.equal(social.discovery, 'wallet');
  const reserved = presetPack('reserved', social);
  assert.deepEqual(reserved.privacy, {
    online: false,
    lastSeen: false,
    readReceipts: false,
    backupReminder: true,
  });
  assert.equal(reserved.settings.externalMedia, false);
  assert.equal(reserved.settings.push.enabled, false);
  assert.equal(reserved.discovery, 'invite');
});

await test('changes in Settings enter the account copy', () => {
  const changed = withChange(base, { theme: 'black', pushEnabled: true });
  assert.equal(changed.theme, 'black');
  assert.equal(changed.push.enabled, true);
  assert.equal(changed.push.showCalls, false);
  assert.equal(withChange(base, { theme: 'pink' }).theme, 'navy');
  assert.equal(
    withChange(base, {
      push: { messages: false, calls: true, showCalls: true },
    }).push.messages,
    false,
  );
  assert.equal(sameSettings(base, withChange(base, { sound: true })), true);
});

await test('vault stores one record per account and saving replaces concurrent versions', async () => {
  const sync = new FakeSync();
  const record = new SettingsRecord(sync);
  const account = crypto.randomUUID();
  assert.equal(await record.load(account), null);
  await record.save(account, base);
  // A second device saved without seeing the first: two current versions.
  const [first] = [...sync.entries.values()];
  await sync.save({
    change: { ...first!.change, parents: [] },
    value: JSON.stringify({ ...base, theme: 'black' }),
  });
  assert.equal(sync.heads(first!.change.entity).length, 2);
  assert.equal((await record.load(account))?.theme, 'black');
  await record.save(account, { ...base, theme: 'white' });
  assert.equal(sync.heads(first!.change.entity).length, 1);
  assert.equal((await record.load(account))?.theme, 'white');
  // Another account never reads this record.
  assert.equal(await record.load(crypto.randomUUID()), null);
});

await test('complete local checkpoint cannot hide settings already saved on the server', async () => {
  const account = crypto.randomUUID();
  const remote = new FakeSync();
  await new SettingsRecord(remote).save(account, { ...base, theme: 'white' });
  // VaultSync can finish its local checkpoint before its remote read returns.
  // A new browser/device must consult the account before offering the wizard.
  const local = new FakeSync();
  local.refresh = () => {
    local.refreshes++;
    local.entries = new Map(remote.entries);
    local.sequence = remote.sequence;
    return Promise.resolve();
  };
  assert.equal(local.complete, true);
  assert.deepEqual(await new SettingsRecord(local).load(account), {
    ...base,
    theme: 'white',
  });
  assert.equal(local.refreshes, 1);
});

await test('query failure with a complete vault checkpoint does not imply missing settings', async () => {
  const sync = new FakeSync();
  sync.refresh = () =>
    Promise.reject(new Error('Synchronization unavailable.'));
  await assert.rejects(
    new SettingsRecord(sync).load(crypto.randomUUID()),
    /Synchronization unavailable/u,
  );
});

await test('invalid content offers setup again; an incomplete vault cannot decide', async () => {
  const sync = new FakeSync();
  const record = new SettingsRecord(sync);
  const account = crypto.randomUUID();
  await record.save(account, base);
  const [entry] = [...sync.entries.values()];
  entry!.value = '{"version":1}';
  assert.equal(await record.load(account), null);
  sync.complete = false;
  const before = sync.refreshes;
  sync.refresh = () => {
    sync.refreshes++;
    return Promise.resolve();
  };
  await assert.rejects(record.load(account), /still loading/u);
  assert.equal(sync.refreshes - before, 6);
});

function ports(sync: FakeSync) {
  const calls: string[] = [];
  const done = (label: string) => () => {
    calls.push(label);
    return Promise.resolve();
  };
  let theme: AccountSettings['theme'] = 'navy';
  let sound = true;
  let media: boolean | null = null;
  return {
    calls,
    value: {
      sync,
      theme: {
        current: () => theme,
        set: (next: AccountSettings['theme']) => {
          calls.push(`theme:${next}`);
          theme = next;
        },
      },
      sound: {
        current: () => sound,
        set: (next: boolean) => {
          sound = next;
          return done(`sound:${next}`)();
        },
      },
      externalMedia: {
        current: () => media,
        set: (next: boolean) => {
          calls.push(`media:${next}`);
          media = next;
        },
      },
      push: {
        setSession: () => {},
        enablePush: done('push:enable'),
        disablePush: done('push:disable'),
        configurePush: done('push:configure'),
        pushPreferences: () =>
          Promise.resolve({ messages: true, calls: true, showCalls: false }),
        pushSubscribed: () => Promise.resolve(false),
      },
      privacy: {
        current: () => ({
          online: false,
          lastSeen: false,
          readReceipts: false,
          backupReminder: false,
        }),
        save: done('privacy'),
      },
      discovery: {
        current: () => Promise.resolve('invite' as const),
        set: done('discovery'),
      },
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt++) {
    if (predicate()) return;
    await settle();
  }
  assert.ok(predicate(), 'The account settings did not finish loading.');
}

await test('language follows the account and an explicit change waits for the vault write', async () => {
  const sync = new FakeSync();
  const account = session();
  await new SettingsRecord(sync).save(account.accountId, base);
  const languageRecord = new LanguageRecord(sync);
  await languageRecord.save(account.accountId, 'zh-CN', () => {});
  const fake = ports(sync);
  const applied: string[] = [];
  const controller = new AccountSettingsController({
    ...fake.value,
    language: {
      set: (value) => {
        applied.push(value);
        return Promise.resolve();
      },
    },
  });
  controller.setSession(account);
  controller.ready();
  await waitFor(() => applied.length === 1 && fake.calls.length === 2);
  assert.deepEqual(applied, ['zh-CN']);
  assert.equal(sync.entries.size, 2);
  await controller.saveLanguage('en');
  assert.equal(await languageRecord.load(account.accountId), 'en');
  assert.deepEqual(
    await new SettingsRecord(sync).load(account.accountId),
    base,
  );
  announcePreference({ sound: false });
  await settle();
  assert.equal(await languageRecord.load(account.accountId), 'en');
  controller.setSession(null);
  await assert.rejects(controller.saveLanguage('zh-CN'), /Open your account/u);
});

await test('changing account while adopting its language cannot apply the old settings', async () => {
  const sync = new FakeSync();
  const account = session();
  await new SettingsRecord(sync).save(account.accountId, base);
  await new LanguageRecord(sync).save(account.accountId, 'zh-CN', () => {});
  const fake = ports(sync);
  let entered = false;
  let finish: () => void = () => {};
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const controller = new AccountSettingsController({
    ...fake.value,
    language: {
      set: () => {
        entered = true;
        return pending;
      },
    },
  });
  controller.setSession(account);
  controller.ready();
  await waitFor(() => entered);
  controller.setSession(session());
  finish();
  await settle();
  assert.deepEqual(fake.calls, []);
  controller.setSession(null);
});

await test('failed language writes do not report success or discard the account preference', async () => {
  const sync = new FakeSync();
  const account = session();
  await new SettingsRecord(sync).save(account.accountId, base);
  const languageRecord = new LanguageRecord(sync);
  await languageRecord.save(account.accountId, 'en', () => {});
  const fake = ports(sync);
  const controller = new AccountSettingsController(fake.value);
  controller.setSession(account);
  controller.ready();
  await waitFor(() => fake.calls.length === 2);
  const save = sync.save.bind(sync);
  sync.save = () => Promise.reject(new Error('storage failure'));
  await assert.rejects(controller.saveLanguage('zh-CN'), /storage failure/u);
  sync.save = save;
  assert.equal(await languageRecord.load(account.accountId), 'en');
  await controller.saveLanguage('zh-CN');
  assert.equal(await languageRecord.load(account.accountId), 'zh-CN');
  controller.setSession(null);
});

await test('a language-only choice preserves missing initial setup and rejects invalid records', async () => {
  const sync = new FakeSync();
  const account = crypto.randomUUID();
  const record = new LanguageRecord(sync);
  assert.equal(await record.load(account), null);
  await record.save(account, 'zh-CN', () => {});
  assert.equal(await record.load(account), 'zh-CN');
  assert.equal(await new SettingsRecord(sync).load(account), null);
  const entry = [...sync.entries.values()].find(
    (value) => value.change.label === languageRecordLabel,
  )!;
  entry.value = JSON.stringify({ version: 1, language: 'pt-BR' });
  await assert.rejects(record.load(account), /Invalid language preference/u);
  sync.complete = false;
  await assert.rejects(record.load(account), /still syncing/u);
});

await test('changing account during a language write prevents a stale successful result', async () => {
  const sync = new FakeSync();
  const account = session();
  await new SettingsRecord(sync).save(account.accountId, base);
  const controller = new AccountSettingsController(ports(sync).value);
  controller.setSession(account);
  controller.ready();
  await settle();
  const save = sync.save.bind(sync);
  sync.save = async (input) => {
    await save(input);
    controller.setSession(null);
  };
  await assert.rejects(
    controller.saveLanguage('zh-CN'),
    /The account changed/u,
  );
});

await test('another device applies the account copy and writes only when something changes', async () => {
  const sync = new FakeSync();
  const account = session();
  await new SettingsRecord(sync).save(account.accountId, {
    ...base,
    theme: 'black',
    sound: false,
    externalMedia: true,
  });
  const fake = ports(sync);
  const controller = new AccountSettingsController(fake.value);
  controller.setSession(account);
  controller.ready();
  await waitFor(() => fake.calls.length === 3);
  assert.deepEqual(fake.calls, ['theme:black', 'media:true', 'sound:false']);
  assert.equal(sync.entries.size, 1);
  // Echoes of the applied values do not write; a real change does.
  announcePreference({ theme: 'black', sound: false });
  await settle();
  assert.equal(sync.entries.size, 1);
  announcePreference({ theme: 'white' });
  await waitFor(() => sync.entries.size === 2);
  assert.equal(sync.entries.size, 2);
  assert.equal(
    (await new SettingsRecord(sync).load(account.accountId))?.theme,
    'white',
  );
  // Ready again for the same account does not reload or reapply.
  controller.ready();
  await settle();
  assert.equal(fake.calls.length, 3);
});

await test('account change discards the previous copy and changes without a session are not saved', async () => {
  const sync = new FakeSync();
  const first = session();
  await new SettingsRecord(sync).save(first.accountId, base);
  const fake = ports(sync);
  const controller = new AccountSettingsController(fake.value);
  controller.setSession(first);
  controller.ready();
  await settle();
  controller.setSession(null);
  announcePreference({ theme: 'white' });
  await settle();
  assert.equal(sync.entries.size, 1);
  assert.equal(
    (await new SettingsRecord(sync).load(first.accountId))?.theme,
    'navy',
  );
});

await test('resetting the remote settings record does not reopen completed setup or rewrite preferences', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const completion = new SettingsCompletion(storage);
  const sync = new FakeSync();
  const account = session();
  await new SettingsRecord(sync).save(account.accountId, base);
  const first = new AccountSettingsController(ports(sync).value, completion);
  first.setSession(account);
  first.ready();
  await waitFor(() => completion.has(account.accountId));
  first.setSession(null);
  sync.entries.clear();
  const device = ports(sync);
  const next = new AccountSettingsController(
    device.value,
    new SettingsCompletion(storage),
  );
  next.setSession(account);
  const before = sync.refreshes;
  next.ready();
  await waitFor(() => sync.refreshes > before);
  await settle();
  assert.equal(
    sync.entries.size,
    0,
    'Loading after reset must not republish removed settings.',
  );
  assert.deepEqual(
    device.calls,
    [],
    'Existing device choices must stay unchanged.',
  );
  announcePreference({ sound: false });
  await waitFor(() => sync.entries.size === 1);
  assert.equal(
    (await new SettingsRecord(sync).load(account.accountId))?.sound,
    false,
  );
  next.setSession(null);
});
