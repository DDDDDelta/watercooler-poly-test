// Disposable HTTP fixture for the real Python SDK. No application database is touched.
import { serve } from '@hono/node-server';
import { writeFileSync } from 'node:fs';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/db';

const db = openDatabase(':memory:');
let offset = 0;
const app = createApp({
  db,
  config: { ...loadConfig({}), staticDir: null, basePath: '/desk', privateMode: true },
  now: () => Date.now() + offset,
});
const server = serve(
  {
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url);
      // Test-only clock control, confined to this disposable loopback server.
      if (url.pathname === '/desk/api/__test/advance' && request.method === 'POST') {
        offset += 2 * 86400000;
        return Response.json({ now: Date.now() + offset });
      }
      if (!url.pathname.startsWith('/desk/')) return new Response('Not found', { status: 404 });
      url.pathname = url.pathname.slice('/desk'.length);
      return app.fetch(new Request(url, request));
    },
  },
  (info) => writeFileSync(process.env.WATERCOOLER_READY_FILE!, `http://127.0.0.1:${info.port}/desk`),
);
process.on('SIGTERM', () => {
  server.close();
  db.close();
  process.exit(0);
});
