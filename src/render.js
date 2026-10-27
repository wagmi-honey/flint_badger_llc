import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from './site.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const publicDir = path.join(root, 'public');
const viewsDir = path.join(root, 'views');

// Pages in nav order. `nav` = shown in the header; every page is linked from the footer.
export const pages = [
  {
    path: '/',
    view: 'home',
    nav: 'Home',
    title: 'Logo Design, Branding & Website Design',
    description: 'Flint Badger LLC designs professional logos, complete brand identities, and custom websites for businesses.',
  },
  {
    path: '/services',
    view: 'services',
    nav: 'Services',
    title: 'Services',
    description: 'Logo design, branding, and custom website design from Flint Badger LLC.',
  },
  {
    path: '/contact',
    view: 'contact',
    nav: 'Contact',
    title: 'Contact',
    description: 'Tell Flint Badger LLC about your project. We reply within one business day.',
  },
  {
    path: '/privacy-policy',
    view: 'privacy-policy',
    title: 'Privacy Policy',
    description: 'How Flint Badger LLC collects, uses, and protects your information, including text messaging privacy.',
  },
  {
    path: '/sms-terms',
    view: 'sms-terms',
    title: 'SMS Terms and Conditions',
    description: 'Terms for the Flint Badger LLC text messaging program: opt-in, frequency, costs, STOP and HELP.',
  },
  {
    path: '/terms',
    view: 'terms',
    title: 'Terms of Service',
    description: 'Terms for using the Flint Badger LLC website and for our logo, branding, and website design services.',
  },
];

export const extraPages = {
  thanks: { path: '/thank-you', view: 'thank-you', title: 'Message received', description: 'Thanks for contacting Flint Badger LLC.', noindex: true },
  notFound: { path: '/404', view: '404', title: 'Page not found', description: 'This page does not exist.', noindex: true },
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

const lookup = (ctx, key) => key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), ctx);

// {{key}} inserts escaped text, {{{key}}} inserts trusted HTML. Unknown keys throw so typos fail loudly.
export function renderTemplate(template, ctx) {
  return template.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}|\{\{\s*([\w.]+)\s*\}\}/g, (_, raw, escaped) => {
    const value = lookup(ctx, raw ?? escaped);
    if (value === undefined) throw new Error(`Missing template value: ${raw ?? escaped}`);
    return raw ? String(value) : escapeHtml(value);
  });
}

// Fingerprinted asset URLs so /assets can be cached for a year.
function assetUrls() {
  const dir = path.join(publicDir, 'assets');
  const urls = {};
  for (const file of readdirSync(dir)) {
    const hash = createHash('sha256').update(readFileSync(path.join(dir, file))).digest('hex').slice(0, 10);
    urls[path.parse(file).name] = `/assets/${file}?v=${hash}`;
  }
  return urls;
}

const readView = (name) => readFileSync(path.join(viewsDir, name), 'utf8');

export function createRenderer({ siteUrl }) {
  const layout = readView('layout.html');
  const views = {};
  for (const page of [...pages, ...Object.values(extraPages)]) views[page.view] = readView(`pages/${page.view}.html`);

  const assets = assetUrls();
  const year = new Date().getFullYear();
  const structuredData = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    name: site.legalName,
    url: siteUrl,
    email: site.email,
    telephone: site.phoneE164,
    address: { '@type': 'PostalAddress', streetAddress: '116 Burch Oak Ln', addressLocality: 'Prestonsburg', addressRegion: 'KY', postalCode: '41653', addressCountry: 'US' },
  }).replace(/</g, '\\u003c');

  return function render(page, extra = {}) {
    const ctx = { site, siteUrl, year, assets, ...extra };
    const nav = pages
      .filter((p) => p.nav)
      .map((p) => `<li><a href="${p.path}"${p.path === page.path ? ' aria-current="page"' : ''}>${p.nav}</a></li>`)
      .join('');
    return renderTemplate(layout, {
      ...ctx,
      nav,
      structuredData,
      content: renderTemplate(views[page.view], ctx),
      page: {
        fullTitle: page.path === '/' ? `${site.legalName} | ${page.title}` : `${page.title} | ${site.legalName}`,
        description: page.description,
        canonical: `${siteUrl}${page.path === '/' ? '/' : page.path}`,
        robots: page.noindex ? '<meta name="robots" content="noindex">' : '',
      },
    });
  };
}
