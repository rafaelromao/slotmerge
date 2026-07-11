# GCP Deployment Foundation

This document records the minimum Google Cloud Platform foundation for the SlotMerge MVP. It follows the hosting decision in issue #131: Cloud Run for separate `web` and `worker` services, Cloud SQL for PostgreSQL, Artifact Registry for Docker images, Secret Manager for production secrets, and GitHub Actions deploys through Workload Identity Federation.

No product behavior is introduced by this foundation. It documents names, APIs, identities, secrets, and environment variables that later implementation tickets can target.

## Environments

Use three environment tiers:

- `local`: developer machine, two local processes (`web` and `worker`), local or disposable PostgreSQL, local environment variables, and no dependency on GCP Secret Manager or public HTTPS provider webhooks.
- `staging`: GCP Cloud Run and Cloud SQL with isolated non-production data and secrets.
- `production`: GCP Cloud Run and Cloud SQL with production data, production OAuth/email credentials, and isolated secrets.

Staging and production must not share databases, encryption keys, OAuth client secrets, email delivery credentials, or webhook verification secrets. They may either use separate GCP projects or one GCP project with every resource name prefixed by the environment. Prefer separate projects when budget and administration allow it.

Recommended project IDs:

| Environment | Project ID | Notes |
| --- | --- | --- |
| `staging` | `slotmerge-staging` | Non-production deploy target; data may be reset. |
| `production` | `slotmerge-production` | Production deploy target; data is never manually reset outside backup/restore or incident response. |

Recommended primary region: `us-central1`.

Keep Artifact Registry, Cloud Run services, Cloud SQL instances, and secrets in the same project and region unless a later operations decision explicitly changes this.

## Required APIs

Enable these APIs in each GCP project before creating runtime resources:

| API | Service name | Why it is required |
| --- | --- | --- |
| Cloud Run Admin API | `run.googleapis.com` | Deploy and manage the `web` and `worker` Cloud Run services. |
| Cloud SQL Admin API | `sqladmin.googleapis.com` | Create and manage PostgreSQL instances. |
| Artifact Registry API | `artifactregistry.googleapis.com` | Store Docker images used by Cloud Run. |
| Secret Manager API | `secretmanager.googleapis.com` | Store runtime secrets injected into Cloud Run. |
| IAM API | `iam.googleapis.com` | Manage deploy and runtime service accounts. |
| IAM Service Account Credentials API | `iamcredentials.googleapis.com` | Allow GitHub Actions to impersonate deploy service accounts. |
| Security Token Service API | `sts.googleapis.com` | Support Workload Identity Federation from GitHub Actions. |
| Cloud Logging API | `logging.googleapis.com` | Receive pino JSON stdout logs from Cloud Run. |
| Cloud Monitoring API | `monitoring.googleapis.com` | Use Cloud Run and Cloud SQL metrics and alerting. |

Enable them non-interactively with:

```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com \
  --project "$GCP_PROJECT_ID"
```

## Service Accounts And Identity

Use separate deploy and runtime identities. Do not use long-lived JSON service account keys for CI/CD.

| Identity | Recommended name | Used by | Purpose |
| --- | --- | --- | --- |
| GitHub deploy service account | `slotmerge-github-deployer` | GitHub Actions via Workload Identity Federation | Builds/pushes images and deploys Cloud Run services. |
| Web runtime service account | `slotmerge-web-runtime` | Cloud Run `web` service | Reads only the secrets and Cloud SQL resources required by the web process. |
| Worker runtime service account | `slotmerge-worker-runtime` | Cloud Run `worker` service | Reads only the secrets and Cloud SQL resources required by the worker process. |

Minimum assumptions:

- GitHub Actions authenticates to GCP with Workload Identity Federation scoped to this repository.
- The deploy service account can push to the Artifact Registry repository and deploy Cloud Run services.
- Runtime service accounts can access Cloud SQL, read only their required Secret Manager secrets, and write logs/metrics through platform integrations.
- The worker service is not publicly addressable unless a later ticket adds an authenticated internal trigger endpoint.

## Artifact Registry

Use one Docker repository per environment/project:

