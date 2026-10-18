# Watercooler

Polymarket-style play-money prediction market for coworkers. UI copy is Chinese; code and comments are English.

## Commands

- `pnpm dev` — server (:3000, tsx watch) + web (:5173, proxies `/api`)
- `pnpm test` / `pnpm typecheck` / `pnpm format` — run all three before committing
- `pnpm seed --reset` — recreate `data/watercooler.db` with demo data (xiaoming / demo123)

## Layout

- `packages/shared` — pari-mutuel pool math (`pool.ts`), API DTO types, zod request schemas. Imported as TS source by both apps.
- `apps/server` — Hono API under `/api`; `routes/*` are thin, logic lives in `services/*`. Serves `apps/web/dist` in production.
- `apps/web` — React SPA; pages in `pages/`, data via TanStack Query (`lib/api.ts`). Theme tokens in `src/index.css`: light in `@theme`, 黑夜模式 overrides in `html.dark` (toggled by `lib/theme.ts`).

## Conventions

- DB money columns (balances, bets, pools, pots) are INTEGER cents; the API exposes currency units (`fromCents`/`toCents`).
- Every balance change goes through `adjustBalance()` inside a transaction so it is recorded in `ledger`.
- Schema changes: append a new entry to `apps/server/src/db/migrations.ts`; never edit shipped ones.
- Mutating endpoints are POST with a JSON body (CSRF guard in `app.ts`).
- Betting is pari-mutuel: winners split the whole pot pro-rata (`splitPot`), nobody backing the winner means full refunds, the house never adds money. Payout previews in the browser must use the same `pool.ts` helpers the server settles with.
- There are no admins. The market creator resolves or cancels their own market (and may bet in it like anyone); unresolved markets auto-cancel `RESOLVE_GRACE_DAYS` after close (`cancelOverdueMarkets`, run per request). Forgotten passwords: `src/cli.ts reset-password`.
- AI bots (`apps/server/src/bots/`) start only when `bot.json` exists (`BOT_CONFIG`, see `bot.example.json`). They are `users.is_bot` accounts that may only bet on `markets.is_ai` markets (enforced in `placeBet`), stay off the leaderboard and site stats, and talk to the Anthropic Messages API through `@anthropic-ai/sdk` with the web search tool (`bots/llm.ts`): one search per bet, several for writing and settling questions. Question writing is the costly call and is capped per 24h in `bot_attempts`, failed attempts included. Tests use a fake `Ask`, never the real API.
- The WeCom (企业微信) bot (`apps/server/src/wecom/`) starts only when `bot.json` has a `wecom` section (only the watercooler instance's does). It talks to WeCom through `WecomTransport` (`connectWecom` wraps `@wecom/aibot-node-sdk`; tests use a fake), works in group chats only, and answers people without a binding with a single-use link to `/bind/:token` and nothing else — they never reach the model. Bound people chat with the bots' model through the tools in `wecom/tools.ts`; anything that moves money (bet, create, resolve, cancel) only creates a `wecom_actions` row and a confirmation card that its owner must tap. `wecom/notifier.ts` posts settlements and creator reminders to each person's last group, once per `wecom_notices` row.
- UI follows the 非凸科技 (ft.tech) look: light surfaces, brand blue, 4px buttons, underline tabs. Use theme tokens (`bg-panel`, `text-fg`, `border-line`, `text-brand`, …), never hard-coded colours, so 黑夜模式 keeps working; SVG colours go through `style={{ stroke: 'var(--color-…)' }}` or `useThemeColor()`.
- `useEffect` callbacks use block bodies and only ever return a cleanup function: `useEffect(() => x(), …)` returns `x()`'s value, which React later calls as the cleanup (this crashed production when a browser's `window.scrollTo` returned a value).
- The app may be served under a sub-path (`BASE_PATH`, e.g. `/watercooler` in production). Never hard-code root-relative URLs in the web app: use router links/`navigate()` (router has a `basename`) and `import.meta.env.BASE_URL` for anything else.
- Deployment: `.github/workflows/deploy.yml` + `deploy/` (remote activation script, `watercooler.sh` start/stop/restart script, setup guide). The same code runs as independent instances (`watercooler`, `gang-bet`), each with its own `~/<instance>` dir, port, `BASE_PATH`, `SITE_NAME`, `SITE_COPY` and database; they are listed in the workflow's `matrix.include`. Instance-flavoured UI copy (anything mentioning 茶水间/同事) goes in `apps/web/src/lib/site-copy.ts`, read via `COPY` from `lib/site.ts`, never inline.
