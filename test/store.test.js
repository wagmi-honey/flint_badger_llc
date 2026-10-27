import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createPostgresStore } from '../src/store-postgres.js';

// A fake pg.Pool that records queries and returns stored rows.
function fakePool() {
  const rows = [];
  const queries = [];
  class Pool {
    async query(sql, params) {
      queries.push(sql.trim().split(/\s+/)[0]);
      if (sql.startsWith('INSERT')) rows.push({ record: params[5] });
      if (sql.startsWith('SELECT')) return { rows };
      return { rows: [] };
    }
  }
  return { Pool, queries };
}

describe('postgres store', () => {
  test('creates the table once, inserts, and reads records back', async () => {
    const { Pool, queries } = fakePool();
    const store = createPostgresStore('postgres://example', { Pool });
    const record = { id: 'a', receivedAt: '2026-10-27T00:00:00.000Z', email: 'a@b.co', phone: '+16065550100', sms: { consent: true } };
    await store.append(record);
    await store.append({ ...record, id: 'b', sms: { consent: false } });
    const all = await store.readAll();
    assert.deepEqual(all.map((r) => r.id), ['a', 'b']);
    assert.deepEqual(queries, ['CREATE', 'INSERT', 'INSERT', 'SELECT']);
  });
});

describe('config', () => {
  test('picks up Vercel database URL and temp data dir', () => {
    const c = loadConfig({ VERCEL: '1', POSTGRES_URL: 'postgres://neon' });
    assert.equal(c.serverless, true);
    assert.equal(c.databaseUrl, 'postgres://neon');
    assert.notEqual(c.dataDir, 'data');
  });

  test('defaults to the file store locally', () => {
    const c = loadConfig({});
    assert.equal(c.serverless, false);
    assert.equal(c.databaseUrl, '');
    assert.match(c.dataDir, /data$/);
  });
});