| Environment | Repository | Region | Image name |
| --- | --- | --- | --- |
| `staging` | `slotmerge-staging` | `us-central1` | `slotmerge` |
| `production` | `slotmerge-production` | `us-central1` | `slotmerge` |

Image URI shape:

```text
us-central1-docker.pkg.dev/$GCP_PROJECT_ID/$ARTIFACT_REGISTRY_REPOSITORY/slotmerge:$IMAGE_TAG
```

Deploy the same image digest to both Cloud Run services. The selected process is controlled by environment, command, or entrypoint in the later containerization ticket.

## Cloud Run

Use two services per environment:

| Environment | Web service | Worker service | Public access |
| --- | --- | --- | --- |
| `staging` | `slotmerge-staging-web` | `slotmerge-staging-worker` | Web public HTTPS; worker private/authenticated. |
| `production` | `slotmerge-production-web` | `slotmerge-production-worker` | Web public HTTPS; worker private/authenticated. |

The `web` service owns Next.js routes, server-rendered pages, API routes, OAuth callbacks, and provider webhook endpoints. The `worker` service owns Graphile Worker jobs, scheduler/tick logic, Calendar Connection reconciliation, and transactional email work.

Use Cloud Run-managed HTTPS for MVP. A custom domain can be attached later without changing the service names.

## Cloud SQL

Use Cloud SQL for PostgreSQL. Keep staging and production databases isolated.

| Environment | Instance | Database | App user |
| --- | --- | --- | --- |
| `staging` | `slotmerge-staging-postgres` | `slotmerge_staging` | `slotmerge_staging_app` |
| `production` | `slotmerge-production-postgres` | `slotmerge_production` | `slotmerge_production_app` |

Production assumptions:

- Automated backups are enabled.
- The smallest production-appropriate instance tier is acceptable for MVP.
- The app user owns application schema changes through Drizzle migrations or has a clearly documented migration role added by a later database provisioning ticket.

Local development uses local or disposable PostgreSQL. Local migrations and Graphile Worker setup must run before promoting the same app shape to GCP.

## Secret Manager

Use environment-scoped secret names. Secret values are never committed to the repository.

| Purpose | Staging secret | Production secret | Environment variable |
| --- | --- | --- | --- |
| Session sealing key | `slotmerge-staging-session-seal-key` | `slotmerge-production-session-seal-key` | `SESSION_SEAL_KEY` |
| Calendar Connection token encryption key | `slotmerge-staging-calendar-token-encryption-key` | `slotmerge-production-calendar-token-encryption-key` | `CALENDAR_TOKEN_ENCRYPTION_KEY` |
| Google OAuth client ID | `slotmerge-staging-google-oauth-client-id` | `slotmerge-production-google-oauth-client-id` | `GOOGLE_OAUTH_CLIENT_ID` |
| Google OAuth client secret | `slotmerge-staging-google-oauth-client-secret` | `slotmerge-production-google-oauth-client-secret` | `GOOGLE_OAUTH_CLIENT_SECRET` |
| Microsoft OAuth client ID | `slotmerge-staging-microsoft-oauth-client-id` | `slotmerge-production-microsoft-oauth-client-id` | `MICROSOFT_OAUTH_CLIENT_ID` |
| Microsoft OAuth client secret | `slotmerge-staging-microsoft-oauth-client-secret` | `slotmerge-production-microsoft-oauth-client-secret` | `MICROSOFT_OAUTH_CLIENT_SECRET` |
| Postmark server token | `slotmerge-staging-postmark-server-token` | `slotmerge-production-postmark-server-token` | `POSTMARK_SERVER_TOKEN` |
| Database URL or password | `slotmerge-staging-database-url` | `slotmerge-production-database-url` | `DATABASE_URL` |
| Google webhook verification secret | `slotmerge-staging-google-webhook-secret` | `slotmerge-production-google-webhook-secret` | `GOOGLE_WEBHOOK_SECRET` |
| Microsoft webhook verification secret | `slotmerge-staging-microsoft-webhook-secret` | `slotmerge-production-microsoft-webhook-secret` | `MICROSOFT_WEBHOOK_SECRET` |
| Admin operational email recipient | `slotmerge-staging-admin-alert-email` | `slotmerge-production-admin-alert-email` | `ADMIN_ALERT_EMAIL` |

