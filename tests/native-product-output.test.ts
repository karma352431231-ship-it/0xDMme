import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nativeProductOutput } from './fixtures/native-product-output.ts';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const token = 'a'.repeat(64);

await test('native action handoff admits canonical synthetic identifiers and routes only', () => {
  for (const [action, value] of [
    ['message-send', id],
    ['message-read-receipt', id],
    ['attachment-receive', id],
    ['attachment-recover-own', id],
    ['attachment-pick-send', id],
    ['contact-discovery-prepare', 'contacts'],
    ['group-send', id],
    ['community-create', `#comunidades?id=${id}`],
    ['community-post', `#comunidades?id=${id}&post=${id}`],
    ['invite-create', `https://0xdmme.app/#contatos?convite=${id}.${token}`],
  ]) {
    assert.ok(action && value);
    assert.equal(nativeProductOutput(action, value), value);
  }
});

await test('native action handoff rejects content, malformed identities and other origins', () => {
  for (const [action, value] of [
    ['message-send', 'synthetic decrypted message'],
    ['message-read-receipt', 'synthetic decrypted message'],
    ['attachment-pick-send', 'synthetic decrypted message'],
    ['contact-discovery-prepare', '{"mode":"contacts","private":"content"}'],
    ['message-send', 'a'.repeat(36)],
    ['message-send', id + '\n'],
    ['community-create', `https://0xdmme.app/#comunidades?id=${id}`],
    ['community-post', `#comunidades?id=${id}&text=private`],
    ['invite-create', `https://other.invalid/#contatos?convite=${id}.${token}`],
    ['invite-create', `https://0xdmme.app/#contatos?convite=${id}.${token}\n`],
    ['invite-create', 'a'.repeat(1025)],
  ]) {
    assert.ok(action && value);
    assert.throws(() => nativeProductOutput(action, value));
  }
  assert.equal(
    nativeProductOutput('profile-check', 'Synthetic private name'),
    '',
  );
  assert.equal(
    nativeProductOutput('message-receipt', 'Private visible text'),
    '',
  );
  assert.equal(nativeProductOutput('unknown-action', token), '');
});

await test('native setting handoff keeps only the observed boolean and rejects arbitrary objects', () => {
  assert.equal(
    nativeProductOutput(
      'conversation-pin',
      JSON.stringify({ peer: 'Synthetic iPhone Peer', initiallyPinned: false }),
    ),
    'false',
  );
  assert.equal(
    nativeProductOutput(
      'conversation-pin',
      JSON.stringify({ peer: 'Synthetic iPhone Peer', initiallyPinned: true }),
    ),
    'true',
  );
  for (const value of [
    'false',
    '{}',
    JSON.stringify({ peer: 'Synthetic iPhone Peer', initiallyPinned: 'false' }),
    JSON.stringify({ peer: 'Other profile', initiallyPinned: false }),
    JSON.stringify({
      peer: 'Synthetic iPhone Peer',
      initiallyPinned: false,
      content: 'not admitted',
    }),
  ])
    assert.throws(() => nativeProductOutput('conversation-pin', value));
});

await test('native voice handoff admits only its accepted identity and bounded nonzero duration', () => {
  const value = JSON.stringify({ id, duration: 1.8 });
  assert.equal(nativeProductOutput('social-voice-send', value), value);
  for (const raw of [
    { id, duration: 0 },
    { id, duration: 91 },
    { id, duration: '2' },
    { id: id + '\n', duration: 2 },
    { id, duration: 2, content: 'not admitted' },
    { id: 'other', duration: 2 },
  ])
    assert.throws(() =>
      nativeProductOutput('social-voice-send', JSON.stringify(raw)),
    );
  assert.equal(nativeProductOutput('social-voice-receive', id), id);
  assert.throws(() => nativeProductOutput('social-voice-receive', 'content'));
});
