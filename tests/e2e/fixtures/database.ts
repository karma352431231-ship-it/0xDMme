import pg from 'pg';
import { randomBytes } from 'node:crypto';

export function testDatabaseUrl(value: string | undefined): URL {
  if (!value)
    throw new Error(
      'Set HASH_TALK_E2E_DATABASE_URL in .local/chat-e2e.env to a local test database whose role has CREATEDB. See docs/CHAT_BROWSER_TESTS.md.',
    );
  const url = new URL(value);
  if (
    url.protocol !== 'postgresql:' ||
    url.hostname !== '127.0.0.1' ||
    !/^\/hash_talk_test[a-z0-9_]*$/u.test(url.pathname) ||
    url.search ||
    url.hash
  )
    throw new Error(
      'Browser tests require an explicit loopback hash_talk_test database.',
    );
  return url;
}
export async function createTestDatabase(value: string | undefined) {
  const base = testDatabaseUrl(value);
  const client = new pg.Client({
    connectionString: base.href,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000,
  });
  await client.connect();
  const name = `hash_talk_test_e2e_${randomBytes(12).toString('hex')}`;
  const token = `e2e-owner:${randomBytes(24).toString('hex')}`;
  let owned = false;
  async function close(): Promise<void> {
    try {
      if (!owned) return;
      const result = await client.query<{ valid: boolean }>(
        "SELECT pg_get_userbyid(datdba)=current_user AND shobj_description(oid,'pg_database')=$2 AS valid FROM pg_database WHERE datname=$1",
        [name, token],
      );
      if (result.rows[0]?.valid !== true)
        throw new Error('Refusing cleanup: database ownership marker changed.');
      await client.query(`DROP DATABASE "${name}" WITH (FORCE)`);
      owned = false;
    } finally {
      await client.end();
    }
  }
  try {
    await client.query(`CREATE DATABASE "${name}"`);
    owned = true;
    await client.query(`COMMENT ON DATABASE "${name}" IS '${token}'`);
    base.pathname = `/${name}`;
    return { url: base.href, close };
  } catch (error) {
    await close();
    throw error;
  }
}
