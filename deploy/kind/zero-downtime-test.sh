#!/usr/bin/env bash
# Proves the rollout settings do what they claim: requests keep succeeding
# while every pod is replaced. A client pod inside the cluster calls the
# Service continuously (through kube-proxy, as real traffic would) during a
# `rollout restart`, and any failed request fails the test.
#
# Not port-forward: it pins one pod and breaks when that pod terminates.
#
#   bash deploy/kind/zero-downtime-test.sh [namespace] [release]
set -euo pipefail

namespace=${1:-pipeline}
release=${2:-pipeline-app}
probe="zero-downtime-probe"
duration=75   # seconds of traffic; the rollout must finish inside it

cleanup() { kubectl -n "$namespace" delete pod "$probe" --ignore-not-found --wait=false >/dev/null 2>&1 || true; }
trap cleanup EXIT

service=$(kubectl -n "$namespace" get svc -l "app.kubernetes.io/instance=$release" -o jsonpath='{.items[0].metadata.name}')
port=$(kubectl -n "$namespace" get svc "$service" -o jsonpath='{.spec.ports[0].port}')
url="http://$service:$port/health"   # /health is exempt from the rate limit

cleanup
kubectl -n "$namespace" wait --for=delete pod/"$probe" --timeout=60s >/dev/null 2>&1 || true

# Ten requests a second for $DURATION seconds; prints one summary line. The
# \$ are for the shell inside the pod, not this one.
kubectl -n "$namespace" apply -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: $probe
spec:
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: 65534
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: probe
      image: busybox:1.36
      env:
        - name: URL
          value: "$url"
        - name: DURATION
          value: "$duration"
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: [ALL]
      command:
        - sh
        - -c
        - |
          end=\$(( \$(date +%s) + DURATION )); ok=0; failed=0
          while [ "\$(date +%s)" -lt "\$end" ]; do
            if wget -q -T 2 -O /dev/null "\$URL"; then ok=\$((ok + 1))
            else failed=\$((failed + 1)); echo "failed at \$(date +%T)"; fi
            sleep 0.1
          done
          echo "ok=\$ok failed=\$failed"
EOF

kubectl -n "$namespace" wait --for=condition=Ready pod/"$probe" --timeout=60s >/dev/null
sleep 5   # a baseline of traffic before anything changes

echo "Rolling every pod of deploy/$release while traffic runs..."
kubectl -n "$namespace" rollout restart deploy/"$release" >/dev/null
kubectl -n "$namespace" rollout status deploy/"$release" --timeout="$((duration - 10))s"

kubectl -n "$namespace" wait --for=jsonpath='{.status.phase}'=Succeeded pod/"$probe" --timeout="$((duration + 30))s" >/dev/null
result=$(kubectl -n "$namespace" logs "$probe")
echo "$result"

summary=$(printf '%s\n' "$result" | tail -n 1)
ok=$(printf '%s' "$summary" | sed -n 's/^ok=\([0-9]*\) failed=[0-9]*$/\1/p')
failed=$(printf '%s' "$summary" | sed -n 's/^ok=[0-9]* failed=\([0-9]*\)$/\1/p')
[ -n "$ok" ] && [ -n "$failed" ] || { echo "FAIL: could not read the probe's summary"; exit 1; }
[ "$ok" -gt 0 ] || { echo "FAIL: no request succeeded"; exit 1; }
[ "$failed" -eq 0 ] || { echo "FAIL: $failed of $((ok + failed)) requests failed during the rollout"; exit 1; }
echo "Zero downtime: $ok requests, none failed, across a full rollout."
