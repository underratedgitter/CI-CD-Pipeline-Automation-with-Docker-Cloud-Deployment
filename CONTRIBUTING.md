# Contributing

## Setup

Node 26, Docker, and for the Kubernetes parts `kind`, `kubectl` and `helm`.

```bash
npm ci --ignore-scripts
npm run dev                     # the service on :3000
cd portfolio && npm ci --ignore-scripts && npm run dev   # the portfolio, hot-reloading
```

## Before you push

CI runs all of these on every pull request; running the relevant ones first is
faster than waiting for it.

| Changed | Run |
|---|---|
| `app.js`, `tests/` | `npm run lint && npm test` |
| `Dockerfile`, anything served | `docker build -t pipeline-app:local . && bash tests/smoke.sh pipeline-app:local` |
| The portfolio, or response headers | start the image on :3999, then `bash tests/browser/csp-check.sh http://127.0.0.1:3999` |
| `prometheus/` | `docker run --rm --entrypoint promtool -v "$PWD/prometheus:/p" -w /p prom/prometheus:v3.15.0 test rules tests/alert_rules_test.yml` |
| `deploy/` | `make -C deploy up` (kind cluster, install, `helm test`, zero-downtime rollout) |
| `.github/workflows/` | `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.12` |

A fix for a bug comes with a test that fails without the fix.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`ci:`, `docs:`, `refactor:`, `chore:`. The subject says what changes; the body
says why, and what was checked.

## Pull requests

Fill in the template: what changes, how it was verified, and what could break.
Nothing reaches a registry or a deployment from a pull request; only a merge to
`main` publishes and deploys, after every check has passed.

## Security issues

Not in a public issue or pull request; see [SECURITY.md](SECURITY.md).
