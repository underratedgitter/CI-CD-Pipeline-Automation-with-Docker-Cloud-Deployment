# CI/CD Pipeline Automation

A small Node service used as a vehicle for the parts around it: a four-stage GitHub Actions pipeline, a hardened multi-stage Docker image, Prometheus instrumentation and Grafana dashboards, and eight alert rules that fire on the things that actually page someone.

Code push to a running cloud deployment in under five minutes.

---

## The pipeline

`.github/workflows/pipeline.yml` runs four jobs. The first two gate the rest.

| Job | Does | Blocks on failure |
|---|---|---|
| **Lint & Test** | ESLint, then Jest with coverage | yes |
| **Security Audit** | `npm audit` against the dependency tree | yes |
| **Build & Push** | Buildx build, push to Docker Hub, then **Trivy** scans the built image for vulnerabilities | push events only |
| **Deploy** | Ships to Render | push events only |

Pull requests run the first two jobs and stop there — nothing unreviewed reaches a registry or a deployment.

Two secrets are needed: `DOCKER_USERNAME` and `DOCKER_PASSWORD`, plus whatever Render needs for the deploy hook.

---

## The image

Two stages, so build tooling never reaches the final layer:

```dockerfile
FROM node:20-alpine AS deps      # npm ci --omit=dev
FROM node:20-alpine              # copies only node_modules + source
```

Manifests are copied before source so a code change doesn't invalidate the dependency layer. The container runs as an unprivileged `appuser`, not root, and carries a `HEALTHCHECK` that polls `/health` every 30 seconds — so an unhealthy container is visible to Docker and to any orchestrator above it.

---

## Instrumentation

Five metrics, exported at `/metrics` in Prometheus format via `prom-client`:

| Metric | Type | Answers |
|---|---|---|
| `http_requests_total` | Counter | throughput, by route and status |
| `http_request_duration_seconds` | Histogram | latency distribution, so p99 is real rather than an average |
| `http_requests_in_progress` | Gauge | concurrency right now |
| `http_errors_total` | Counter | error rate |
| `nodejs_app_info` | Gauge | version and environment, for correlating a spike with a deploy |

Node's default process metrics — heap, RSS, event-loop lag, GC — come along with them.

### Alerts

`prometheus/alert_rules.yml`, eight rules:

| Alert | Severity |
|---|---|
| `AppDown` | critical |
| `HighErrorRate` | critical |
| `HighClientErrorRate` | warning |
| `HighLatencyP99` | warning |
| `HighHeapUsage` | warning |
| `HighMemoryRSS` | warning |
| `HighEventLoopLag` | warning |
| `LowRequestRate` | info |

Each carries a `for:` duration, so a single scrape blip doesn't page anyone. `LowRequestRate` is the one people forget: traffic falling off a cliff usually means something upstream broke, and no error-rate alert will catch it.

---

## Endpoints

| Route | Returns |
|---|---|
| `GET /` | service name, version, environment |
| `GET /health` | liveness, with uptime and memory |
| `GET /ready` | readiness, for orchestrator gating |
| `GET /metrics` | Prometheus exposition format |
| `GET /info` | build and runtime detail |

`/health`, `/ready` and `/metrics` are deliberately exempt from rate limiting — a limiter that throttles your own health checks turns a traffic spike into an outage.

Rate limiting is a fixed window, 100 requests per minute per IP by default, tunable with `RATE_LIMIT_MAX`.

---

## Running it

```bash
npm install
npm run dev          # node --watch
npm test             # jest, 20 tests, with coverage
npm run lint
```

The whole stack — app, Prometheus and Grafana on a shared network:

```bash
npm run docker:up    # builds, starts, opens all three
npm run docker:down
```

| Service | URL |
|---|---|
| App | http://localhost:3000 |
| Prometheus | http://localhost:9090 |
| Grafana | http://localhost:3001 |

Grafana provisions its datasource and the `nodejs-overview` dashboard automatically — no manual setup after first boot.

### Generating load

Dashboards are meaningless against zero traffic:

```bash
npm run traffic
```

Drives requests at the service so the histograms fill, the gauges move, and the alert thresholds can actually be exercised.

---

## Layout

```
app.js                        service, metrics, rate limiting
traffic-gen.js                load generator for the dashboards
Dockerfile                    multi-stage, non-root, healthcheck
docker-compose.yml            app + prometheus + grafana
prometheus/
  prometheus.yml              scrape config
  alert_rules.yml             eight rules
grafana/
  provisioning/               datasource + dashboard auto-config
  dashboards/                 nodejs-overview
.github/workflows/pipeline.yml
render.yaml                   deploy target
tests/app.test.js             20 tests
```
