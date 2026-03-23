# Stage 1 — Build the ATS widget component
FROM oven/bun:1 AS build-widget

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY src/ src/
COPY rollup.config.js tsconfig.json ./
RUN bun run build

# Stage 2 — Build the Nuxt app
FROM oven/bun:1 AS build-app

WORKDIR /app/demo-musicdash

COPY demo-musicdash/package.json demo-musicdash/bun.lock ./
RUN bun install --frozen-lockfile

COPY demo-musicdash/ .
COPY --from=build-widget /app/dist/ /app/dist/

RUN bun run build

# Stage 3 — Runtime
FROM oven/bun:1-slim

WORKDIR /app/demo-musicdash

COPY --from=build-app /app/demo-musicdash/.output/ .output/
COPY --from=build-widget /app/dist/ /app/dist/

EXPOSE 3000

CMD ["bun", "run", ".output/server/index.mjs"]
