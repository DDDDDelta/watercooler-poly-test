#!/usr/bin/env bash
# Activates a release on the server. .github/workflows/deploy.yml uploads the build to
# <app-dir>/releases/<release>.tgz and then pipes this script over SSH:
#
#   ssh server "bash -l -s -- <app-dir> <release>" < deploy/remote-deploy.sh
#
# <app-dir> may be absolute or relative to the deploy user's home (e.g. "watercooler" = ~/watercooler).
# Layout under <app-dir>:
#   releases/<release>/   unpacked builds (the newest $KEEP_RELEASES are kept)
#   current -> releases/  the release the service runs
#   shared/data/          SQLite database, survives deploys
#   shared/.env           optional settings (INVITE_CODE, ...), linked into every release
set -euo pipefail

usage='usage: remote-deploy.sh <app-dir> <release>'
APP_DIR=${1:?$usage}
RELEASE=${2:?$usage}
# Override to use something other than systemd, e.g. RESTART_CMD="pm2 restart watercooler".
RESTART_CMD=${RESTART_CMD:-sudo -n systemctl restart watercooler}
HEALTH_URL=${HEALTH_URL:-http://127.0.0.1:3000/api/config}
KEEP_RELEASES=${KEEP_RELEASES:-5}

if ! command -v node >/dev/null 2>&1; then
  echo "!! Node.js is not on PATH for $(whoami). Install Node 22 system-wide (see deploy/README.md)." >&2
  exit 1
fi
# shellcheck disable=SC2016 # JavaScript, not shell
node -e '
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 19)) {
    console.error(`Node.js ${process.version} is too old; need >= 20.19`);
    process.exit(1);
  }'

# shellcheck disable=SC2088 # matching a literal "~" on purpose
case $APP_DIR in
  /*) ;;
  "~") APP_DIR=$HOME ;;
  "~/"*) APP_DIR="$HOME/${APP_DIR#"~/"}" ;;
  *) APP_DIR="$HOME/$APP_DIR" ;;
esac
mkdir -p "$APP_DIR"
APP_DIR=$(cd "$APP_DIR" && pwd -P)
RELEASES="$APP_DIR/releases"
TARGET="$RELEASES/$RELEASE"

echo "==> Unpacking $RELEASE"
mkdir -p "$TARGET" "$APP_DIR/shared/data"
tar -xzf "$TARGET.tgz" -C "$TARGET"
rm -f "$TARGET.tgz"

echo "==> Installing production dependencies"
cd "$TARGET"
export CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
if command -v corepack >/dev/null 2>&1; then
  corepack pnpm install --prod --frozen-lockfile --filter @watercooler/server
else
  pnpm_version=$(node -p 'require("./package.json").packageManager.split("@")[1]')
  npx --yes "pnpm@$pnpm_version" install --prod --frozen-lockfile --filter @watercooler/server
fi

# The app loads <release>/.env at startup; point it at the shared one (a missing file is ignored).
ln -sfn "$APP_DIR/shared/.env" "$TARGET/.env"

activate() {
  ln -sfn "$1" "$APP_DIR/current.tmp"
  mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
}

healthy() {
  # shellcheck disable=SC2016 # JavaScript, not shell
  node -e 'fetch(process.argv[1]).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))' "$HEALTH_URL"
}

wait_healthy() {
  for _ in $(seq 1 30); do
    healthy && return 0
    sleep 1
  done
  return 1
}

previous=$(readlink -f "$APP_DIR/current" 2>/dev/null || true)

echo "==> Switching to $RELEASE and restarting"
activate "$TARGET"
failure=""
if ! $RESTART_CMD; then
  failure="'$RESTART_CMD' failed; check the systemd unit and the sudoers rule (deploy/README.md)"
elif ! wait_healthy; then
  failure="$HEALTH_URL did not come up healthy"
fi

if [ -n "$failure" ]; then
  echo "!! $failure" >&2
  journalctl -u watercooler -n 40 --no-pager 2>/dev/null || true
  if [ -n "$previous" ] && [ -d "$previous" ] && [ "$previous" != "$TARGET" ]; then
    echo "!! Rolling back to $(basename "$previous")" >&2
    activate "$previous"
    if ! { $RESTART_CMD && wait_healthy; }; then
      echo "!! Previous release is not healthy either" >&2
    fi
  fi
  exit 1
fi

echo "==> Pruning old releases (keeping $KEEP_RELEASES)"
current=$(readlink -f "$APP_DIR/current")
# Release names start with a UTC timestamp, so name order is age order.
find "$RELEASES" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort -r | tail -n "+$((KEEP_RELEASES + 1))" | while read -r name; do
  [ "$RELEASES/$name" = "$current" ] || rm -rf -- "${RELEASES:?}/$name"
done

echo "==> Deployed $RELEASE"
