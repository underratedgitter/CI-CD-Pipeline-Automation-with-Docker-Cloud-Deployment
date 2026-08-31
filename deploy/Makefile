# Local Kubernetes for this chart. Run from the repository root:
#   make -C deploy up
#
# Needs kind, kubectl and helm. Nothing here touches a cloud account.

CLUSTER  := pipeline
NAMESPACE:= pipeline
RELEASE  := pipeline-app
CHART    := helm/pipeline-app
IMAGE    := ghcr.io/underratedgitter/ci-cd-pipeline-app
TAG      := dev

.PHONY: up down cluster ingress image install test lint template status logs

up: cluster ingress image install test status

cluster:
	kind get clusters | grep -qx $(CLUSTER) || kind create cluster --config kind/cluster.yaml
	kubectl config use-context kind-$(CLUSTER)

ingress:
	kubectl apply -f https://raw.githubusercontent.com/kubernetes-sigs/ingress-nginx/controller-v1.11.2/deploy/static/provider/kind/deploy.yaml
	kubectl -n ingress-nginx wait --for=condition=ready pod \
		--selector=app.kubernetes.io/component=controller --timeout=180s

# Build from the repository root and load straight into the cluster's container
# runtime — no registry, no push, no credentials for a local loop.
image:
	docker build -t $(IMAGE):$(TAG) ..
	kind load docker-image $(IMAGE):$(TAG) --name $(CLUSTER)

install:
	kubectl get namespace $(NAMESPACE) >/dev/null 2>&1 || kubectl create namespace $(NAMESPACE)
	helm upgrade --install $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--set image.repository=$(IMAGE) \
		--set image.tag=$(TAG) \
		--set image.pullPolicy=Never \
		--wait --timeout 5m

test:
	helm test $(RELEASE) --namespace $(NAMESPACE) --logs

lint:
	helm lint $(CHART) --strict
	helm lint $(CHART) --strict --values $(CHART)/values-prod.yaml

# Renders with every optional object switched on, so the CRD-gated templates are
# checked too rather than being skipped by the defaults.
template:
	helm template $(RELEASE) $(CHART) \
		--namespace $(NAMESPACE) \
		--set monitoring.serviceMonitor.enabled=true \
		--set monitoring.prometheusRule.enabled=true \
		--set networkPolicy.enabled=true \
		--set secretEnv.EXAMPLE=value

status:
	@kubectl -n $(NAMESPACE) get deploy,pod,svc,ingress,hpa,pdb -o wide
	@echo
	@echo "Reachable at http://pipeline-app.localtest.me:8080"

logs:
	kubectl -n $(NAMESPACE) logs -l app.kubernetes.io/instance=$(RELEASE) --tail=100 -f

down:
	kind delete cluster --name $(CLUSTER)
