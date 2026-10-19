# Hosting scope — 19 October 2026

Only Google Cloud project tough-melody-508008-p8 (google-hackathon) is authorized for supporting hosting. Region us-central1 is preferred; planned service name cluekeeper. Project access and billing enabled status are verified. This does not authorize new paid charges. No service, identity, secret or data store for ClueKeeper has been created.

Use explicit project/region flags. Preserve existing services audiencegraph-web, greenlight and production-control-0909-01a085, their data and identities. Use this application's own identity, secrets and data; never borrow Greenlight's database or existing build buckets. No new cloud project, Cloud SQL, Firebase Authentication or purchased domain is needed by default.

The local SQLite release is preserved. The asynchronous GCS adapter now supplies a Cloud Run persistence option with absolute seven-day expiry and guarded concurrent updates; see [Cloud Run configuration](cloud-run.md). Do not place SQLite on ephemeral Cloud Run storage or Storage FUSE. Public deployment and verified functionality are required for the current release milestone. Local transport tests do not count as live bucket, HTTPS or provider evidence. Optional AWS Builder needs genuine documented AWS integration.

The portfolio runbook and exact resource allocation are in core-research/configuration/GCP_DEPLOYMENT_RUNBOOK.md and gcp-service-allocation.json. Recheck names and record commit/image/URL/rollback before deployment. Build/test locally while access or spending gates remain.
