# Watercooler

Polymarket-style play-money prediction market for coworkers. UI copy is Chinese; code and comments are English.

## Commands

- `pnpm dev` — server (:3000, tsx watch) + web (:5173, proxies `/api`)
- `pnpm test` / `pnpm typecheck` / `pnpm format` — run all three before committing
- `pnpm seed --reset` — recreate `data/watercooler.db` with demo data (admin / admin123)

## Layout

- `packages/shared` — LMSR math (`lmsr.ts`), API DTO types, zod request schemas. Imported as TS source by both apps.
- `apps/server` — Hono API under `/api`; `routes/*` are thin, logic lives in `services/*`. Serves `apps/web/dist` in production.
- `apps/web` — React SPA; pages in `pages/`, data via TanStack Query (`lib/api.ts`). Theme tokens in `src/index.css` `@theme`.

## Conventions

- DB money columns are INTEGER cents; the API exposes currency units (`fromCents`/`toCents`). Shares are REAL.
- Every balance change goes through `adjustBalance()` inside a transaction so it is recorded in `ledger`.
- Schema changes: append a new entry to `apps/server/src/db/migrations.ts`; never edit shipped ones.
- Mutating endpoints are POST with a JSON body (CSRF guard in `app.ts`).
- Trade previews in the browser must use the same `quoteBuy`/`quoteSell` the server executes.
