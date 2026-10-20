import assert from 'node:assert/strict';
import { test } from 'node:test';
import type pg from 'pg';
import type {
  ContactAuthority,
  ContactStore,
} from '../src/server/database/contacts.ts';
import { readPublicNotificationPreview } from '../src/server/database/public-notification-preview.ts';

await test('a direct public reply uses the approved public profile photo, just like a followed post', async () => {
  const author = crypto.randomUUID(),
    post = crypto.randomUUID(),
    community = crypto.randomUUID();
  const avatar = `/api/public-media/avatar/${author}/${crypto.randomUUID()}`;
  const client = {
    query: () =>
      Promise.resolve({
        rows: [
          {
            id: post,
            community_id: community,
            title: '',
            text: 'Public reply',
            parent_id: crypto.randomUUID(),
            author,
            handle: 'author',
            followed: false,
          },
        ],
      }),
  } as unknown as pg.PoolClient;
  const authority = {
    session: { accountId: crypto.randomUUID(), deviceId: crypto.randomUUID() },
  } as ContactAuthority;
  const contacts = {
    withMessageAuthority: <T>(
      received: ContactAuthority,
      read: (client: pg.PoolClient) => Promise<T>,
    ) => {
      assert.equal(received, authority);
      return read(client);
    },
  } as unknown as ContactStore;
  const preview = await readPublicNotificationPreview(contacts, authority, {
    readById: (id) => {
      assert.equal(id, author);
      return Promise.resolve({ id: author, handle: 'author', avatar });
    },
  });
  assert.equal(preview?.author.avatar, avatar);
  assert.equal(preview?.followed, false);
  assert.equal(preview?.reply, true);
});
