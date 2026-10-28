import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';
import { createApp } from '../src/create-app.js';
import { loadConfig } from '../src/config.js';
import { normalizeUsPhone, validateContact } from '../src/contact.js';

let server;
let base;
let dataDir;

before(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), 'flintbadger-'));
  const config = loadConfig({ DATA_DIR: dataDir, ADMIN_PASSWORD: 'secret', SITE_URL: 'https://flintbadgerdesign.com' });
  server = createApp(config).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  server.close();
  await rm(dataDir, { recursive: true, force: true });
});

const post = (body, headers = {}) =>
  fetch(`${base}/contact`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(body),
  });

const readRecords = async () =>
  (await readFile(path.join(dataDir, 'submissions.jsonl'), 'utf8')).trim().split('\n').map((l) => JSON.parse(l));

describe('pages', () => {
  for (const p of ['/', '/services', '/contact', '/privacy-policy', '/sms-terms', '/terms']) {
    test(`${p} renders with footer policy links and business details`, async () => {
      const res = await fetch(base + p);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /href="\/privacy-policy"/);
      assert.match(html, /href="\/sms-terms"/);
      assert.match(html, /href="\/terms"/);
      assert.match(html, /116 Burch Oak Ln, Prestonsburg, KY 41653/);
      assert.match(html, /\(606\) 262-1308/);
      assert.match(html, /contact@flintbadgerdesign\.com/);
      assert.doesNotMatch(html, /\[(DOMAIN|ADDRESS|PHONE|EMAIL|EFFECTIVE DATE)\]|\{\{/);
    });
  }

  test('privacy policy contains the SMS no-sharing clause', async () => {
    const html = await (await fetch(`${base}/privacy-policy`)).text();
    assert.match(html, /No mobile information will be shared with third parties or affiliates for marketing or promotional purposes\./);
  });

  test('terms of service describes the SMS program in the wording carriers scan for', async () => {
    const html = await (await fetch(`${base}/terms`)).text();
    assert.match(html, /agree to receive informational text messages[^.]*from Flint Badger LLC/);
    assert.match(html, /Message frequency varies\. Message and data rates may apply\. For help, reply HELP or email us at/);
    assert.match(html, /You can opt out at any time by replying STOP\./);
  });

  test('contact form has an optional, unchecked SMS checkbox with full disclosure', async () => {
    const html = await (await fetch(`${base}/contact`)).text();
    const checkbox = html.match(/<input id="sms_consent"[^>]*>/)[0];
    assert.doesNotMatch(checkbox, /checked|required/);
    assert.doesNotMatch(html.match(/<input id="phone"[^>]*>/)[0], /required/);
    assert.match(html, /Message frequency may vary\. Message and data rates may apply\. Reply STOP to opt out at any time\. Reply HELP for help\. Consent is not a condition of purchase\./);
  });

  test('unknown paths return 404, assets are long-cached', async () => {
    assert.equal((await fetch(`${base}/nope`)).status, 404);
    const css = await fetch(`${base}/assets/styles.css`);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('cache-control'), /immutable/);
  });
});

describe('contact submissions', () => {
  test('valid submission with SMS consent stores a consent record', async () => {
    const res = await post(
      { name: 'Jane Doe', email: 'jane@example.com', phone: '(606) 555-0199', service: 'Branding', details: 'Need a logo.', sms_consent: 'yes' },
      { Accept: 'application/json' },
    );
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { ok: true, redirect: '/thank-you' });
    const record = (await readRecords()).at(-1);
    assert.equal(record.phone, '+16065550199');
    assert.equal(record.sms.consent, true);
    assert.match(record.sms.consentText, /^I agree to receive text messages from Flint Badger LLC/);
    assert.ok(record.sms.consentedAt && record.sms.ip);
  });

  test('form can be submitted without phone or consent; no-JS post redirects', async () => {
    const res = await post({ name: 'Sam', email: 'sam@example.com', details: 'Website please.' });
    assert.equal(res.status, 303);
    assert.equal(res.headers.get('location'), '/thank-you');
    assert.equal((await readRecords()).at(-1).sms.consent, false);
  });

  test('consent without a phone number is rejected', async () => {
    const res = await post({ name: 'A', email: 'a@example.com', details: 'x', sms_consent: 'yes' }, { Accept: 'application/json' });
    assert.equal(res.status, 422);
    assert.ok((await res.json()).errors.phone);
  });

  test('no-JS error re-renders the form with values kept and escaped', async () => {
    const res = await post({ name: '<b>Al</b>', email: 'bad', details: 'hello' });
    assert.equal(res.status, 422);
    const html = await res.text();
    assert.match(html, /value="&lt;b&gt;Al&lt;\/b&gt;"/);
    assert.match(html, /Please enter a valid email address\./);
  });

  test('honeypot submissions are accepted but not stored', async () => {
    const before = (await readRecords()).length;
    const res = await post({ name: 'Bot', email: 'b@example.com', details: 'spam', company_fax: 'x' }, { Accept: 'application/json' });
    assert.equal(res.status, 200);
    assert.equal((await readRecords()).length, before);
  });

  test('cross-site posts are refused', async () => {
    const res = await post({ name: 'X', email: 'x@example.com', details: 'y' }, { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
  });
});

describe('admin export', () => {
  test('requires the password and returns CSV', async () => {
    assert.equal((await fetch(`${base}/admin/submissions.csv`)).status, 401);
    const res = await fetch(`${base}/admin/submissions.csv`, {
      headers: { Authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}` },
    });
    assert.equal(res.status, 200);
    const csv = await res.text();
    assert.match(csv, /^id,received_at,name/);
    assert.match(csv, /\+16065550199/);
  });
});

describe('validation helpers', () => {
  test('normalizes US phone numbers', () => {
    assert.equal(normalizeUsPhone('606-262-1308'), '+16062621308');
    assert.equal(normalizeUsPhone('+1 (606) 262 1308'), '+16062621308');
    assert.equal(normalizeUsPhone('12345'), null);
    assert.equal(normalizeUsPhone('(106) 262-1308'), null);
  });

  test('rejects unknown services and overlong input', () => {
    const { errors } = validateContact({ name: 'x'.repeat(101), email: 'a@b.co', details: 'd', service: 'SEO' });
    assert.ok(errors.name);
    assert.ok(errors.service);
  });
});
