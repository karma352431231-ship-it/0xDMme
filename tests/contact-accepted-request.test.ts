import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AcceptedRequest } from '../src/client/contacts/accepted-request.ts';
import type { Peer } from '../src/shared/contacts/index.ts';

const peer = (accountId: string) => ({ accountId }) as Peer;

await test('a sent request is offered as a chat once its account becomes approved', () => {
  const requests = new AcceptedRequest();
  requests.wait('b');
  assert.equal(requests.settle([peer('a')]), null);
  assert.equal(requests.offered?.accountId, undefined);
  assert.equal(requests.settle([peer('a'), peer('b')])?.accountId, 'b');
  assert.equal(requests.offered?.accountId, 'b');
  // Settling happens once; a later list does not re-announce it.
  assert.equal(requests.settle([peer('b')]), null);
});

await test('approving here offers the chat at once; the next operation or session ends the offer', () => {
  const requests = new AcceptedRequest();
  requests.approved(peer('c'));
  assert.equal(requests.offered?.accountId, 'c');
  requests.dismiss();
  assert.equal(requests.offered?.accountId, undefined);
  requests.wait('d');
  requests.dismiss();
  assert.equal(requests.settle([peer('d')])?.accountId, 'd');
  requests.clear();
  assert.equal(requests.offered?.accountId, undefined);
  assert.equal(requests.settle([peer('d')]), null);
});
