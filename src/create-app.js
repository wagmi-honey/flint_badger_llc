import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import compression from 'compression';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { validateContact } from './contact.js';
import { createMailer } from './mailer.js';
import { createRenderer, escapeHtml, extraPages, pages, publicDir } from './render.js';
import { SERVICES, SMS_CONSENT_TEXT } from './site.js';
import { createStore } from './store.js';
import { createPostgresStore } from './store-postgres.js';

const FIELDS = ['name', 'email', 'phone', 'service', 'details'];
const HTML_CACHE = 'public, max-age=0, must-revalidate';

function contactForm({ values = {}, errors = {} } = {}) {
  const consentLabel = escapeHtml(SMS_CONSENT_TEXT)
    .replace('Privacy Policy', '<a href="/privacy-policy" target="_blank" rel="noopener">Privacy Policy</a>')
    .replace('SMS Terms', '<a href="/sms-terms" target="_blank" rel="noopener">SMS Terms</a>');
  const serviceOptions = ['', ...SERVICES]
    .map((s) => `<option value="${escapeHtml(s)}"${s === (values.service ?? '') ? ' selected' : ''}>${s ? escapeHtml(s) : 'Choose a service'}</option>`)
    .join('');
  const count = Object.keys(errors).length;

  return {
    values: Object.fromEntries(FIELDS.map((f) => [f, values[f] ?? ''])),
    errors: Object.fromEntries(FIELDS.map((f) => [f, errors[f] ?? ''])),
    invalid: Object.fromEntries(FIELDS.map((f) => [f, errors[f] ? ' aria-invalid="true"' : ''])),
    smsChecked: values.smsConsent ? ' checked' : '',
    serviceOptions,
    consentLabel,
    errorSummary: count
      ? `<div class="form-alert" role="alert" tabindex="-1">Please fix the ${count === 1 ? 'highlighted field' : `${count} highlighted fields`} below.</div>`
      : '',
  };
}

function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // block spreadsheet formula injection
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const digest = (s) => createHash('sha256').update(s).digest();

export function createApp(config, app = express()) {
  const render = createRenderer(config);
  const store = config.databaseUrl ? createPostgresStore(config.databaseUrl) : createStore(config.dataDir);
  if (config.serverless && !config.databaseUrl) {
    console.warn('WARNING: no POSTGRES_URL/DATABASE_URL set on a serverless host. Submissions and SMS consent records will NOT persist. Add a Postgres database (Vercel: Storage > Create Database > Neon) and redeploy.');
  }
  const mailer = createMailer(config);
  const staticPages = new Map(pages.filter((p) => p.view !== 'contact').map((p) => [p.path, render(p)]));
  const thanksHtml = render(extraPages.thanks);
  const notFoundHtml = render(extraPages.notFound);
  const contactPage = pages.find((p) => p.view === 'contact');

  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet({ contentSecurityPolicy: { directives: { 'form-action': ["'self'"] } } }));
  app.use(compression());

  app.get('/healthz', (req, res) => res.type('text').send('ok'));

  app.use('/assets', express.static(`${publicDir}/assets`, { immutable: true, maxAge: '365d', index: false }));
  app.get('/favicon.ico', (req, res) => res.redirect(302, '/assets/favicon.svg'));

  app.get('/robots.txt', (req, res) => {
    res.type('text').send(`User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });
  app.get('/sitemap.xml', (req, res) => {
    const urls = pages.map((p) => `<url><loc>${config.siteUrl}${p.path}</loc></url>`).join('');
    res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`);
  });

  for (const [path, html] of staticPages) {
    app.get(path, (req, res) => res.set('Cache-Control', HTML_CACHE).type('html').send(html));
  }
  app.get('/contact', (req, res) => {
    res.set('Cache-Control', HTML_CACHE).type('html').send(render(contactPage, { form: contactForm() }));
  });
  app.get('/thank-you', (req, res) => res.set('Cache-Control', 'no-store').type('html').send(thanksHtml));

  const wantsJson = (req) => req.accepts(['html', 'json']) === 'json';

  const contactLimiter = rateLimit({
    ...config.rateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler(req, res) {
      const message = 'Too many messages from this connection. Please try again in a few minutes, or email us directly.';
      if (wantsJson(req)) return res.status(429).json({ ok: false, message });
      res.status(429).type('text').send(message);
    },
  });

  app.post('/contact', contactLimiter, express.urlencoded({ extended: false, limit: '20kb', parameterLimit: 20 }), async (req, res, next) => {
    try {
      // Reject cross-site posts; browsers always send Origin on form POSTs.
      const origin = req.get('origin');
      if (origin && origin !== 'null' && new URL(origin).host !== req.get('host')) {
        return res.status(403).type('text').send('Forbidden');
      }

      const done = () => (wantsJson(req) ? res.json({ ok: true, redirect: '/thank-you' }) : res.redirect(303, '/thank-you'));

      // Honeypot: real visitors never see or fill this field.
      if (req.body?.company_fax) return done();

      const { values, errors, phoneE164, valid } = validateContact(req.body);
      if (!valid) {
        if (wantsJson(req)) return res.status(422).json({ ok: false, errors });
        return res.status(422).set('Cache-Control', 'no-store').type('html').send(render(contactPage, { form: contactForm({ values, errors }) }));
      }

      const receivedAt = new Date().toISOString();
      const record = {
        id: randomUUID(),
        receivedAt,
        name: values.name,
        email: values.email,
        phone: phoneE164,
        service: values.service,
        details: values.details,
        sms: values.smsConsent
          ? { consent: true, phone: phoneE164, consentText: SMS_CONSENT_TEXT, consentedAt: receivedAt, source: `${config.siteUrl}/contact`, ip: req.ip, userAgent: req.get('user-agent') ?? '' }
          : { consent: false },
      };

      await store.append(record);
      mailer.notify(record).catch((err) => console.error(`Notification email failed for ${record.id}:`, err.message));
      done();
    } catch (err) {
      next(err);
    }
  });

  // Consent records for carrier audits: /admin/submissions.csv, HTTP Basic auth (user "admin").
  app.get('/admin/submissions.csv', async (req, res, next) => {
    if (!config.adminPassword) return next();
    const [scheme, encoded] = (req.get('authorization') ?? '').split(' ');
    const [user, ...rest] = scheme === 'Basic' && encoded ? Buffer.from(encoded, 'base64').toString().split(':') : [];
    if (user !== 'admin' || !timingSafeEqual(digest(rest.join(':')), digest(config.adminPassword))) {
      return res.set('WWW-Authenticate', 'Basic realm="Flint Badger admin"').status(401).type('text').send('Authentication required');
    }
    try {
      const header = ['id', 'received_at', 'name', 'email', 'phone', 'service', 'details', 'sms_consent', 'consent_text', 'consent_ip', 'consent_user_agent', 'consent_source'];
      const rows = (await store.readAll()).map((r) =>
        [r.id, r.receivedAt, r.name, r.email, r.phone, r.service, r.details, r.sms.consent ? 'yes' : 'no', r.sms.consentText, r.sms.ip, r.sms.userAgent, r.sms.source].map(csvCell).join(','),
      );
      res
        .set({ 'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="submissions.csv"' })
        .type('text/csv')
        .send([header.join(','), ...rows].join('\r\n'));
    } catch (err) {
      next(err);
    }
  });

  app.use((req, res) => res.status(404).type('html').send(notFoundHtml));

  app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).type('text').send('Message too large.');
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).type('text').send('Something went wrong. Please email contact@flintbadger.site.');
  });

  return app;
}