Provider refresh tokens and Calendar Connection tokens remain in PostgreSQL encrypted at rest. Secret Manager stores the key material and provider/app credentials, not user provider tokens.

## Environment Variable Contract

All environments use the same names where possible. Staging and production inject secret-backed values from Secret Manager into Cloud Run.

| Variable | Local | Staging | Production | Notes |
| --- | --- | --- | --- | --- |
| `NODE_ENV` | `development` | `production` | `production` | Framework/runtime mode. |
| `SLOTMERGE_ENV` | `local` | `staging` | `production` | Application environment tier. |
| `PROCESS_ROLE` | `web` or `worker` | `web` or `worker` | `web` or `worker` | Selects the process behavior for the shared image. |
| `APP_BASE_URL` | `http://localhost:3000` | Cloud Run HTTPS URL or staging custom domain | Production HTTPS URL or custom domain | Used for magic links, OAuth redirects, and webhook URLs. |
| `DATABASE_URL` | Local/disposable PostgreSQL URL | Secret Manager | Secret Manager | Points to Cloud SQL in GCP environments. |
| `SESSION_SEAL_KEY` | Local generated value | Secret Manager | Secret Manager | Must differ across environments. |
| `CALENDAR_TOKEN_ENCRYPTION_KEY` | Local generated value | Secret Manager | Secret Manager | Encrypts Calendar Connection token material at rest. |
| `GOOGLE_OAUTH_CLIENT_ID` | Local/test OAuth app value | Secret Manager | Secret Manager | Calendar Connection OAuth only. |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Local/test OAuth app value | Secret Manager | Secret Manager | Calendar Connection OAuth only. |
| `MICROSOFT_OAUTH_CLIENT_ID` | Local/test OAuth app value | Secret Manager | Secret Manager | Microsoft work/school Calendar Connections only. |
| `MICROSOFT_OAUTH_CLIENT_SECRET` | Local/test OAuth app value | Secret Manager | Secret Manager | Microsoft work/school Calendar Connections only. |
| `POSTMARK_SERVER_TOKEN` | Local mock or test token | Secret Manager | Secret Manager | Transactional email delivery. |
| `EMAIL_FROM` | Local sender address | Staging sender address | Production sender address | Must be provider-verified where required. |
| `ADMIN_ALERT_EMAIL` | Local developer/admin email | Secret Manager | Secret Manager | Receives critical operational email. |
| `GOOGLE_WEBHOOK_SECRET` | Optional local value | Secret Manager | Secret Manager | Local mode may use polling/manual refresh instead of public HTTPS webhooks. |
| `MICROSOFT_WEBHOOK_SECRET` | Optional local value | Secret Manager | Secret Manager | Local mode may use polling/manual refresh instead of public HTTPS webhooks. |
| `LOG_LEVEL` | `debug` or `info` | `info` | `info` | pino log level. |
| `GCP_PROJECT_ID` | unset or emulator-specific | `slotmerge-staging` | `slotmerge-production` | Useful for deployment scripts and diagnostics. |
| `GCP_REGION` | unset | `us-central1` | `us-central1` | Resource region. |
| `ARTIFACT_REGISTRY_REPOSITORY` | unset | `slotmerge-staging` | `slotmerge-production` | Docker repository name. |
| `CLOUD_SQL_INSTANCE_CONNECTION_NAME` | unset | Staging Cloud SQL connection name | Production Cloud SQL connection name | Used if the runtime connects through Cloud SQL integration. |

Local mode requirements:

- Run `web` and `worker` as separate processes.
- Use local or disposable PostgreSQL and run migrations before exercising the app.
- Run Graphile Worker against the same local database shape used by the app.
- Do not require Secret Manager.
- Do not require public HTTPS provider webhooks; use polling, manual refresh, or provider-bound mocks until the deployed webhook ticket configures live endpoints.

## Later Tickets

This foundation intentionally stops before provisioning concrete resources or changing product runtime behavior. Later tickets should use these names and contracts when they:

- containerize the shared web/worker image;
- provision Cloud SQL and Secret Manager environments;
- deploy Cloud Run services with GitHub Actions;
- configure deployed OAuth and provider webhook endpoints.
