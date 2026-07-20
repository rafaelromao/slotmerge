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
- **Browser acceptance**: [Research real-browser acceptance and mocked demo options](https://github.com/rafaelromao/slotmerge/issues/273) and [Choose browser acceptance, demo, and capture gates](https://github.com/rafaelromao/slotmerge/issues/274) — Playwright Test is the sole real-browser journey and capture harness, added alongside the locked Vitest framework; full-app navigation journeys and the audit's "no browser evidence" gap are the missing evidence class this layer closes. `happy-dom` + `renderToString` Vitest tests are not browser evidence. Vitest Browser Mode is a future-only second-rank option; this stack extension does not adopt it.
  - **Runner and providers**: `@playwright/test` + `playwright`; the official `mcr.microsoft.com/playwright` Docker image whose version is matched to the installed `@playwright/test` version at install time. The browser harness never replaces Vitest and never bypasses the locked workflow modules.
  - **New local/test seams, all gated on `APP_ENV in {local, test}` plus an explicit env flag** (no production-reachable behavior):
    - **D4 — Mock Email outbox / transport capture seam**: a sidecar listener or transport capture seam that records the rendered mock messages the mock `EMAIL_ADAPTER=mock` transport produces, so the reserved rendered invite-then-magic-link journey can read the URL. The Postgres mirror-table alternative exists but is a persistence-shape change requiring separate authorization; it is not recommended.
    - **D5 — Server-side application-clock injection seam**: env-controlled fixed clock in `APP_ENV in {local, test}` only, so the running web and worker share the same frozen `FIXTURE_DATE` (`tests/fixtures/seeds.ts:13`) as the Playwright browser context's `page.clock.install`.
    - **D6 — Provider-mock boundary**: local/test-only HTTP sidecar (D6a) that fronts the Google OAuth, Microsoft Graph, and provider-replay endpoints. D6a is the recommended shape. The in-process startup-adapter (D6b) is a recorded alternative, not the default.
  - **Per-role authentication**: `globalSetup` inserts one row per role into the `sessions` table, seals a cookie via `sealSessionCookie({ sessionId })`, and writes `playwright/.auth/{user,organizer,admin}.json` `storageState` files. Tests use `test.use({ storageState: 'playwright/.auth/organizer.json' })`. No generic auth bypass endpoint is added.
  - **File conventions**:
    - `playwright.config.ts` at repo root with two projects: `default` and `capture`.
    - `tests/e2e-browser/**` for Playwright specs; `tests/helpers/playwright/global-setup.ts` for the per-role `storageState` setup.
    - `tests/e2e-browser/screenshots/{screen}/{state}.png` for committed visual-regression baselines.
    - `playwright/.artifacts/{journey}/` for ephemeral capture artifacts (not committed).
    - `.github/workflows/browser-tests.yml` for the `workflow_dispatch` lane.
  - **Capture convention**:
    - `default` project: `video: 'retain-on-failure'`, `trace: 'retain-on-failure'`. Diagnostics for failed tests; videos and traces are kept only on failure.
    - `capture` project: `video: 'on'`, full-page screenshots after every named visible state, traces on every run. WebM only; MP4 conversion is a separate downstream `ffmpeg` step and is not part of Playwright's defaults.
    - Both projects upload `test-results/*` and `playwright/.artifacts/*` as workflow artifacts. Workflow retention is 14 days.
  - **CI policy**:
    - `.github/workflows/browser-tests.yml` runs on `workflow_dispatch` only — no `pull_request`, no `push`, no `schedule`, no merge-queue trigger.
    - The locked "E2E tests are not executed in CI" decision (`E2E test plan` row above) is preserved. PR CI remains `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build`.
    - Any future automatic CI execution requires a new tracker issue that explicitly lifts this Browser Acceptance subsection's CI policy lock and updates the Implementation stack paragraph above.
  - **Local scripts** (each checks the local health gate at `http://localhost:3000/api/local/health` and refuses to start otherwise; `pnpm local:up` is a prerequisite):
    - `pnpm test:browser` — runs the Vitest browser project (none for MVP; reserved for future Vitest Browser Mode adoption).
    - `pnpm test:e2e:browser` — runs the Playwright `default` project (failure diagnostics).
    - `pnpm test:capture` — runs the Playwright `capture` project (successful journey screencasts).
  - **Install policy**: the next install ticket lands Playwright Test with one passing journey (the setup Home on `/`) before any other screen-level implementation ticket closes. Every subsequent screen-level and journey-level implementation ticket writes its own Playwright journey before the ticket can close. The Vitest-based component and `happy-dom` evidence continues to be the lower-level seam, but it is no longer sufficient closure evidence for a rendered screen.
  - **Rendered-screen and browser-journey completion gates** ([Define rendered-screen and browser-journey completion gates](https://github.com/rafaelromao/slotmerge/issues/279)): every screen-level implementation ticket closes only when all of the following are true, and the closing PR comment reproduces each link verbatim:
    - **Playwright happy-path** spec in `tests/e2e-browser/journeys/{user,organizer,admin}/...spec.ts` that drives the running web app through the screen''s primary path.
    - **Playwright failure-path** spec in the same journey that drives at least one validation, error, or empty state and asserts the inline / per-section / per-segment error surface.
    - **Vitest unit** tests at the workflow module boundary under `src/workflow/**` exercising the typed `Result<T, E>` return shape.
    - **Component tests** (`renderToString` + `happy-dom`) for the per-page server component and any client island (the existing `SlotDetailsDrawer` / `HeaderMenuToggle` seams).
    - **Visual capture** run: per-state full-page screenshots committed under `tests/e2e-browser/screenshots/{screen}/{state}.png`; WebM capture uploaded to workflow artifacts; a markdown summary linked from the PR.
    - **WCAG 2.1 AA** bar encoded as the binding accessibility gate: contrast 4.5:1 (3:1 large text), full keyboard reachability with visible focus, every form input labelled, every error announced via `aria-live` / `aria-describedby`, every icon-only control named, single `h1` per page, `role="dialog"` + `aria-modal` + labelledby + focus trap on the drawer, color is not the sole carrier of state, `prefers-reduced-motion` honored.
    - **Three-tier responsive bar** per the shell prototype: desktop >= 1024px, tablet 768–1023px, mobile < 768px. The Search Result grid adapts to all three. The setup checklist is single-column at < 768px.
    - **SSR first paint**: every page renders the screen''s primary content in server-rendered HTML; the first paint is the page content, not a loading skeleton. There is no client-side data fetching. Loading and error states are: per-row inline (form validation, server-action typed errors), per-section banner (CSRF failure, rate limit, missing capability), and per-segment `error.tsx` (unexpected exceptions).
    - **Empty state** with a primary action that goes to the next logical setup step, reusing the existing `.empty-state` primitive at `app/globals.css:243-257`. The role-aware shell prototype enumerates the empty state per page.
    - **Browser-journey coverage**: three end-to-end Playwright journeys, one per role, that drive the full canonical happy path:
      - **User**: invite → verify → setup checklist → profile → consent → topics → availability → calendar connection → sign-out.
      - **Organizer**: search form → result → drawer → history → rerun.
      - **Admin**: invite → role change → suspend → reinstate → approve proposal → reject proposal → retire topic → status page.
    - **CI gate policy**: PR CI runs `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (Vitest only). Playwright and the visual capture run only on the `workflow_dispatch` lanes `browser-tests.yml` and `visual-regression.yml`. PR CI does not run Playwright; the locked "E2E tests are not executed in CI" decision is preserved.
    - **Tracker closure rule**: every implementation ticket body has a `Closure Evidence` section listing the Playwright journey file path, the Vitest test file path, the component test file path, the visual capture artifact path, and the AGENTS.md acceptance bar checked. The closing PR comment reproduces each link verbatim. Sandman performs the PR review with a separate agent; that review is the binding review mechanism for the locked test framework, but the review does not replace the closure-evidence set above. The legacy "Closed by sandman — issue already completed" auto-closure comment is not a substitute for the closure-evidence set and remains disallowed as a stand-alone closure reason.
- **Glossary**: [`CONTEXT.md`](CONTEXT.md) — use SlotMerge terms exactly as defined there; do not invent synonyms.

### How to use this section

- These decisions are authoritative. Do not re-derive them in tickets, code, or commit messages.
- When a ticket body, an ADR, or a design note appears to contradict these decisions, surface the contradiction explicitly rather than silently overriding.
- New decisions that supersede or extend the stack should be captured as new tracker issues that update this file in the same change.
- Implementation tickets under the PRD inherit these decisions unless the ticket body explicitly overrides a specific point and links to the issue that authorizes the override.