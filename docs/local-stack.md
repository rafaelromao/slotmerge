# Local MVP Stack

The local stack mirrors the production runtime shape before any GCP promotion:

- `web`: Next.js runtime for pages and API routes.
- `worker`: Graphile Worker runtime for database-backed jobs.
- `postgres`: local PostgreSQL database used by Drizzle migrations and Graphile Worker.

Start everything with one command:

```bash
pnpm local:up
```

The command runs Docker Compose and starts PostgreSQL plus separate `web` and `worker` containers. Both runtime containers use `APP_ENV=local`, placeholder non-production secrets, local PostgreSQL, mock email delivery, and mock Calendar Connection provider behavior by default. GCP Secret Manager is not required locally.

After the stack is healthy, prove the full local runtime with:

```bash
pnpm local:verify
```

The verification command checks runtime configuration, applies Drizzle migrations, calls the local-only web health endpoint, enqueues a Graphile Worker smoke job through the web runtime, and waits until the separate worker runtime processes it.

Local Calendar Connection work does not require public HTTPS provider webhooks. Use the mock provider mode for offline work, or configure provider callback URLs against `http://localhost:3000` when manually testing OAuth callbacks with local provider apps. Provider webhook delivery is promoted only after the GCP HTTPS endpoint exists.

Local email delivery uses the mock adapter unless `EMAIL_ADAPTER` is explicitly set to a real transport and the required transport secrets are present. Production-like adapters fail fast outside local/test mode when secrets are missing.
