import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createECDH, randomBytes } from 'node:crypto';
import webpush from 'web-push';
import {
  decodeDailyText,
  encodeDailyText,
  privateDefaults,
  pushRegistration,
  genericNotification,
  validReaction,
} from '../src/shared/daily/index.ts';
import { dailyViews } from '../src/client/daily-text/index.ts';
import {
  publicPushAddress,
  readPushConfiguration,
} from '../src/server/notifications/index.ts';
import { backupRecord } from '../src/client/backup-records/index.ts';
import { searchTerm } from '../src/client/message-search/index.ts';
import { assertRemovalIdentity } from '../src/client/messages/history.ts';
import { Daily } from '../src/client/daily/index.ts';
import { messageChecks } from '../src/client/message-status/index.ts';
import {
  NotificationSound,
  soundPreferenceKey,
} from '../src/client/notification-sound/index.ts';
import type { VaultEntry } from '../src/client/vault-sync/index.ts';
const original = {
  id: crypto.randomUUID(),
  hash: 'a'.repeat(64),
  text: 'Original',
  own: true,
  kind: 'text',
  peer: crypto.randomUUID(),
  author: crypto.randomUUID(),
  sequence: 1,
};
const relation = {
  id: original.id,
  hash: original.hash,
  author: original.author,
  type: 'edit' as const,
};
await test('profile cards update identity without creating messages in a new conversation', () => {
  const card = {
    ...original,
    id: crypto.randomUUID(),
    kind: 'profile',
    text: JSON.stringify({ name: 'Teste 1', revision: 1, photo: null }),
  };
  assert.deepEqual(dailyViews([card]), []);
  assert.deepEqual(
    dailyViews([card, original]).map((row) => row.id),
    [original.id],
  );
  assert.equal(card.text.includes('Teste 1'), true);
});
await test('reactions accept compound emoji and variants, reject text, multiple emoji and controls, and replace the previous reaction', () => {
  const variants = [
    '🦋',
    '👍🏽',
    '👩‍💻',
    '👨‍👩‍👧‍👦',
    '🧑🏿‍🤝‍🧑🏻',
    '👩🏽‍❤️‍💋‍👩🏻',
    '🇧🇷',
    '1️⃣',
    '#️⃣',
    '🏳️‍🌈',
    '🏴\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}',
    '❤️',
    '❤',
  ];
  for (const text of variants) {
    assert.equal(validReaction(text), true, text);
    const action = {
      ...original,
      id: crypto.randomUUID(),
      sequence: 2,
      text,
      relation: { ...relation, type: 'reaction' as const },
    };
    const changed = {
      ...action,
      id: crypto.randomUUID(),
      sequence: 3,
      text: '🦋',
    };
    assert.deepEqual(dailyViews([original, action])[0]?.reactions, [text]);
    assert.deepEqual(dailyViews([original, action, changed])[0]?.reactions, [
      '🦋',
    ]);
  }
  for (const text of [
    'sim',
    '👍👍',
    '🇧',
    '🏽',
    '1',
    '#',
    '👍\n',
    '👍\u0000',
    'a‍👍',
    '👍'.repeat(100),
  ]) {
    assert.equal(validReaction(text), false, JSON.stringify(text));
    assert.throws(
      () =>
        dailyViews([
          original,
          {
            ...original,
            id: crypto.randomUUID(),
            text,
            relation: { ...relation, type: 'reaction' as const },
          },
        ]),
      /Invalid reaction/,
    );
  }
  assert.equal(validReaction(''), true);
});
await test('checkmarks are green only with shared reads, gray with recipient ACK and have no remote state in offline copies', () => {
  assert.deepEqual(
    messageChecks({ own: true, delivery: 'accepted', read: false }),
    {
      text: '✓',
      color: 'gray',
      label: 'Accepted by the server; recipient receipt is not yet confirmed',
    },
  );
  assert.equal(
    messageChecks({ own: true, delivery: 'received', read: false })?.color,
    'gray',
  );
  assert.equal(
    messageChecks({ own: true, delivery: 'received', read: false })?.text,
    '✓✓',
  );
  assert.equal(
    messageChecks({ own: true, delivery: 'received', read: true })?.color,
    'green',
  );
  assert.equal(messageChecks({ own: true, read: true }), null);
  assert.equal(
    messageChecks({ own: false, delivery: 'received', read: true }),
    null,
  );
});
await test('sound starts enabled; only an explicit choice persists disabling it; browser blocking preserves preference', async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let audioState: AudioContextState = 'suspended';
  const audio = {
    get state() {
      return audioState;
    },
    resume: () => Promise.reject(new Error('Autoplay bloqueado')),
    close: () => {
      audioState = 'closed';
      return Promise.resolve();
    },
    currentTime: 0,
    get destination(): AudioDestinationNode {
      throw new Error('Som bloqueado não conecta saída.');
    },
    createOscillator: (): OscillatorNode => {
      throw new Error('Som bloqueado não toca.');
    },
    createGain: (): GainNode => {
      throw new Error('Som bloqueado não toca.');
    },
  };
  const sound = new NotificationSound(storage, () => audio);
  assert.equal(sound.enabled, true);
  sound.prepare();
  const blocked = new Promise<void>((resolve) =>
    sound.observe(() => {
      if (sound.notice.includes('blocked')) resolve();
    }),
  );
  sound.unlock();
  await blocked;
  assert.equal(sound.enabled, true);
  assert.equal(values.has(soundPreferenceKey), false);
  await sound.setEnabled(false);
  assert.equal(new NotificationSound(storage).enabled, false);
  assert.equal(values.get(soundPreferenceKey), 'false');
  const reopened = new NotificationSound(storage);
  await reopened.setEnabled(true);
  assert.equal(new NotificationSound(storage).enabled, true);
  await reopened.dispose();
  assert.equal(values.get(soundPreferenceKey), 'true');
});
await test('private marimba rises and group marimba falls; calls keep their beep; consecutive alerts group within three seconds', () => {
  const strikes: { frequency: number; at: number }[] = [];
  let disconnected = 0;
  const node = () => ({
    connect: () => undefined,
    disconnect: () => {
      disconnected++;
    },
  });
  const param = () => ({
    setValueAtTime: () => undefined,
    exponentialRampToValueAtTime: () => undefined,
  });
  const audio = {
    state: 'running' as AudioContextState,
    resume: () => Promise.resolve(),
    close: () => Promise.resolve(),
    currentTime: 10,
    destination: {} as AudioDestinationNode,
    createOscillator: () => {
      const oscillator = {
        ...node(),
        frequency: { value: 0 },
        onended: null as (() => void) | null,
        start: (at: number) =>
          strikes.push({ frequency: oscillator.frequency.value, at }),
        stop: () => oscillator.onended?.(),
      };
      return oscillator as unknown as OscillatorNode;
    },
    createGain: () => ({ ...node(), gain: param() }) as unknown as GainNode,
  };
  const fundamentals = () =>
    strikes
      .filter((s) => s.frequency < 2000)
      .sort((a, b) => a.at - b.at)
      .map((s) => s.frequency);
  const realNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    const sound = new NotificationSound(
      { getItem: () => null, setItem: () => undefined },
      () => audio,
    );
    sound.prepare();
    sound.alert('direct');
    assert.deepEqual(fundamentals(), [880, 1319]);
    sound.alert('group');
    assert.equal(strikes.length, 4, 'segundo alerta em menos de 3 s não toca');
    now += 3000;
    strikes.length = 0;
    sound.alert('group');
    assert.deepEqual(fundamentals(), [1319, 880]);
    now += 3000;
    strikes.length = 0;
    sound.alert('call');
    assert.deepEqual(fundamentals(), [660]);
    assert.equal(disconnected, 2 * (4 + 4 + 1), 'nós soltos ao terminar');
  } finally {
    Date.now = realNow;
  }
});
await test('storage failure explains that sound is disabled only for this opening', async () => {
  const sound = new NotificationSound({
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage bloqueado');
    },
  });
  await assert.rejects(sound.setEnabled(false), /for this visit only/);
  assert.equal(sound.enabled, false);
  assert.match(sound.notice, /did not allow saving/);
});
await test('encrypted actions preserve legacy text, replies and forwards; edits and reactions enforce authorship and version', () => {
  assert.deepEqual(decodeDailyText('Legado'), {
    text: 'Legado',
    reply: null,
    forwarded: false,
  });
  const content = {
    text: '<script>conteúdo tratado como texto</script>',
    reply: original.id,
    forwarded: true,
  };
  assert.deepEqual(decodeDailyText(encodeDailyText(content)), content);
  const edit = {
    ...original,
    id: crypto.randomUUID(),
    sequence: 2,
    text: encodeDailyText(content),
    relation,
  };
  const react = {
    ...original,
    id: crypto.randomUUID(),
    sequence: 3,
    text: encodeDailyText({ text: '👍', reply: null, forwarded: false }),
    relation: { ...relation, type: 'reaction' as const },
  };
  const remove = {
    ...react,
    id: crypto.randomUUID(),
    sequence: 4,
    text: encodeDailyText({ text: '', reply: null, forwarded: false }),
  };
  const [view] = dailyViews([react, edit, original]);
  assert.equal(view?.content.text, content.text);
  assert.equal(view?.edited, true);
  assert.deepEqual(view?.reactions, ['👍']);
  assert.deepEqual(dailyViews([original, react, remove])[0]?.reactions, []);
  assert.equal(
    dailyViews([original, { ...edit, state: 'Suspensa' }])[0]?.content.text,
    original.text,
  );
  assert.equal(dailyViews([edit, react]).length, 0);
  assert.throws(
    () => dailyViews([original, { ...edit, author: crypto.randomUUID() }]),
    /another author/,
  );
  assert.throws(
    () =>
      dailyViews([
        original,
        { ...edit, relation: { ...relation, hash: 'b'.repeat(64) } },
      ]),
    /differ|not match/,
  );
  assertRemovalIdentity(original, original);
  assert.throws(
    () => assertRemovalIdentity({ ...original, relation }, original),
    /already authenticated/,
  );
  assert.throws(
    () => assertRemovalIdentity({ ...edit, hash: 'b'.repeat(64) }, edit),
    /already authenticated/,
  );
});
await test('push accepts only fixed origins, bounded keys and public destinations; the library encrypts a generic payload', () => {
  const ecdh = createECDH('prime256v1');
  ecdh.generateKeys();
  const subscription = {
    endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic',
    keys: {
      p256dh: ecdh.getPublicKey().toString('base64url'),
      auth: randomBytes(16).toString('base64url'),
    },
  };
  assert.deepEqual(pushRegistration(subscription), subscription);
  for (const endpoint of [
    'http://fcm.googleapis.com/path',
    'https://127.0.0.1/path',
    'https://fcm.googleapis.com.evil.test/path',
    'https://user@web.push.apple.com/path',
    'https://fcm.googleapis.com:444/path',
    'bad-url',
  ])
    assert.throws(() => pushRegistration({ ...subscription, endpoint }));
  for (const ip of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
  ])
    assert.equal(publicPushAddress(ip), false);
  assert.equal(publicPushAddress('8.8.8.8'), true);
  assert.equal(publicPushAddress('2606:4700:4700::1111'), true);
  const keys = webpush.generateVAPIDKeys();
  const config = readPushConfiguration({
    HASH_TALK_PUSH_PUBLIC_KEY: keys.publicKey,
    HASH_TALK_PUSH_PRIVATE_KEY: keys.privateKey,
  });
  assert.ok(config);
  const request = webpush.generateRequestDetails(
    subscription,
    JSON.stringify(genericNotification),
    { vapidDetails: config, TTL: 60, contentEncoding: 'aes128gcm' },
  );
  assert.ok(Buffer.isBuffer(request.body));
  assert.equal(
    request.body.toString().includes(genericNotification.body),
    false,
  );
  assert.equal(request.headers['TTL'], 60);
  assert.equal(request.headers['Content-Encoding'], 'aes128gcm');
  assert.deepEqual(privateDefaults, {
    online: false,
    lastSeen: false,
    readReceipts: false,
  });
  assert.equal(readPushConfiguration({}), null);
  assert.throws(() =>
    readPushConfiguration({ HASH_TALK_PUSH_PUBLIC_KEY: keys.publicKey }),
  );
});
await test('backup preserves action bindings without enabling permissions; search normalizes only locally', () => {
  const row = {
    type: 'message',
    id: crypto.randomUUID(),
    hash: 'c'.repeat(64),
    peer: original.peer,
    own: true,
    kind: 'text',
    text: encodeDailyText({
      text: 'Edição histórica',
      reply: null,
      forwarded: false,
    }),
    relation,
  };
  assert.deepEqual(backupRecord(row), row);
  assert.equal(searchTerm('  ＢＯＴ  '), 'bot');
  assert.throws(() => searchTerm(''));
  assert.throws(() => searchTerm('a'.repeat(129)));
});
function settingsEntry(entity: string, sequence: number): VaultEntry {
  return {
    change: {
      version: 1,
      entity,
      kind: 'settings',
      parents: [],
      label: 'Preferências da conversa',
    },
    commit: {
      version: 1,
      id: crypto.randomUUID(),
      accountId: original.author,
      deviceId: crypto.randomUUID(),
      directory: 'a'.repeat(64),
      authorityRevision: 1,
      epoch: 1,
      sequence,
      previous: null,
      block: { hash: 'a'.repeat(64), bytes: 32 },
      manifest: { iv: '', ciphertext: '' },
      signature: '',
    },
  };
}
await test('organization preserves concurrent mute and a new choice resolves branches without opening another conversation', async () => {
  const first = settingsEntry(original.peer, 1),
    sibling = settingsEntry(original.peer, 2),
    other = settingsEntry(crypto.randomUUID(), 3),
    heads = new Map([
      [original.peer, [first, sibling]],
      [other.change.entity, [other]],
    ]);
  let saves = 0;
  const opened: string[] = [];
  const daily = new Daily(
    {
      withVault: () =>
        Promise.reject(new Error('API desnecessária neste teste.')),
      withLocalVault: () =>
        Promise.reject(new Error('API desnecessária neste teste.')),
    },
    {
      complete: true,
      currentHeads: () => heads,
      isRemoved: () => false,
      refresh: () => Promise.resolve(),
      open: (id) => {
        opened.push(id);
        return Promise.resolve(
          JSON.stringify({ mutedUntil: 0, archived: true, pinned: false }),
        );
      },
      save: () => {
        saves++;
        return Promise.resolve();
      },
    },
  );
  await daily.loadSettings([original.peer]);
  assert.equal(daily.organizationConflict(original.peer), true);
  assert.deepEqual(opened, [first.commit.id, sibling.commit.id]);
  await daily.organize(original.peer, { pinned: true });
  assert.equal(saves, 1);
  assert.deepEqual(daily.conversation(original.peer), {
    mutedUntil: 0,
    archived: true,
    pinned: true,
  });
  assert.ok(!opened.includes(other.commit.id));
  opened.length = 0;
  heads.set(original.peer, [first]);
  await daily.loadSettings([original.peer]);
  assert.equal(daily.organizationConflict(original.peer), false);
  assert.deepEqual(opened, [first.commit.id]);
  await daily.organize(original.peer, { pinned: true });
  assert.equal(saves, 2);
  assert.deepEqual(daily.conversation(original.peer), {
    mutedUntil: 0,
    archived: true,
    pinned: true,
  });
});
await test('encrypted favorites resolve their own branches, preserve legacy preferences and cannot return after session change', async () => {
  const id = original.peer,
    preference = settingsEntry(id, 1),
    first = settingsEntry(id, 2),
    sibling = settingsEntry(id, 3);
  first.change.label = sibling.change.label = 'Conversa favorita';
  const heads = new Map([[id, [preference, first, sibling]]]);
  const content = new Map([
    [
      preference.commit.id,
      JSON.stringify({ mutedUntil: 0, archived: true, pinned: false }),
    ],
    [first.commit.id, JSON.stringify({ favorite: true })],
    [sibling.commit.id, JSON.stringify({ favorite: false })],
  ]);
  let written: string[] = [],
    release: () => void = () => {
      throw new Error('Leitura não preparada.');
    };
  const daily = new Daily(
    {
      withVault: () =>
        Promise.reject(new Error('Favoritar não consulta permissões.')),
      withLocalVault: () =>
        Promise.reject(new Error('Favoritar não consulta permissões.')),
    },
    {
      complete: true,
      currentHeads: () => heads,
      isRemoved: () => false,
      refresh: () => Promise.resolve(),
      open: (id) => Promise.resolve(content.get(id)!),
      save: (input) => {
        written = input.change.parents;
        const entry = settingsEntry(id, 4);
        entry.change = input.change;
        content.set(entry.commit.id, input.value);
        heads.set(id, [preference, entry]);
        return Promise.resolve();
      },
    },
  );
  await daily.loadSettings([id]);
  assert.equal(daily.favorite(id), true);
  await daily.setFavorite(id, false);
  assert.deepEqual(written, [first.commit.id, sibling.commit.id]);
  await daily.loadSettings([id]);
  assert.equal(daily.favorite(id), false);
  assert.equal(daily.conversation(id).archived, true);
  const pendingEntry = settingsEntry(id, 5);
  pendingEntry.change.label = 'Conversa favorita';
  heads.set(id, [pendingEntry]);
  const pending = new Promise<string>((resolve) => {
    release = () => resolve(JSON.stringify({ favorite: true }));
  });
  // Replace only the read boundary; exercise the actual generation guard.
  const blocked = new Daily(
    {
      withVault: () => Promise.reject(new Error('Sem API')),
      withLocalVault: () => Promise.reject(new Error('Sem API')),
    },
    {
      complete: true,
      currentHeads: () => heads,
      isRemoved: () => false,
      refresh: () => Promise.resolve(),
      open: () => pending,
      save: () => Promise.resolve(),
    },
  );
  const loading = blocked.loadSettings([id]);
  blocked.setSession({
    accountId: crypto.randomUUID(),
    deviceId: crypto.randomUUID(),
    ecosystem: 'evm',
    address: '0x' + 'a'.repeat(40),
    name: '',
    csrf: 'c'.repeat(64),
    profileRevision: 0,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    walletConfirmed: true,
    deviceState: 'pending',
    historyAuthorized: false,
  });
  release();
  await assert.rejects(loading, /Session changed/);
  assert.equal(blocked.favorite(id), false);
  content.set(pendingEntry.commit.id, JSON.stringify({ favorite: 'sim' }));
  await assert.rejects(daily.loadSettings([id]), /Invalid favorite/);
});
function archiveFixture(settingsId = original.peer) {
  const entry = settingsEntry(settingsId, 1);
  const state = {
    saved: JSON.stringify({ mutedUntil: 0, archived: false, pinned: false }),
    mutedUntil: 0,
    writes: 0,
    failMute: false,
    failSave: false,
  };
  const daily = new Daily(
    {
      withVault: () =>
        Promise.reject(
          new Error('Transporte assinado substituído neste teste.'),
        ),
      withLocalVault: () =>
        Promise.reject(
          new Error('Transporte assinado substituído neste teste.'),
        ),
    },
    {
      complete: true,
      currentHeads: () => new Map([[settingsId, [entry]]]),
      isRemoved: () => false,
      refresh: () => Promise.resolve(),
      open: () => Promise.resolve(state.saved),
      save: (input) => {
        if (state.failSave)
          return Promise.reject(new Error('Cofre indisponível.'));
        state.saved = input.value;
        state.writes++;
        return Promise.resolve();
      },
    },
  );
  daily.api = (operation, payload = {}) => {
    if (operation === 'daily-state')
      return Promise.resolve({
        revision: 1,
        mutedUntil: state.mutedUntil,
        unread: 0,
        online: false,
        lastSeen: null,
      });
    assert.equal(operation, 'daily-mute');
    assert.equal(payload['peer'], original.peer);
    if (state.failMute) return Promise.reject(new Error('Mute indisponível.'));
    assert.equal(typeof payload['mutedUntil'], 'number');
    state.mutedUntil = Number(payload['mutedUntil']);
    return Promise.resolve();
  };
  return { daily, state };
}
await test('archiving mutes indefinitely; resuming requires unarchiving; 24-hour mute preserves the requested deadline', async () => {
  const { daily, state } = archiveFixture();
  await daily.organize(original.peer, { archived: true });
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  assert.equal(daily.conversation(original.peer).archived, true);
  await assert.rejects(daily.mute(original.peer, 0), /Unarchive/);
  await assert.rejects(daily.mute(original.peer, 86400000), /Unarchive/);
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  await daily.organize(original.peer, { archived: false });
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  const before = Date.now();
  await daily.mute(original.peer, 86400000);
  assert.ok(state.mutedUntil >= before + 86400000);
  assert.ok(state.mutedUntil <= Date.now() + 86400000);
  await daily.mute(original.peer, 0);
  assert.equal(state.mutedUntil, 0);
});
await test('archived wallet becomes muted on approval and cannot resume alerts until unarchived', async () => {
  const settingsId = crypto.randomUUID(),
    { daily, state } = archiveFixture(settingsId);
  await daily.organize(settingsId, { archived: true }, { mutePeer: null });
  assert.equal(state.mutedUntil, 0);
  const approved = await daily.keepArchivedSilent(
    original.peer,
    settingsId,
    await daily.state(original.peer),
  );
  assert.equal(approved.mutedUntil, Number.MAX_SAFE_INTEGER);
  await assert.rejects(
    daily.mute(original.peer, 0, { settingsId }),
    /Unarchive/,
  );
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  await daily.organize(
    settingsId,
    { archived: false },
    { mutePeer: original.peer },
  );
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  await daily.mute(original.peer, 0, { settingsId });
  assert.equal(state.mutedUntil, 0);
});
await test('mute failure prevents archiving; save failure neither enables alerts nor simulates archiving', async () => {
  const { daily, state } = archiveFixture();
  state.failMute = true;
  await assert.rejects(
    daily.organize(original.peer, { archived: true }),
    /Mute indisponível/,
  );
  assert.equal(state.writes, 0);
  assert.equal(daily.conversation(original.peer).archived, false);
  state.failMute = false;
  state.failSave = true;
  await assert.rejects(
    daily.organize(original.peer, { archived: true }),
    /Alerts were muted.*not saved/,
  );
  assert.equal(state.writes, 0);
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  assert.equal(daily.conversation(original.peer).archived, false);
});

await test('own reaction ownership survives identical emojis from both authors and removing only one', () => {
  const mine = {
    ...original,
    id: crypto.randomUUID(),
    sequence: 2,
    text: '😂',
    relation: { ...relation, type: 'reaction' as const },
  };
  const theirs = {
    ...mine,
    id: crypto.randomUUID(),
    own: false,
    author: original.peer,
    sequence: 3,
  };
  const view = dailyViews([original, mine, theirs])[0]!;
  assert.equal(view.ownReaction, '😂');
  assert.deepEqual(view.reactions, ['😂', '😂']);
  const removed = { ...mine, id: crypto.randomUUID(), sequence: 4, text: '' };
  const after = dailyViews([original, mine, theirs, removed])[0]!;
  assert.equal(after.ownReaction, '');
  assert.deepEqual(after.reactions, ['😂']);
});
