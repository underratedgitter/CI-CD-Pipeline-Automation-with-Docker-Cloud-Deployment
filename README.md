<div align="center">

# 🚀 CI/CD Pipeline Automation
### with Docker & Cloud Deployment

*A production-grade DevOps pipeline — from code push to cloud in under 5 minutes*

<br/>

![CI/CD Pipeline](https://img.shields.io/github/actions/workflow/status/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment/pipeline.yml?branch=main&style=for-the-badge&logo=github-actions&logoColor=white&label=CI%2FCD%20Pipeline)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Alpine-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Prometheus](https://img.shields.io/badge/Prometheus-Monitoring-E6522C?style=for-the-badge&logo=prometheus&logoColor=white)
![Grafana](https://img.shields.io/badge/Grafana-Dashboard-F46800?style=for-the-badge&logo=grafana&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

<br/>

[![Last Commit](https://img.shields.io/github/last-commit/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment?style=flat-square&color=purple)](https://github.com/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment/commits/main)
[![Repo Size](https://img.shields.io/github/repo-size/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment?style=flat-square&color=orange)](https://github.com/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment)
[![Stars](https://img.shields.io/github/stars/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment?style=flat-square&color=yellow)](https://github.com/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment/stargazers)

</div>

---

## 📌 Overview

A **production-ready CI/CD pipeline** that automates the full software delivery lifecycle — from code push to cloud deployment — using **GitHub Actions**, **Docker**, and **Render**. Features real-time observability with **Prometheus** metrics collection and **Grafana** dashboards.

```bash
# Clone and run in 3 steps
git clone https://github.com/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment.git
cd CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment
docker-compose up --build
```

---

## ✨ Key Features

| Feature | Details |
|:---|:---|
| 🧪 **Automated Testing** | Jest + Supertest on every push |
| 🐳 **Multi-stage Docker Build** | Minimal Alpine image, non-root user, layer caching |
| 🔄 **3-Stage CI/CD Pipeline** | Test → Build & Push → Deploy (< 5 min) |
| 🔐 **Zero Hardcoded Secrets** | GitHub Encrypted Secrets throughout |
| 🏷️ **SHA-tagged Images** | Full rollback traceability |
| 📊 **Live Monitoring** | Prometheus scraping + Grafana dashboards |
| 🚨 **Alerting** | 5 alert rules for app health, errors, latency, memory |

---

## 🏗️ Architecture

```mermaid
flowchart LR
    A["👨‍💻 Developer\nGit Push"] --> B["⚙️ GitHub Actions\nCI/CD Pipeline"]

    subgraph pipeline ["🔄 3-Stage Pipeline"]
        B --> C["🧪 Stage 1\nJest Tests"]
        C --> D["🐳 Stage 2\nDocker Build & Push"]
        D --> E["☁️ Stage 3\nDeploy to Render"]
    end

    subgraph monitoring ["📊 Monitoring Stack (Local)"]
        F["🟢 Node.js App\n:3000/metrics"] -->|scrape 15s| G["🔴 Prometheus\n:9090"]
        G -->|PromQL| H["📈 Grafana\n:3001"]
    end

    E --> F
```

---

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|:---|:---|:---|
| **Runtime** | ![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white) Express.js | REST API server |
| **Testing** | ![Jest](https://img.shields.io/badge/Jest-C21325?logo=jest&logoColor=white) + Supertest | Unit & integration tests |
| **Containerisation** | ![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white) Multi-stage Alpine | Minimal, secure images |
| **CI/CD** | ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=github-actions&logoColor=white) | Automated pipeline |
| **Registry** | ![Docker Hub](https://img.shields.io/badge/Docker_Hub-2496ED?logo=docker&logoColor=white) | Image storage & versioning |
| **Cloud** | ![Render](https://img.shields.io/badge/Render-46E3B7?logo=render&logoColor=white) | Cloud deployment |
| **Metrics** | ![Prometheus](https://img.shields.io/badge/Prometheus-E6522C?logo=prometheus&logoColor=white) | Metrics collection |
| **Dashboards** | ![Grafana](https://img.shields.io/badge/Grafana-F46800?logo=grafana&logoColor=white) | Visualisation & alerting |

---

## 🔄 CI/CD Pipeline

```mermaid
flowchart TD
    push["📤 git push to main"] --> test

    subgraph test ["🧪 Stage 1 — Test"]
        t1["Checkout Code"] --> t2["Setup Node.js 20"]
        t2 --> t3["npm ci"]
        t3 --> t4["npm test\nJest + Supertest"]
    end

    test -->|✅ Pass| build

    subgraph build ["🐳 Stage 2 — Build & Push"]
        b1["Login to Docker Hub"] --> b2["Docker Buildx Setup"]
        b2 --> b3["Build multi-stage\nAlpine image"]
        b3 --> b4["Push :latest\n+ :sha tags"]
    end

    build -->|✅ Success| deploy

    subgraph deploy ["☁️ Stage 3 — Deploy"]
        d1["Trigger Render\nDeploy Hook"] --> d2["Wait 30s"]
        d2 --> d3["Health Check\n/health endpoint"]
    end

    deploy -->|✅ Live| done["🎉 App Live on Render"]
```

---

## 📊 Monitoring Stack

Real-time observability powered by **Prometheus** + **Grafana** running locally via Docker Compose.

### Grafana Dashboard — Node.js App Overview

| Row | Panels |
|:---|:---|
| 🟢 **Traffic & Throughput** | Request Rate (req/s), Status Code Breakdown, Active Requests, 5xx Count, Uptime |
| 🔴 **Latency** | P50 / P95 / P99 Response Time Percentiles |
| 🟡 **Memory & CPU** | Heap Used vs Total, RSS, CPU Usage % |
| 🔵 **Runtime Health** | Event Loop Lag, Garbage Collection Duration |

### Alert Rules

| Alert | Triggers When |
|:---|:---|
| `AppDown` | Prometheus can't reach `/metrics` |
| `HighErrorRate` | > 5% of requests return 5xx |
| `HighLatencyP99` | P99 latency > 1 second |
| `HighHeapUsage` | Heap memory > 85% full |
| `HighEventLoopLag` | Event loop lag > 100ms |

---

## 📁 Project Structure

```
📦 CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment
├── 📄 app.js                          # Express API + Prometheus instrumentation
├── 📄 package.json                    # Dependencies (prom-client, express, jest)
├── 🐳 Dockerfile                      # Multi-stage Alpine build
├── 🐳 docker-compose.yml              # App + Prometheus + Grafana stack
│
├── 🔄 .github/workflows/
│   └── pipeline.yml                   # GitHub Actions CI/CD pipeline
│
├── 📊 prometheus/
│   ├── prometheus.yml                 # Scrape config (15s interval)
│   └── alert_rules.yml               # 5 alerting rules
│
├── 📈 grafana/
│   ├── provisioning/
│   │   ├── datasources/prometheus.yml # Auto-connect to Prometheus
│   │   └── dashboards/dashboard.yml   # Dashboard provider config
│   └── dashboards/
│       └── nodejs-overview.json       # Pre-built Node.js dashboard
│
└── 🧪 tests/
    └── app.test.js                    # Jest test suite
```

---

## 🚀 Getting Started

### Prerequisites

- Node.js 20+
- Docker + Docker Compose
- Colima (Mac) or Docker Desktop

### 1. Clone & Install

```bash
git clone https://github.com/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment.git
cd CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment
npm install
```

### 2. Run Tests

```bash
npm test
```

### 3. Start Full Stack (App + Prometheus + Grafana)

```bash
# Start Docker engine (Mac with Colima)
colima start

# Build and start all containers
docker-compose up --build
```

### 4. Access Services

| Service | URL | Credentials |
|:---|:---|:---|
| 🟢 Node.js App | http://localhost:3000 | — |
| 📡 Metrics Endpoint | http://localhost:3000/metrics | — |
| 🔴 Prometheus | http://localhost:9090/targets | — |
| 📈 Grafana Dashboard | http://localhost:3001 | `admin` / `admin` |

---

## 🌐 API Endpoints

| Method | Endpoint | Description | Response |
|:---|:---|:---|:---|
| `GET` | `/` | Hello World | `{ status: "ok", message: "hello Sir" }` |
| `GET` | `/health` | Health check | `{ uptime, timestamp }` |
| `GET` | `/metrics` | Prometheus metrics | Prometheus text format |

---

## 🔐 Required GitHub Secrets

| Secret | Description |
|:---|:---|
| `DOCKER_USERNAME` | Docker Hub username |
| `DOCKER_PASSWORD` | Docker Hub access token |
| `RENDER_DEPLOY_HOOK_URL` | Render deploy hook URL |

---

## 📜 License

MIT © [Suraj Patel](https://github.com/underratedgitter)
