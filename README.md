# CI/CD Pipeline Automation

A small Node service used as a vehicle for the parts around it: a GitHub Actions pipeline that gates, builds, scans and deploys; a hardened multi-stage Docker image; Prometheus instrumentation and Grafana dashboards; a Helm chart that runs the whole thing on Kubernetes; and alert rules that fire on the things that actually page someone.

Code push to a running cloud deployment in under five minutes.

---

## The pipeline

`.github/workflows/pipeline.yml`. The first three jobs gate the rest.

| Job | Does | Blocks on failure |
|---|---|---|
| **Lint & Test** | ESLint, then Jest with coverage thresholds | yes |
| **Security Audit** | `npm audit` against the dependency tree | yes |
| **Lint & Validate Chart** | `helm lint` on both value sets, then renders the chart and checks it against the real Kubernetes API schemas with `kubeconform`, then a Trivy config scan | yes |
| **Build & Push** | Buildx build, push to GHCR, **Trivy** scans the pushed image *by digest* | push events only |
| **Deploy to Kubernetes** | `helm upgrade --install --atomic` at the built digest, then `helm test` | push events, if a cluster is configured |
| **Deploy to Render** | Deploy hook, then polls `/health` until it answers | push events, if the hook is configured |

Pull requests run the gates and stop — nothing unreviewed reaches a registry or a
deployment.

Nothing has to be configured for the pipeline to pass. GHCR authenticates with
the token the workflow already holds, so there is no registry secret at all; the
two deploy jobs check for their credentials in a `guard` job and skip themselves
when a fork or a fresh clone does not have them.

| Configured with | Enables |
|---|---|
| *(nothing)* | gates, build, push to GHCR, image scan |
| `KUBE_CONFIG` (base64 kubeconfig) | the Kubernetes deploy |
| `RENDER_DEPLOY_HOOK_URL` | the Render deploy |
| `DOCKER_USERNAME` / `DOCKER_PASSWORD` | an additional Docker Hub push |

A few details that are deliberate rather than incidental:

- **The image is scanned and deployed by digest, not by tag.** A tag is a pointer
  that can move between the scan and the deploy. The digest is the artefact that
  was actually tested.
- **`--atomic` on the upgrade.** If the new pods never pass readiness, Helm rolls
  back and the previous version keeps serving, rather than leaving the release
  half-applied.
- **Actions are pinned to releases.** `aquasecurity/trivy-action@0.28.0`, not
  `@master` — a floating reference runs whatever is upstream at the moment the
  job starts, which is somebody else's `main` branch with write access to the run.

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

## Kubernetes

`deploy/helm/pipeline-app` is the chart. It renders twelve objects: Deployment,
Service, Ingress, HPA, PodDisruptionBudget, ServiceAccount, ConfigMap, Secret,
NetworkPolicy, ServiceMonitor, PrometheusRule, and a `helm test` pod that curls
`/health`, `/ready` and `/metrics` and fails the release if any of them is wrong.

```bash
make -C deploy up      # kind cluster, ingress, build, load, install, test
make -C deploy status
make -C deploy down
```

The kind cluster is three nodes rather than one, so the topology spread
constraint and the disruption budget are actually exercised. On a single node
both are satisfied trivially and prove nothing.

### The parts worth explaining

**`/ready` returns 503 while draining.** It used to return 200 unconditionally,
which made the graceful shutdown decorative — the process closed its listener
politely while the Service kept routing new requests to it. The SIGTERM handler
now flips a flag that readiness reads, so the endpoint is withdrawn first.
`/health` deliberately keeps returning 200 during the drain: a liveness failure
would have the kubelet SIGKILL the pod part-way through, which is the opposite of
what a graceful shutdown is for.

**A `preStop` sleep of five seconds.** The kubelet sends SIGTERM without waiting
for kube-proxy to finish removing the endpoint on every node. Those two race, and
without the pause a slice of requests is routed to a pod that has already started
shutting down.

**A startup probe, so the liveness probe can be strict.** Node with a cold module
cache takes a few seconds. Without a startup probe, the liveness probe has to be
slack enough to tolerate that on every check for the life of the pod — which is
how liveness probes end up never detecting anything.

**Hard memory limit, no CPU limit.** Memory is not compressible; over the limit
something gets killed, so the limit is the safety net. CPU is compressible, and a
limit throttles the container at its quota even when the node is idle — latency
the dashboards cannot explain.

**Read-only root filesystem**, `runAsNonRoot`, all capabilities dropped,
`RuntimeDefault` seccomp, and the service account token not mounted, because the
app never calls the Kubernetes API. The Dockerfile already runs as a non-root
user; this enforces it at admission rather than trusting the image.

**The alert rules move too, and change.** `deploy/helm/pipeline-app/templates/prometheusrule.yaml`
carries the Compose-era rules plus what Kubernetes adds — crash-looping, HPA
pinned at max replicas — and two of them are rewritten for the new environment:

- `AppDown` became `absent(up{...} == 1)`. `up == 0` cannot fire on a total
  outage, because when the last pod goes away the series stops existing rather
  than reporting zero. That is exactly the case the alert is for.
- `HighMemoryRSS > 200MB` became working set over the container's memory *limit*.
  A fixed byte threshold means nothing once the scheduler owns the limit; what
  matters is proximity to the number the OOM killer uses.

### Deploying to a real cluster

Base64 a kubeconfig into `KUBE_CONFIG`, set `K8S_NAMESPACE` and `APP_URL` as
repository variables, and the pipeline takes it from there. Infrastructure to run
it on — VPC, cluster, load balancer, registry, IAM — is Terraform in
[terraform-aws-ecs-platform](https://github.com/underratedgitter/terraform-aws-ecs-platform).

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
deploy/
  helm/pipeline-app/          the chart: 12 objects, two value sets
  kind/cluster.yaml           3-node local cluster
  Makefile                    up / test / lint / template / down
.github/workflows/pipeline.yml
render.yaml                   deploy target
tests/app.test.js             23 tests
```
