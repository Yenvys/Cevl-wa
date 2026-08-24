# ============================
# Cevl WhatsApp Bot — Dockerfile
# Multi-stage build for production
# ============================

# Stage 1: Build native dependencies
FROM node:22-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Stage 2: Production image
FROM node:22-slim

# Install runtime dependencies (ffmpeg, chromium for puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    chromium \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer config
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production

WORKDIR /app

# Copy built node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p data/tmp data/db data/db/backups data/logs

# Run as non-root user
RUN groupadd -r botuser && useradd -r -g botuser -d /app botuser \
    && chown -R botuser:botuser /app
USER botuser

# Health check — verifikasi proses Node masih jalan
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD node -e "process.exit(0)" || exit 1

CMD ["node", "main.js"]
