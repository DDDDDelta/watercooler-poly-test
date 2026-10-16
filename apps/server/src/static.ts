import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { Hono } from 'hono';
import type { AppEnv } from './context';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

/** Serve the built SPA: real files first, otherwise index.html for client-side routes. */
export function serveSpa(app: Hono<AppEnv>, root: string): void {
  const indexHtml = readFileSync(resolve(root, 'index.html'), 'utf8');

  app.get('*', async (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: '接口不存在' }, 404);
    let rel: string;
    try {
      rel = decodeURIComponent(c.req.path);
    } catch {
      return c.text('Bad Request', 400);
    }
    const file = resolve(root, `.${rel}`);
    if (file.startsWith(root + sep)) {
      try {
        const info = await stat(file);
        if (info.isFile()) {
          const body = await readFile(file);
          const immutable = rel.startsWith('/assets/');
          return c.body(body, 200, {
            'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
            'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
          });
        }
      } catch {
        // fall through to SPA index
      }
    }
    if (extname(rel)) return c.text('Not Found', 404);
    return c.html(indexHtml, 200, { 'Cache-Control': 'no-cache' });
  });
}
