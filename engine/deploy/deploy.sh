#!/usr/bin/env bash
# Run ON the Hetzner server, from a checkout of this repo:  bash engine/deploy/deploy.sh
# First time: copy engine/deploy/.env.example to engine/deploy/.env and fill it in.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Missing engine/deploy/.env (copy .env.example first)"; exit 1; }
git -C ../.. pull --ff-only
# Key files go in a private folder only the engine (container user 1000) can read.
mkdir -p secrets
if [ -f google-sa.json ]; then mv google-sa.json secrets/google-sa.json; fi
chown -R 1000:1000 secrets && chmod 700 secrets && find secrets -type f -exec chmod 600 {} +
# The image build also builds Dulcy HQ's web app (hq/web) inside Docker; no Node needed on the server.
docker compose up -d --build
sleep 5
curl -fsS http://127.0.0.1:8090/health && echo && echo "Engine is up."
HQ_HOST="$(grep -E '^HQ_HOST=' .env | tail -1 | cut -d= -f2- || true)"
# HQ answers on its host name too (the app page; the API needs a login).
curl -fsS -o /dev/null -H "Host: ${HQ_HOST:-hq.dulcy.io}" http://127.0.0.1:8090/ && echo "HQ is up." || echo "HQ page not served yet (check HQ_HOST and the build)."
