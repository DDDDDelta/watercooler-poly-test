import { serve } from '@hono/node-server';
import { createApp } from './app';
import { ensureBots } from './bots/agent';
import { loadBotConfig, type BotConfig } from './bots/config';
import { createAsk, createChat } from './bots/llm';
import { startBots } from './bots/scheduler';
import { loadConfig, loadDotEnv } from './config';
import { openDatabase } from './db';
import { serveSpa } from './static';
import { startWecom, type WecomService } from './wecom/bot';
import { connectWecom } from './wecom/transport';

loadDotEnv();
const config = loadConfig();
const db = openDatabase(config.databasePath);

let botConfig: BotConfig | null = null;
try {
  botConfig = loadBotConfig(config.botConfigPath);
} catch (err) {
  console.error(`AI bots disabled: ${(err as Error).message}`);
}

let wecom: WecomService | undefined;
if (botConfig?.wecom) {
  const log = (m: string) => console.log(`[wecom] ${m}`);
  try {
    const transport = connectWecom(botConfig.wecom, log);
    wecom = startWecom({
      db,
      config,
      settings: botConfig.wecom,
      chat: createChat(botConfig),
      transport,
      now: Date.now,
      log,
    });
  } catch (err) {
    console.error(`WeCom bot failed to start: ${(err as Error).message}`);
  }
}

const app = createApp({ db, config, now: Date.now, botsEnabled: botConfig !== null, wecom });
if (config.staticDir) serveSpa(app, config.staticDir);

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`💧 Watercooler API listening on http://localhost:${info.port}`);
  console.log(`   database: ${config.databasePath}`);
  console.log(config.staticDir ? `   serving web app from ${config.staticDir}` : '   web app not built — API only');
  if (config.inviteCode) console.log('   registration requires an invite code');
  if (wecom) console.log(`   WeCom bot enabled, links point to ${botConfig?.wecom?.siteUrl}`);
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
  wecom?.stop();
  server.close();
  db.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
