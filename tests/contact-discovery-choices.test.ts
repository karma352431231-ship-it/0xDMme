import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DiscoveryChoices } from '../src/client/contacts/discovery-choices.ts';

await test('a discovery choice stays a draft until the server reports it', () => {
  const choices = new DiscoveryChoices();
  choices.value = 'wallet';
  assert.equal(choices.changed, false);
  choices.choose('invite');
  assert.equal(choices.value, 'invite');
  assert.equal(choices.changed, true, 'The save bar appears for a new choice');
  choices.value = 'wallet';
  assert.equal(
    choices.value,
    'invite',
    'A background refresh keeps the unapplied choice on screen',
  );
  assert.equal(choices.changed, true);
  choices.value = 'invite';
  assert.equal(choices.changed, false, 'Applying the choice clears the draft');
  choices.choose('wallet');
  choices.choose('invite');
  assert.equal(
    choices.changed,
    false,
    'Choosing the saved mode again is clean',
  );
});

await test('a legacy restrictive mode selects neither option until changed', () => {
  const choices = new DiscoveryChoices();
  choices.value = 'contacts';
  assert.equal(choices.value, 'contacts');
  assert.equal(choices.changed, false);
  choices.choose('wallet');
  assert.equal(choices.changed, true);
});
