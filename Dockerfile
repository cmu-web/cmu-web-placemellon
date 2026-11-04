# The project's only Node version. Pinned by digest (multi-platform index);
# Dependabot proposes updates.
FROM docker.io/library/node:26-bookworm-slim@sha256:bc0a2afd3b74ce12222fc8bab99271e66257f021078f5f4a5d687a77d280c1d9 AS base
RUN npm install --global npm@12.2.1
RUN apt-get update \
    && apt-get install -y --no-install-recommends fontconfig fonts-open-sans \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
EXPOSE 3000

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS development
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/* \
    && chown -R node:node /app
USER node
CMD ["sleep", "infinity"]

# Runs every check (npm run check) with the image's own Node and npm; CI
# builds this stage
FROM dependencies AS test
COPY . .
RUN npm run check

FROM dependencies AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS production-dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM base AS production
ENV NODE_ENV=production
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY assets ./assets
COPY docs ./docs
USER node
# /healthz is 503 until the photo list has loaded. No curl in this image, so
# the check uses Node. Podman ignores HEALTHCHECK in OCI-format images; in a
# Quadlet unit use HealthCmd= with the same command.
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD ["node", "-e", "fetch('http://localhost:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/index.js"]
