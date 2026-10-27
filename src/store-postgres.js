import pg from 'pg';

// Postgres-backed submission and consent store. Used automatically when a database URL is set
// (Vercel's Neon/Postgres integration injects POSTGRES_URL). Same interface as the file store.
export function createPostgresStore(connectionString, { Pool = pg.Pool } = {}) {
  const pool = new Pool({ connectionString, max: 3, idleTimeoutMillis: 10_000 });
  let ready;

  const init = () => {
    ready ??= pool.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id          text PRIMARY KEY,
        received_at timestamptz NOT NULL,
        email       text NOT NULL,
        phone       text,
        sms_consent boolean NOT NULL DEFAULT false,
        record      jsonb NOT NULL
      )`).catch((err) => {
      ready = undefined;
      throw err;
    });
    return ready;
  };

  return {
    kind: 'postgres',
    async append(record) {
      await init();
      await pool.query(
        'INSERT INTO submissions (id, received_at, email, phone, sms_consent, record) VALUES ($1, $2, $3, $4, $5, $6)',
        [record.id, record.receivedAt, record.email, record.phone, record.sms.consent, JSON.stringify(record)],
      );
    },
    async readAll() {
      await init();
      const { rows } = await pool.query('SELECT record FROM submissions ORDER BY received_at');
      return rows.map((r) => (typeof r.record === 'string' ? JSON.parse(r.record) : r.record));
    },
  };
}
