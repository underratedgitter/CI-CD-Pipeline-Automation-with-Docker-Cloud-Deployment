# ── Stage 1: install production deps ──────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only manifest files first for better layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── Stage 2: final image ───────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Create a non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Copy production deps from stage 1
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY app.js ./

# Own files as non-root user
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "require('http').get('http://localhost:3000/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "app.js"]
