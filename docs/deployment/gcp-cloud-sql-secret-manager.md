# GCP Cloud SQL and Secret Manager Environments

This runbook documents the Cloud SQL for PostgreSQL and Secret Manager contract for SlotMerge staging and production Cloud Run deployments. It follows the hosting decision in GitHub issue #131: separate Cloud Run `web` and `worker` services, Cloud SQL for PostgreSQL, and Secret Manager-injected runtime configuration.

This ticket documents the target GCP environment shape. It does not commit secret values, provision live resources, or ship product behavior while the GCP foundation and app bootstrap tickets remain open.

## Environments

Use separate staging and production GCP resources. Staging and production must not share databases, database users, database passwords, session sealing keys, Calendar Connection token encryption keys, OAuth client secrets, email provider credentials, or webhook verification secrets.

| Environment | Cloud SQL instance | Database | Database user | Cloud Run services |
| --- | --- | --- | --- | --- |
| staging | `slotmerge-staging-postgres` | `slotmerge_staging` | `slotmerge_staging_app` | `slotmerge-staging-web`, `slotmerge-staging-worker` |
| production | `slotmerge-production-postgres` | `slotmerge_production` | `slotmerge_production_app` | `slotmerge-production-web`, `slotmerge-production-worker` |

Staging and production may live in the same GCP project only if IAM bindings remain environment-scoped. Prefer separate GCP projects once operational overhead is acceptable. If cost requires a shared non-production Cloud SQL instance later, production must still use its own production Cloud SQL instance and production database credentials.

## Cloud SQL

Use Cloud SQL for PostgreSQL for both staging and production.

Required settings:

- Create `slotmerge-staging-postgres` for staging and `slotmerge-production-postgres` for production.
- Create only the environment-specific database and database user listed above in each instance.
- Store each database password in that environment's Secret Manager database credential secret.
- Allow Cloud Run connectivity through Cloud SQL integration using the environment's Cloud Run service identities.
- Do not grant staging service identities access to the production Cloud SQL instance, production database, or production database user.
- Do not grant production service identities access to staging database credentials unless an explicit break-glass procedure is introduced later.

Production backups:

- Enable automated backups on `slotmerge-production-postgres` before production traffic is allowed.
- Retain enough backups for operational recovery and incident response; start with at least seven days of backup retention unless a later operations decision changes the value.
- Enable point-in-time recovery for production when available for the selected Cloud SQL tier.
- Treat production restore operations as incident-response or explicit backup/restore procedures, never as routine data reset.

Staging backups are optional and cost-driven. If enabled, staging backups must not be treated as production recovery artifacts.

## Secret Manager

Create separate Secret Manager secrets per environment. Secret names include the environment to make accidental cross-environment binding visible in reviews and Cloud Run configuration.

| Secret | Purpose / expected content |
| --- | --- |
| `slotmerge-staging-database-url` | Staging PostgreSQL connection string for `slotmerge_staging` using `slotmerge_staging_app`. |
| `slotmerge-production-database-url` | Production PostgreSQL connection string for `slotmerge_production` using `slotmerge_production_app`. |
| `slotmerge-staging-session-seal-key` | Staging session sealing key material for sealed cookies. |
| `slotmerge-production-session-seal-key` | Production session sealing key material for sealed cookies. |
| `slotmerge-staging-calendar-token-encryption-key` | Staging encryption key material for Calendar Connection token encryption at rest. |
| `slotmerge-production-calendar-token-encryption-key` | Production encryption key material for Calendar Connection token encryption at rest. |
| `slotmerge-staging-google-oauth-client-secret` | Staging Google OAuth client secret for Calendar Connections. |
| `slotmerge-production-google-oauth-client-secret` | Production Google OAuth client secret for Calendar Connections. |
| `slotmerge-staging-microsoft-oauth-client-secret` | Staging Microsoft OAuth client secret for Calendar Connections. |
| `slotmerge-production-microsoft-oauth-client-secret` | Production Microsoft OAuth client secret for Calendar Connections. |
| `slotmerge-staging-email-provider-credential` | Staging Postmark server token or SMTP credential. |
| `slotmerge-production-email-provider-credential` | Production Postmark server token or SMTP credential. |
| `slotmerge-staging-webhook-verification-secret` | Staging webhook verification material when provider webhook verification requires an application-managed secret. |
| `slotmerge-production-webhook-verification-secret` | Production webhook verification material when provider webhook verification requires an application-managed secret. |

Secret rules:

- Never commit secret values to the repository.
- Do not copy production secret values into staging.
- Rotate staging and production secrets independently.
- Create OAuth applications and email provider credentials separately for staging and production when the provider supports it.
- Provider refresh tokens and Calendar Connection tokens are not Secret Manager secrets; they are persisted in PostgreSQL encrypted at rest.

## Cloud Run Service Identities

Use one service identity per Cloud Run service and environment.

| Service | Service identity | Required access |
| --- | --- | --- |
| staging web | `slotmerge-staging-web` | Cloud SQL client to staging Cloud SQL; Secret Manager accessor for staging secrets required by web runtime. |
| staging worker | `slotmerge-staging-worker` | Cloud SQL client to staging Cloud SQL; Secret Manager accessor for staging secrets required by worker runtime. |
| production web | `slotmerge-production-web` | Cloud SQL client to production Cloud SQL; Secret Manager accessor for production secrets required by web runtime. |
| production worker | `slotmerge-production-worker` | Cloud SQL client to production Cloud SQL; Secret Manager accessor for production secrets required by worker runtime. |

Grant IAM at the narrowest available scope:

- Grant `roles/cloudsql.client` only to the service identities that connect to that environment's Cloud SQL instance.
- Grant `roles/secretmanager.secretAccessor` on individual Secret Manager secrets, not project-wide, unless a later foundation decision explicitly requires project-level binding.
- The staging web and worker service identities must not have access to production Secret Manager secrets or the production Cloud SQL instance.
- The production web and worker service identities must not have access to staging Secret Manager secrets or the staging Cloud SQL instance during normal operation.
- The web service receives only the secrets required for request handling, OAuth callbacks, provider webhooks, sessions, and database access.
- The worker service receives only the secrets required for background jobs, Calendar Connection token processing, email delivery, webhook reconciliation, and database access.

## Non-Production Data Reset Policy

Staging is non-production and may be reset at any time after preserving any fixtures needed for test or demo workflows. A staging reset may drop and recreate the staging database, rerun migrations, and reseed approved non-production fixtures.

Reset rules:

- Never reset production data outside explicit backup/restore or incident-response procedures.
- Never copy production database contents into staging.
- Never copy production secrets into staging.
- Before resetting staging, record any fixtures that must be recreated for demos or pre-release verification.
- After resetting staging, rotate staging database credentials if the reset involved credential exposure or broad operator access.

Local development is outside this GCP Secret Manager contract. The local-first deployment amendment in issue #131 requires the full stack to run locally before GCP promotion, but local mode may use local environment variables and local or disposable PostgreSQL instead of GCP Secret Manager and Cloud SQL.
