# Security Policy

## Supported versions

Only the latest released version (see [Releases](../../releases)) receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.
Use GitHub's private reporting instead: **Security → Report a vulnerability** in this repository.

Please include:

- affected version (`/api/get-config` shows it, or the badge in the UI),
- steps to reproduce,
- the impact you expect.

You will get an initial response as soon as possible. Fixes are published as a new release and noted in the
[CHANGELOG](CHANGELOG.md).

## Deployment hardening (summary)

- TechniMapper is built for **trusted home/office networks**. Do not expose it directly to the internet.
- Set `ADMIN_USER` / `ADMIN_PASSWORD` and put it behind a TLS-terminating reverse proxy
  (set `TRUST_PROXY` accordingly). Basic Auth over plain HTTP sends credentials unencrypted.
- `/playlist.m3u` and `/health` are intentionally public (Dispatcharr and container health checks).
  The playlist contains the stream URLs of your receiver.
- Receiver IPs are restricted to private IPv4 ranges (SSRF protection); loopback and link-local
  addresses are always rejected.
- Verify image signatures before deploying (see the README, section *Supply chain*).
