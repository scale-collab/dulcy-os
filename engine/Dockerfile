# Built from the repo root (see deploy/docker-compose.yml: context ../.., dockerfile engine/Dockerfile),
# so the image also holds Dulcy HQ's web app (hq/web), served by the engine at /hq and on HQ_HOST.

# 1. HQ web app → static files.
FROM node:22-slim AS web
WORKDIR /web
COPY hq/web/package.json hq/web/package-lock.json ./
RUN npm ci
COPY hq/web/ ./
RUN npm run build

# 2. Engine.
FROM node:22-slim AS build
WORKDIR /app
COPY engine/package.json engine/package-lock.json engine/tsconfig.json ./
RUN npm ci
COPY engine/src ./src
COPY engine/test ./test
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HQ_WEB_DIR=/app/hq-web
COPY engine/package.json engine/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY engine/src/db/schema.sql ./src/db/schema.sql
COPY --from=web /web/dist ./hq-web
USER node
EXPOSE 8080
CMD ["node", "dist/src/main.js"]
