## Agent skills

### Issue tracker

Issues and PRDs are tracked in GitHub Issues for `rafaelromao/slotmerge`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default five-label triage vocabulary. See `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context domain-doc layout. See `docs/agents/domain.md`.

## Implementation decisions

Before starting any implementation work, read the closed Wayfinder map and its Decisions-so-far index. The architectural shape and the implementation stack are already locked; treat them as binding for every ticket in this repo.

### Canonical sources of truth

- **Top-level PRD**: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14) and the implementation-ready spec at [`docs/mvp-spec.md`](docs/mvp-spec.md).
- **Architecture shape**: [Choose MVP architecture and persistence shape](https://github.com/rafaelromao/slotmerge/issues/5) — single full-stack web app, PostgreSQL primary database, DB-backed durable job queue, internal matching module, persistent immutable Search Result JSON snapshots, encrypted Calendar Connection tokens at rest, HTTPS web app plus inbound provider webhooks plus scheduled reconciliation.
- **Implementation stack**: [Choose MVP implementation stack](https://github.com/rafaelromao/slotmerge/issues/130) — TypeScript on Node.js LTS, Next.js on Node with server-rendered HTML by default, Drizzle ORM with drizzle-kit for Postgres migrations, Graphile Worker (Postgres-backed) with a Node worker process and scheduler tick, nodemailer with a Postmark transport behind a single Email delivery service module, arctica for Google and Microsoft OAuth with PKCE and refresh tokens, sealed session cookies via @hapi/iron (or Lucia-style) with per-session CSRF and an in-memory rate limiter on magic-link request and OAuth callback endpoints, pino structured JSON logs with a request-context middleware on stdout, pnpm workspaces (single package), TypeScript strict mode, ESLint flat config with the Next.js plugin, Prettier, Vitest alongside Next.js.
- **E2E test plan**: [E2E test plan: SlotMerge MVP](https://github.com/rafaelromao/slotmerge/issues/62) — Vitest is the test framework, mocks implement only what the tests assert against, single global clock at the app boundary, strict assertions on Search Result snapshot JSON shape and payload structure, E2E tests are not executed in CI.
- **Glossary**: [`CONTEXT.md`](CONTEXT.md) — use SlotMerge terms exactly as defined there; do not invent synonyms.

### How to use this section

- These decisions are authoritative. Do not re-derive them in tickets, code, or commit messages.
- When a ticket body, an ADR, or a design note appears to contradict these decisions, surface the contradiction explicitly rather than silently overriding.
- New decisions that supersede or extend the stack should be captured as new tracker issues that update this file in the same change.
- Implementation tickets under the PRD inherit these decisions unless the ticket body explicitly overrides a specific point and links to the issue that authorizes the override.