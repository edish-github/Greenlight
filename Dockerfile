# =============================================================================
# Greenlight
# =============================================================================
# Debian slim rather than Alpine on purpose. Alpine is musl, and the static
# ffmpeg and ffprobe builds that ship inside ffmpeg-static / ffprobe-static are
# glibc binaries: they install fine and then fail at spawn time with a confusing
# "not found" that is really a missing loader. Debian slim costs about 40MB more
# and removes a whole category of demo-day surprise.
#
# The distro ffmpeg is installed as well, so the container works even if the
# node_modules binaries are ever pruned.
# =============================================================================

# --- deps --------------------------------------------------------------------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- build -------------------------------------------------------------------
FROM node:20-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build must not need real keys. Everything key-dependent is checked at the
# point of use, not at import, which is exactly what makes this line safe.
RUN npm run build

# --- runtime -----------------------------------------------------------------
FROM node:20-bookworm-slim AS runner
WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    GREENLIGHT_DATA_DIR=/data/scans

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/.next        ./.next
COPY --from=builder /app/public       ./public
COPY --from=builder /app/src          ./src
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.ts ./next.config.ts

# src/ is copied because the policy pack and the lexicons are runtime DATA, not
# build artifacts. Leaving them out produces a container that boots and then
# fails on the first scan with "policy pack not found", which is a bad way to
# discover this at 2am.

# Scan artifacts are the only mutable state. Mount a volume here to keep
# corrected files across restarts; the app is otherwise stateless.
RUN mkdir -p /data/scans && chown -R node:node /data
VOLUME ["/data"]

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
