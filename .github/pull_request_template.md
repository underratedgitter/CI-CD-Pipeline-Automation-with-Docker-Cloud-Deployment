## What and why

<!-- What changes, and the problem it solves. Link an issue if there is one. -->

## How it was verified

<!-- What you ran and what you saw. CI runs everything below; say which you also ran locally. -->

- [ ] `npm run lint` and `npm test`
- [ ] `docker build -t pipeline-app:local . && bash tests/smoke.sh pipeline-app:local`
- [ ] Alert rule changes: `promtool test rules prometheus/tests/alert_rules_test.yml`
- [ ] Chart changes: `make -C deploy up` (kind, `helm test`, zero-downtime rollout)

## Risk

<!-- What could break, and how it would show up (alert, failed check, user report). -->
