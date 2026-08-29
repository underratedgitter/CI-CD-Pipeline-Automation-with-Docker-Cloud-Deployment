# ── Stage 1: install production deps ──────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

# Copy only manifest files first for better layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# ── Stage 2: final image ───────────────────────────────────────────────────────
FROM node:20-alpine

# Add labels for better image metadata
LABEL maintainer="underratedgitter"
LABEL description="CI/CD Pipeline Automation - Production Ready Node.js App"

WORKDIR /app

# Create a non-root user with explicit UID/GID
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

# Copy production deps from stage 1
COPY --from=deps --chown=appuser:appgroup /app/node_modules ./node_modules

# Copy application source
COPY --chown=appuser:appgroup app.js ./

# Copy package.json for version info
COPY --chown=appuser:appgroup package.json ./

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "app.js"]
