# RAVANA: public package and personal deployment

## Public fork experience

The GitHub Pages site is a download portal. Each successful `main` workflow packages the checked-in source as `downloads/ravana-source.zip`; the archive is generated from the exact commit shown on the portal. The Pages artifact does not publish the built HUD or run an API, worker, database, or model provider.

This is a product boundary, not source access control. Because the GitHub repository is public, visitors can still inspect, clone, and fork its source. A ZIP download portal cannot restrict those GitHub capabilities. Do not store personal credentials, data, or private deployment configuration in this repository. The source package includes the shared project and `.env.example`, never a populated `.env` or runtime data.

## Personal full-stack direction

Keep personal use in a separate private deployment and keep the public Pages artifact static. The current Express server deliberately binds to loopback and has no user authentication or tenant isolation. Do not change it to `0.0.0.0` or expose it through a public reverse proxy until the security and persistence gates below exist.

For a personal always-on experiment, an ARM VM can run Docker Compose with the Node API, PostgreSQL, a separate scheduler/worker process, and a TLS reverse proxy. Oracle's current Always Free documentation describes a combined allowance equivalent to 2 OCPUs and 12 GB RAM for A1 compute, not 4 OCPUs/24 GB; capacity depends on the home region, and Oracle may reclaim instances it considers idle. Treat it as a constrained personal host, not a production SLA. A managed Postgres free plan is useful for development, but review inactivity, storage, backup, and expiry terms before using it as the only copy of durable state.

## Gates before any public API deployment

1. Add an authentication layer and enforce a single-user or tenant identity on every stateful route.
2. Move tasks, memories, reviews, receipts, and job state behind a versioned PostgreSQL schema and migrations; do not share JSON files across multiple server instances.
3. Authenticate WebSockets with short-lived, single-use tickets and verify the authenticated identity for the lifetime of each connection.
4. Run scheduled memory work in a durable worker with idempotency, retry limits, and observable job state; do not rely on `setInterval` inside the web process.
5. Add rate limits, request-size limits, secret rotation, backups and restore drills, structured audit logs, and health/readiness checks.
6. Prove user isolation, origin policy, restart recovery, database migration, and worker retry behavior in CI before enabling remote access.

## Free-tier reality check (checked 2026-10-19)

- Render says its free Postgres has 1 GB storage and expires after 30 days; it is not a durable free database for this use.
- Supabase Free includes a 500 MB database and pauses projects after one week of inactivity; this is suitable for a prototype with that lifecycle accepted.
- Neon Free scales compute to zero when idle and currently meters a monthly compute allowance; it suits development and intermittent use, not a guaranteed always-on database.
- OCI's Always Free A1 allowance is materially below the 4 OCPU/24 GB claim sometimes repeated online, and idle instances may be reclaimed.

Free-tier limits change. Check the linked provider terms before provisioning and set budget alerts where available. None of these options makes the existing local-only Express server safe for public access by itself.
