import os from 'node:os';
import path from 'node:path';

const bool = (value, fallback) => (value === undefined || value === '' ? fallback : /^(1|true|yes)$/i.test(value));
const int = (value, fallback) => (value === undefined || value === '' ? fallback : Number.parseInt(value, 10));

export function loadConfig(env = process.env) {
  const serverless = Boolean(env.VERCEL);
  return {
    port: int(env.PORT, 3000),
    serverless,
    siteUrl: (env.SITE_URL || 'https://flintbadger.site').replace(/\/+$/, ''),
    // Postgres connection string. Vercel's Neon integration injects POSTGRES_URL; other hosts use DATABASE_URL.
    databaseUrl: env.POSTGRES_URL || env.DATABASE_URL || '',
    // File store location when no database is set. Serverless filesystems are read-only except the temp dir.
    dataDir: path.resolve(env.DATA_DIR || (serverless ? path.join(os.tmpdir(), 'flintbadger-data') : 'data')),
    // Number of reverse proxies in front of the app (Render, Railway, Fly, Nginx = 1).
    trustProxy: int(env.TRUST_PROXY, 1),
    rateLimit: { windowMs: 15 * 60 * 1000, limit: int(env.CONTACT_RATE_LIMIT, 10) },
    adminPassword: env.ADMIN_PASSWORD || '',
    smtp: env.SMTP_HOST
      ? {
          host: env.SMTP_HOST,
          port: int(env.SMTP_PORT, 587),
          secure: bool(env.SMTP_SECURE, false),
          auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
        }
      : null,
    mailFrom: env.MAIL_FROM || 'Flint Badger Website <contact@flintbadger.site>',
    notifyEmail: env.NOTIFY_EMAIL || 'contact@flintbadger.site',
  };
}
