# CI/CD Pipeline Automation with Docker & Cloud Deployment `| In Progress`

> 🚧 This project is currently **in progress** — actively being built and refined.

---

## Overview

A production-grade CI/CD pipeline that automates the full software delivery lifecycle — from code push to cloud deployment — using GitHub Actions, Docker, and Oracle Cloud Infrastructure.

---

## Highlights

- Built and containerised a Node.js/Express REST API using a multi-stage Alpine Dockerfile (non-root user, layer caching) and validated it with **Jest + Supertest** automated tests

- Engineered a **3-stage GitHub Actions pipeline** (Test → Docker Hub Push → OCI SSH Deploy) that ships code to production on every `main` push in under **5 minutes**

- Secured the pipeline with **GitHub Encrypted Secrets** for zero hardcoded credentials; images tagged with **commit SHA** for full rollback traceability

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js / Express |
| Containerisation | Docker (multi-stage Alpine) |
| Testing | Jest + Supertest |
| CI/CD | GitHub Actions |
| Registry | Docker Hub |
| Cloud | Oracle Cloud Infrastructure (OCI) |

---

## Pipeline Architecture

```
Push to main
     │
     ▼
┌─────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│  1. Test    │────▶│  2. Build & Push      │────▶│  3. Deploy to OCI VM  │
│  Jest Suite │     │  Docker Hub (SHA tag)  │     │  SSH + docker run     │
└─────────────┘     └───────────────────────┘     └───────────────────────┘
```

---

## Getting Started (Local)

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run with Docker
docker-compose up
```
