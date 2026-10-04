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
await test('reação admite um emoji composto e variantes; rejeita texto, múltiplos emojis e controles; última reação substitui a anterior', () => {
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
      /Reação inválida/,
    );
  }
  assert.equal(validReaction(''), true);
});
await test('checks só mostram azul com leitura compartilhada, cinza com ACK destinatário e nenhum estado remoto na cópia offline', () => {
  assert.deepEqual(
    messageChecks({ own: true, delivery: 'accepted', read: false }),
    {
      text: '✓',
      color: 'gray',
      label:
        'Aceita pelo servidor; recebimento do destinatário ainda não confirmado',
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
    'blue',
  );
  assert.equal(messageChecks({ own: true, read: true }), null);
  assert.equal(
    messageChecks({ own: false, delivery: 'received', read: true }),
    null,
  );
});
await test('som inicia ligado; só escolha explícita persiste desligamento; bloqueio do navegador não altera preferência', async () => {
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
      if (sound.notice.includes('bloqueada')) resolve();
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
await test('falha de armazenamento informa que o desligamento de som só vale nesta abertura', async () => {
  const sound = new NotificationSound({
    getItem: () => null,
    setItem: () => {
      throw new Error('Storage bloqueado');
    },
  });
  await assert.rejects(sound.setEnabled(false), /só nesta abertura/);
  assert.equal(sound.enabled, false);
  assert.match(sound.notice, /não permitiu salvá-la/);
});
await test('ações cifradas preservam texto legado, resposta e encaminhamento; edição e reação respeitam autoria e versão', () => {
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
    /outro autor/,
  );
  assert.throws(
    () =>
      dailyViews([
        original,
        { ...edit, relation: { ...relation, hash: 'b'.repeat(64) } },
      ]),
    /divergente/,
  );
  assertRemovalIdentity(original, original);
  assert.throws(
    () => assertRemovalIdentity({ ...original, relation }, original),
    /já autenticada/,
  );
  assert.throws(
    () => assertRemovalIdentity({ ...edit, hash: 'b'.repeat(64) }, edit),
    /já autenticada/,
  );
});
await test('push só admite origens fixas, chaves limitadas e destinos públicos; payload é genérico e cifrado pela biblioteca', () => {
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
await test('backup conserva o vínculo de ações sem ativar permissões; busca normaliza apenas localmente', () => {
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
await test('organização conserva silêncio concorrente e uma nova escolha resolve os ramos sem abrir outra conversa', async () => {
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
function archiveFixture() {
  const entry = settingsEntry(original.peer, 1);
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
      currentHeads: () => new Map([[original.peer, [entry]]]),
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
    if (state.failMute) return Promise.reject(new Error('Mute indisponível.'));
    assert.equal(typeof payload['mutedUntil'], 'number');
    state.mutedUntil = Number(payload['mutedUntil']);
    return Promise.resolve();
  };
  return { daily, state };
}
await test('arquivar silencia sem prazo; retomar exige desarquivar; mute de 24 horas mantém o prazo solicitado', async () => {
  const { daily, state } = archiveFixture();
  await daily.organize(original.peer, { archived: true });
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  assert.equal(daily.conversation(original.peer).archived, true);
  await assert.rejects(daily.mute(original.peer, 0), /Desarquive/);
  await assert.rejects(daily.mute(original.peer, 86400000), /Desarquive/);
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
await test('falha de mute impede arquivamento; falha de salvar não religa alertas nem simula arquivamento', async () => {
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
    /Alertas silenciados.*não foi salvo/,
  );
  assert.equal(state.writes, 0);
  assert.equal(state.mutedUntil, Number.MAX_SAFE_INTEGER);
  assert.equal(daily.conversation(original.peer).archived, false);
});
