import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ensureBots } from './bots/agent';
import { loadBotConfig, type BotConfig } from './bots/config';
import { createAsk } from './bots/llm';
import { startBots } from './bots/scheduler';
import { loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db';
import { serveSpa } from './static';

loadDotEnv();
const config = loadConfig();
const db = openDatabase(config.databasePath);

let botConfig: BotConfig | null = null;
try {
  botConfig = loadBotConfig(config.botConfigPath);
} catch (err) {
  console.error(`AI bots disabled: ${(err as Error).message}`);
}

const app = createApp({ db, config, now: Date.now, botsEnabled: botConfig !== null });
if (config.staticDir) serveSpa(app, config.staticDir);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`💧 Watercooler API listening on http://localhost:${info.port}`);
  console.log(`   database: ${config.databasePath}`);
  console.log(config.staticDir ? `   serving web app from ${config.staticDir}` : '   web app not built — API only');
  if (config.inviteCode) console.log('   registration requires an invite code');
});

if (botConfig) {
  const deps = { db, config, bot: botConfig, ask: createAsk(botConfig), now: Date.now };
  try {
    const botIds = await ensureBots(deps);
    startBots(deps, botIds);
    console.log(`🤖 ${botIds.length} AI bots running on ${botConfig.model} (${config.botConfigPath})`);
  } catch (err) {
    // The site keeps running without bots.
    console.error(`AI bots failed to start: ${(err as Error).message}`);
  }
}

function shutdown() {
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
