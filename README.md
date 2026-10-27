# Flint Badger LLC website

Five-page website for Flint Badger LLC, built to pass 10DLC (A2P SMS) campaign review on Zoom Phone.

| Page | URL |
| --- | --- |
| Home | `/` |
| Services | `/services` |
| Contact (SMS opt-in form) | `/contact` |
| Privacy Policy | `/privacy-policy` |
| SMS Terms | `/sms-terms` |
| Terms of Service | `/terms` |

The server is Node.js and Express. Pages are plain HTML and CSS rendered on the server, with no build step. The contact form works without JavaScript; with JavaScript it submits without reloading the page.

## What the backend does

- Serves the pages with security headers, gzip and long-lived caching for CSS, JS and icons.
- Validates the contact form on the server. It rejects cross-site posts, rate-limits each IP and catches bots with a hidden honeypot field.
- Saves every submission to `DATA_DIR/submissions.jsonl`. When someone ticks the SMS box, it also saves a **consent record**: the exact consent wording, timestamp, IP address, browser and source page. This is the opt-in proof carriers can ask for.
- Emails each inquiry to `NOTIFY_EMAIL` when SMTP is set up.
- Lets you download every submission and consent record as CSV from `/admin/submissions.csv`, behind a password.
- Serves `/sitemap.xml`, `/robots.txt` and `/healthz`.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:3000, restarts on file changes
npm test
```

## Deploy

### Vercel (recommended)

The repo is ready for Vercel: `vercel.json` and `server.js` are set up, no build command is needed.

1. In Vercel, **Add New Project**, import this GitHub repository, and click **Deploy**. Vercel detects Express automatically. The site is live on a `*.vercel.app` URL within a minute, and every push to `main` redeploys it.
2. **Add a database** (one click, needed so consent records persist). In the project, open **Storage**, choose **Create Database**, pick **Neon (Postgres)**, and connect it to the project. Vercel injects `POSTGRES_URL` automatically; the app creates its table on first use. Then go to **Deployments** and click **Redeploy** so the function picks up the variable.

   Without this step the site still works, but the function's filesystem is temporary, so submissions and SMS consent records are lost. The logs show a warning when this is the case.
3. **Settings > Environment Variables:** add `ADMIN_PASSWORD` (turns on the CSV export) and, optionally, the SMTP variables so inquiries are emailed to you. Redeploy after adding them.
4. **Settings > Domains:** add `flintbadger.site` and `www.flintbadger.site`, then create the DNS records Vercel shows you at your registrar. HTTPS is automatic.

Everything else below is for hosts with a persistent disk, where the file store is used instead of Postgres.

### Other hosts

Set the environment variables from `.env.example` on your host. The two that matter most:

- Either set `DATABASE_URL` to a Postgres database, or make sure `DATA_DIR` points at a **persistent disk**. Most hosts wipe their app filesystem on every deploy, which would delete your consent records.
- `ADMIN_PASSWORD` turns on the CSV export.

### Render

1. New **Web Service** from this GitHub repo. Runtime Node, build `npm ci --omit=dev`, start `npm start`.
2. Add a **Disk** mounted at `/var/data` and set `DATA_DIR=/var/data`. Disks need a paid instance.
3. Set `ADMIN_PASSWORD` and, optionally, the SMTP variables.
4. Under **Custom Domains**, add `flintbadger.site` and `www.flintbadger.site`, then create the DNS records Render shows you.

### Railway

New project from the repo. It uses the Dockerfile automatically. Add a **Volume** mounted at `/app/data`, then set the variables and your custom domain.

### Any server with Docker

```bash
docker build -t flintbadger .
docker run -d --name flintbadger --restart unless-stopped \
  -p 3000:3000 -v flintbadger-data:/app/data \
  -e ADMIN_PASSWORD=change-me \
  flintbadger
```

Put Nginx or Caddy in front for HTTPS. Caddy needs only `flintbadger.site { reverse_proxy localhost:3000 }`.

### Email notifications

Use the SMTP settings from your email provider, for example Google Workspace, Microsoft 365 or Zoho Mail. Send from an address on `flintbadger.site` so messages are not flagged as spam.

## Changing business details

Your name, address, phone, email and effective date all come from [src/site.js](src/site.js). Change them there and every page, the footer and the structured data update together. Keep them identical to your EIN letter and the Zoom 10DLC brand form.

`SMS_CONSENT_TEXT` in the same file is the opt-in wording. If you change it, update the Zoom campaign's "message flow" answer to match word for word.

## Before submitting the Zoom campaign

- [ ] The site is live at `https://flintbadger.site` with HTTPS.
- [ ] Submit a test inquiry with the SMS box checked, and confirm it shows up in `/admin/submissions.csv`.
- [ ] Do not add other forms that collect phone numbers without the same SMS checkbox and wording.
- [ ] Do not mention SEO, lead generation or promotional texting anywhere on the site.

## Project layout

```
server.js            entry point
src/create-app.js           routes, contact handling, admin export
src/site.js          business details and SMS consent wording
src/render.js        page list and HTML templating
src/contact.js       form validation
src/store.js         JSON Lines storage
src/mailer.js        email notifications
views/layout.html    shared header and footer
views/pages/         page content
public/assets/       CSS, JS, favicon
test/                node:test suite
```
