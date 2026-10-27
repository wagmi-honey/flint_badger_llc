import { createApp } from './src/create-app.js';
import { loadConfig } from './src/config.js';

const config = loadConfig();
const app = createApp(config);

// Vercel imports this file and runs the exported app as a function; everywhere else we listen on a port.
export default app;

if (!config.serverless) {
  const server = app.listen(config.port, () => {
    console.log(`Flint Badger site listening on port ${config.port}`);
    console.log(`Storage: ${config.databaseUrl ? 'Postgres' : `files in ${config.dataDir}`}`);
    if (!config.smtp) console.log('SMTP not configured: inquiries are saved but not emailed.');
    if (!config.adminPassword) console.log('ADMIN_PASSWORD not set: /admin/submissions.csv is disabled.');
  });

  for (const signal of ['SIGTERM', 'SIGINT']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
