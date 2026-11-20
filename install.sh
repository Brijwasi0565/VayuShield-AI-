#!/usr/bin/env bash
# VayuShield AI - one-step installer for macOS and Linux.
#
# Usage:
#   ./install.sh              install, build and start the app (http://localhost:3000)
#   ./install.sh --no-start   install and build only
#   ./install.sh --dev        install and start in development mode
set -euo pipefail

cd "$(dirname "$0")"

START=1
MODE=prod
for arg in "$@"; do
  case "$arg" in
    --no-start) START=0 ;;
    --dev) MODE=dev ;;
    -h|--help)
      sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

say() { printf '\n==> %s\n' "$1"; }
fail() { printf '\n[ERROR] %s\n' "$1" >&2; exit 1; }

say "VayuShield AI installer"

command -v node >/dev/null 2>&1 || fail "Node.js is not installed.
Install Node.js 20 or newer (22 LTS recommended) from https://nodejs.org/ and run this script again.
  macOS (Homebrew): brew install node
  Ubuntu/Debian:    https://nodejs.org/en/download"
command -v npm >/dev/null 2>&1 || fail "npm was not found. Reinstall Node.js from https://nodejs.org/"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  fail "Node.js $(node -v) is too old. Please install Node.js 20 or newer."
fi
echo "Node.js $(node -v) and npm $(npm -v) found."

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example (no API keys are needed for the core features)."
fi

say "Installing dependencies (first run can take a minute)"
if [ -f package-lock.json ]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
else
  npm install --no-audit --no-fund
fi

if [ "$MODE" = "prod" ]; then
  say "Building the app"
  npm run build
fi

if [ "$START" -eq 0 ]; then
  say "Done. Start it later with: npm start   (or: npm run dev)"
  exit 0
fi

say "Starting VayuShield AI at http://localhost:${PORT:-3000}  (press Ctrl+C to stop)"
if [ "$MODE" = "dev" ]; then
  exec npm run dev
else
  exec npm start
fi
