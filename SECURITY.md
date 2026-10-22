# Security policy

## Reporting a vulnerability

Please report privately, not in a public issue:
**[open a private security advisory](https://github.com/underratedgitter/CI-CD-Pipeline-Automation-with-Docker-Cloud-Deployment/security/advisories/new)**.

Include what you found, how to reproduce it, and what an attacker could do
with it. Every report gets a reply, and credit in the published advisory unless
you would rather not be named.

## Supported versions

Only `main` and the image it publishes (`ghcr.io/underratedgitter/ci-cd-pipeline-app:latest`)
are supported. Fixes are not backported to older images.

## Scope

In scope: the application (`app.js`), the container image, the Helm chart, the
GitHub Actions workflows, and the deployed service at
`ci-cd-pipeline-automation-app.onrender.com`.

Out of scope: denial of service by volume against the free-tier demo, findings
that need a compromised GitHub or Render account, and vulnerabilities in
dependencies that have no fix released yet (those are tracked automatically).

## Verifying what you run

Every published image carries signed build provenance and an SBOM, made by the
pipeline with keyless Sigstore signing. To confirm an image was built by this
repository's workflow from a specific commit:

```bash
gh attestation verify oci://ghcr.io/underratedgitter/ci-cd-pipeline-app:latest \
  --owner underratedgitter
```

## What protects this repository

- Dependencies: Dependabot for actions, npm and Docker (with a cooldown on new
  releases), `npm audit` and `npm audit signatures` in CI, installs with
  `--ignore-scripts`.
- Code: CodeQL (`security-extended`) on the JavaScript and on the workflows.
- Image: Trivy blocks fixable HIGH and CRITICAL findings before anything is
  published; the published image's scan is in the Security tab.
- Workflows: actions pinned to commit SHAs, least-privilege tokens per job,
  linted with actionlint and zizmor on every change.
- Posture: OpenSSF Scorecard, published weekly.
