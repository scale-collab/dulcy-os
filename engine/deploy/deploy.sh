#!/usr/bin/env bash
# Run ON the Hetzner server, from a checkout of this repo:  bash engine/deploy/deploy.sh
# First time: copy engine/deploy/.env.example to engine/deploy/.env and fill it in.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "Missing engine/deploy/.env (copy .env.example first)"; exit 1; }
git -C ../.. pull --ff-only
docker compose up -d --build
sleep 5
curl -fsS http://127.0.0.1:8090/health && echo && echo "Engine is up."
