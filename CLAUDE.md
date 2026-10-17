# Watercooler

Polymarket-style play-money prediction market for coworkers. UI copy is Chinese; code and comments are English.

## Commands

- `pnpm dev` — server (:3000, tsx watch) + web (:5173, proxies `/api`)
- `pnpm test` / `pnpm typecheck` / `pnpm format` — run all three before committing
- `pnpm seed --reset` — recreate `data/watercooler.db` with demo data (admin / admin123)

## Layout

- `packages/shared` — LMSR math (`lmsr.ts`), API DTO types, zod request schemas. Imported as TS source by both apps.
- `apps/server` — Hono API under `/api`; `routes/*` are thin, logic lives in `services/*`. Serves `apps/web/dist` in production.
- `apps/web` — React SPA; pages in `pages/`, data via TanStack Query (`lib/api.ts`). Theme tokens in `src/index.css`: light in `@theme`, 黑夜模式 overrides in `html.dark` (toggled by `lib/theme.ts`).

## Conventions

- DB money columns are INTEGER cents; the API exposes currency units (`fromCents`/`toCents`). Shares are REAL.
- Every balance change goes through `adjustBalance()` inside a transaction so it is recorded in `ledger`.
- Schema changes: append a new entry to `apps/server/src/db/migrations.ts`; never edit shipped ones.
- Mutating endpoints are POST with a JSON body (CSRF guard in `app.ts`).
- Trade previews in the browser must use the same `quoteBuy`/`quoteSell` the server executes.
- UI follows the 非凸科技 (ft.tech) look: light surfaces, brand blue, 4px buttons, underline tabs. Use theme tokens (`bg-panel`, `text-fg`, `border-line`, `text-brand`, …), never hard-coded colours, so 黑夜模式 keeps working; SVG colours go through `style={{ stroke: 'var(--color-…)' }}` or `useThemeColor()`.
- `useEffect` callbacks use block bodies and only ever return a cleanup function: `useEffect(() => x(), …)` returns `x()`'s value, which React later calls as the cleanup (this crashed production when a browser's `window.scrollTo` returned a value).
- The app may be served under a sub-path (`BASE_PATH`, e.g. `/watercooler` in production). Never hard-code root-relative URLs in the web app: use router links/`navigate()` (router has a `basename`) and `import.meta.env.BASE_URL` for anything else.
- Deployment: `.github/workflows/deploy.yml` + `deploy/` (remote activation script, `watercooler.sh` start/stop/restart script, setup guide).
