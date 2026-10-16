FROM node:22-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
# Toolchain for compiling better-sqlite3 if no prebuilt binary is available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Production dependencies of the server only.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --prod --frozen-lockfile --filter @watercooler/server

# Build web app and server bundle.
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim AS runtime
ENV NODE_ENV=production PORT=3000 DATABASE_PATH=/data/watercooler.db
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
VOLUME /data
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
