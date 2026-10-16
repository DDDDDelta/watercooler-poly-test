import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db';
import { serveSpa } from './static';

loadDotEnv();
const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = createApp({ db, config, now: Date.now });
if (config.staticDir) serveSpa(app, config.staticDir);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`💧 Watercooler API listening on http://localhost:${info.port}`);
  console.log(`   database: ${config.databasePath}`);
  console.log(config.staticDir ? `   serving web app from ${config.staticDir}` : '   web app not built — API only');
  if (config.inviteCode) console.log('   registration requires an invite code');
});

function shutdown() {
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
