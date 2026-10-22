# ── Stage 1: install production deps ──────────────────────────────────────────
FROM node:26-alpine AS deps

WORKDIR /app

# Copy only manifest files first for better layer caching
COPY package.json package-lock.json* ./

# Production dependencies only. --ignore-scripts: install scripts are how a
# compromised package runs code at build time, and nothing here needs one.
RUN npm ci --omit=dev --ignore-scripts

# ── Stage 2: build the portfolio (static site) ─────────────────────────────────
FROM node:26-alpine AS portfolio

WORKDIR /portfolio

COPY portfolio/package.json portfolio/package-lock.json ./
RUN npm ci --ignore-scripts

COPY portfolio/ ./
RUN npm run build

# ── Stage 3: final image ───────────────────────────────────────────────────────
FROM node:26-alpine

ENV NODE_ENV=production

WORKDIR /app

# A numeric user, so Kubernetes can enforce runAsNonRoot: the kubelet cannot
# read a name like "appuser" out of the image and refuses to start the pod.
# Above 10000 so it never matches a real account on the host.
#
# npm, npx, corepack and yarn are package managers. Nothing at runtime calls
# them, and they bring their own dependency trees, and those trees' CVEs.
RUN addgroup -S -g 10001 app \
 && adduser -S -D -H -u 10001 -G app app \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Owned by root and only readable by the app user, so a compromised process
# cannot rewrite its own code.
COPY --from=deps /app/node_modules ./node_modules
COPY app.js package.json ./
# Only the built site; the portfolio's toolchain stays in its build stage
COPY --from=portfolio /portfolio/dist ./portfolio/dist

# The commit this image was built from, reported at /info. Late in the file
# because it changes on every build and would invalidate every layer after it.
ARG REVISION=unknown
ENV REVISION=${REVISION}

USER 10001:10001

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', r => { process.exit(r.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

CMD ["node", "app.js"]
