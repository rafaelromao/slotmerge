# Real-Browser Acceptance and Mocked Demo Options

Research asset for [Research real-browser acceptance and mocked demo options](https://github.com/rafaelromao/slotmerge/issues/273).

## Scope and evidence standard

This artifact evaluates concrete options for a real-browser acceptance, deterministic demo-seeding, external-service mocking, screenshot, and screencast harness that fits SlotMerge's locked architecture and stack. It is research only; no implementation lands here. The locked decisions in `AGENTS.md`, the existing screen-coverage audit at [`docs/research/mvp-web-screen-and-tracker-coverage.md`](mvp-web-screen-and-tracker-coverage.md), the in-tree source, the existing tests, and the locked provider/email/clock seams are authoritative.

Evidence labels used below:

- **Rendered page**: a Next.js page or HTTP response that emits user-visible HTML.
- **Rendered component**: a React component or HTML renderer tested in isolation, not a browser journey.
- **Handler/API**: an HTTP route or handler returning JSON, redirects, or standalone HTML without a browser.
- **Domain seam**: a repository, service, matching, worker, or provider boundary exercised without rendering the complete screen.
- **Browser evidence**: a test that starts the web app and drives it through a browser. No such harness is configured in the audited tree (`docs/research/mvp-web-screen-and-tracker-coverage.md:17-25`).

Every recommendation in this artifact is anchored in either an official first-party source (cited inline with URL and accessed date) or a `file:line` reference to this repository's source tree. No blogs are cited.

Access dates for every web URL in this artifact: **2026-07-20**.

Repository state: this artifact lives on the worktree `/home/romao/projects/slotmerge-wayfinder-web-plan` on branch `wayfinder/271-complete-mvp-web-app-plan`, is **not committed**, and is **not pushed**. The pre-existing `docs/research/mvp-web-screen-and-tracker-coverage.md` is unchanged. Tracker scope of this work: issue 273 (research, now closed) and parent map 271 (one context-pointer line added to its Decisions-so-far index). No other issue was modified.

## Executive findings

1. **Playwright Test is the only correct tool for full-app navigation journeys.** Playwright Test provides first-class `webServer`, `globalSetup`, project dependencies, `storageState`, traces, screenshots, and videos (`https://playwright.dev/docs/intro`, accessed 2026-07-20; `https://playwright.dev/docs/test-webserver`, accessed 2026-07-20; `https://playwright.dev/docs/test-global-setup-teardown`, accessed 2026-07-20; `https://playwright.dev/docs/auth`, accessed 2026-07-20; `https://playwright.dev/docs/trace-viewer`, accessed 2026-07-20; `https://playwright.dev/docs/videos`, accessed 2026-07-20). The official Next.js Playwright guide points at `@playwright/test` for E2E testing (`https://nextjs.org/docs/app/guides/testing/playwright`, accessed 2026-07-20).
2. **The existing Vitest configuration stays as the locked test framework.** Vitest remains the unit/domain/handler/component-harness (`AGENTS.md:23`). Existing component tests use `@testing-library/react` with `happy-dom` (`package.json:43,54`; `vitest.config.ts:10-18`; `tests/slot-details-drawer.test.tsx:1-7,132-231`; `tests/searches/results.test.tsx:1-7,38-183`). That is not a real browser and the audit identified it as a non-browser seam; this artifact does not promote it.
3. **Vitest Browser Mode is a second-rank, future-only option.** Vitest Browser Mode runs in a Vite-served browser harness on a single page per test file (`https://vitest.dev/config/browser/playwright`, accessed 2026-07-20), and the project's own docs describe it as still in early development with a recommendation to augment it with a standalone runner for journey-class work (`https://vitest.dev/guide/browser/why`, accessed 2026-07-20). It is **not** a substitute for Playwright Test on the live Next/Postgres/worker stack. It is listed here only so issue 274 has a recorded second-rank candidate if later tickets prove that isolated real-browser component visual regression is necessary (for example, debugging a flaky CSS regression that `happy-dom` cannot reproduce). Adding it now without a concrete requirement would create two browser harnesses to maintain and would also require a separate visual-regression baseline storage convention from Playwright.
4. **Existing provider mocks do not cross process boundaries.** The existing `tests/google-calendar-adapter.ts` and `tests/mock-microsoft-graph-adapter.ts` work via `vi.stubGlobal("fetch", ...)` (`tests/e2e/choose-contributing-calendars-per-connection.test.ts:254-266`; `tests/e2e/disconnect-removes-tokens-and-prevents-further-sync.test.ts:175`; `tests/e2e/google-calendar-connect-freebusy-only-scopes.test.ts:167`; and others). That is a Vitest-in-process substitution and does not cross the Next.js ↔ browser ↔ provider process boundary. The `CALENDAR_PROVIDER_MODE` env switch is exposed by `src/config/runtime.ts:7,47-53` but is not read by any production code path — `src/calendar/providers/index.ts:11-14` statically registers `googleCalendarProvider` and `microsoftCalendarProvider` only; there is no `mockCalendarProvider` registry entry, and `app/me/calendar-connections/[id]/route.ts:87` and `app/me/calendar-connections/callback/route.ts:83` pass the global `fetch` directly into the provider modules. Playwright tests against a separately running Next server therefore need a **new** provider-mock boundary (HTTP sidecar or startup adapter seam). This artifact labels that boundary as required new implementation work for issue 274 and any follow-up install ticket.
5. **Auth setup is via direct DB session seeding for ordinary journeys.** The `sessions` schema is `src/db/schema.ts:55-66`; existing tests already insert rows into `sessions` and call `sealSessionCookie({ sessionId })` to obtain a sealed cookie (`tests/auth-session-route.test.ts:61`; `tests/availability-overrides-route.test.ts:81`; `tests/calendar-action-required-email-wiring-fixtures.ts:80`). Playwright `globalSetup` should adopt the same pattern: insert one row per role into `sessions`, seal a cookie, and write `storageState` files via `await page.context().storageState({ path })` (`https://playwright.dev/docs/auth`, accessed 2026-07-20). This is not a generic auth bypass endpoint; it is the same direct-DB seeding that the unit/E2E suite already does.
6. **Magic-link tokens are not persisted in the database.** The `email_events` schema stores a SHA256 `payload_reference`, not the payload itself (`src/db/schema.ts:272-291`; `src/email/service.ts:74-113`). The payload, including `magicLinkToken` and `magicLinkUrl`, is passed only to the Graphile Worker `queueJob` (`src/email/service.ts:96-101`) and through the email transport (`src/email/transport.ts:41-50`). It is therefore **not** recoverable from `email_events` after the request returns. One actual rendered invite-then-magic-link browser journey is reserved, and for that journey the test captures the URL from a new local/test-only mock Email outbox / transport capture seam (D4). The default Playwright setup must not propose a generic magic-link retrieval endpoint; there is no source seam to back it.
7. **Clock determinism needs a server-side seam.** The locked single global clock at the app boundary (`AGENTS.md:23-24`) is owned in-process. `tests/fixtures/clock.ts:1-8` and `FIXTURE_DATE = "2026-07-12T12:00:00.000Z"` (`tests/fixtures/seeds.ts:13`) pin time inside the running test process. For Playwright, `page.clock.install({ time: FIXTURE_DATE })` overrides the **browser** clock (`https://playwright.dev/docs/clock`, accessed 2026-07-20) but does not reach the Next server, the Graphile Worker, or Postgres `now()`. To freeze the server side, the install ticket must add a server-side application-clock injection/config seam (env-controlled fixed clock in `APP_ENV=local` and `APP_ENV=test` only), or use date-relative demo fixtures that do not depend on `now()`. This artifact labels the server clock seam as required new work.
8. **CI policy stays opt-in manual.** The locked "E2E tests are not executed in CI" decision (`AGENTS.md:24`) is binding. The researched default is a `workflow_dispatch`-only GitHub Actions workflow with **no** `pull_request`, **no** `push`, **no** `schedule`, and **no** merge-queue trigger. Any automatic CI execution is a future explicit decision that requires amending `AGENTS.md` to lift the CI policy lock, and is **out of scope** for the install ticket.
9. **Capture coverage must distinguish three artifacts.** (a) **Per-screen screenshots** after every named visible state, taken via `page.screenshot({ fullPage: true })` (`https://playwright.dev/docs/screenshots`, accessed 2026-07-20); (b) **Per-journey screencast videos** that prove the full happy path ran — these require a dedicated capture project or run with `video: 'on'`, not the `retain-on-failure` default (`https://playwright.dev/docs/videos`, accessed 2026-07-20); (c) **Per-test traces** that include action DOM snapshots, console logs, and network logs, retained on failure via `trace: 'retain-on-failure'` (`https://playwright.dev/docs/trace-viewer`, accessed 2026-07-20).
10. **Video format and conversion.** Playwright outputs WebM by default (`https://playwright.dev/docs/videos`, accessed 2026-07-20). MP4 conversion, if required downstream, is a separate deterministic `ffmpeg` post-process and is not part of Playwright's defaults.
11. **Docker image must match the Playwright package version.** The official Playwright Docker docs explicitly require the Playwright version in the image to match the version installed in the project: "When running tests remotely, ensure the Playwright version in your tests matches the version running in the Docker container" (`https://playwright.dev/docs/docker`, accessed 2026-07-20). This artifact therefore does not pin a specific image tag; the install ticket must pick the image at install time so the image's Playwright version equals the chosen `@playwright/test` version.
12. **External services can be mocked, but the boundary must move.** External services can be mocked without test-only production bypasses, but the existing in-process `vi.stubGlobal("fetch", ...)` pattern is **not** sufficient for Playwright. The mock boundary must move from "test process substitutes global `fetch`" to either a local/test-only HTTP sidecar that fronts the provider endpoints, or an explicit local/test startup adapter seam that the Next web process installs at boot.

## Locked stack and seams this artifact must respect

These are the binding facts for every option below. Any option that contradicts them is rejected.

- **Stack**: TypeScript on Node.js LTS, Next.js on Node with server-rendered HTML by default, pnpm workspaces (single package), Vitest as the test framework, ESLint flat config with the Next.js plugin, Prettier, TypeScript strict mode (`AGENTS.md:23`).
- **Persistence and worker**: PostgreSQL primary database, Drizzle ORM with drizzle-kit migrations, Graphile Worker (Postgres-backed) with a Node worker process and scheduler tick (`AGENTS.md:23`).
- **External services**: arctica OAuth (PKCE, refresh) for Google and Microsoft; nodemailer with Postmark behind a single Email delivery service module; encrypted Calendar Connection tokens at rest (`AGENTS.md:23`).
- **Auth**: Sealed session cookies via @hapi/iron (or Lucia-style) with per-session CSRF, in-memory rate limiter on magic-link request and OAuth callback endpoints (`AGENTS.md:23`).
- **Observability**: pino structured JSON logs with a request-context middleware on stdout (`AGENTS.md:23`).
- **Test policy**: Vitest is the test framework; mocks implement only what the tests assert against; single global clock at the app boundary; E2E tests are not executed in CI (`AGENTS.md:23-24`).
- **Local stack**: `web` (Next.js), `worker` (Graphile Worker), and `postgres` containers orchestrated by `docker compose` (`docs/local-stack.md:5-14`, `docker-compose.yml:1-42`).
- **Glossary**: User, Organizer, Admin, Availability, Availability Window, Calendar Connection, Topic, Topic Proposal, Slot, Search, Search Result, Match, Discoverability (`CONTEXT.md:7-57`).
- **Existing mocks and seeds**: `tests/mock-email-adapter.ts:1-139`, `tests/google-calendar-adapter.ts:1-305`, `tests/mock-microsoft-graph-adapter.ts:1-271`, and the `fixedClock` helper at `tests/fixtures/clock.ts:1-8`. The seeded fixture DB at `tests/fixtures/seeds.ts:13-302` is the only deterministic demo dataset.
- **Existing test seams reused**: Vitest global setup with ephemeral Postgres (`tests/helpers/global-setup.ts:10-30`), Vitest setup file with seeded DB (`tests/helpers/setup.ts:45-56`), Vitest project configs separating unit, E2E, and E2E infra (`vitest.config.ts:1-20`, `vitest.e2e.config.ts:1-17`, `vitest.e2e-infra.config.ts:1-15`).
- **Existing rendering seams reused**: The Search Result page is a server-rendered Next page that calls repositories directly (`app/searches/[id]/results/page.tsx:7-77`). The Topics page is a server-rendered HTML route (`app/me/topics/route.ts:11-296`). The Admin surfaces are standalone HTML handlers (`src/admin/invites.ts:63-277`, `src/admin/users.ts:68-317`, `src/admin/topic-proposals.ts:51-226`, `src/admin/topics.ts:39-190`, `src/admin/operational-status.ts:48-193`). All of these become navigable browser targets in Playwright Test once the canonical pages exist.

## Option matrix

Each row is one viable combination of runner, local orchestration, and capture policy. The matrix is the decision input for issue 274. Cost is measured in added dependencies, configuration files, and CI minutes; fidelity is how close the harness runs to the production runtime.

| # | Browser harness | Local orchestration | Per-role session strategy | Deterministic clock | Provider/Email mock strategy | Screenshot | Screencast video | Traces | CI policy | Stack extension? |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Existing Vitest (unit/domain/handler/`happy-dom`-component) + Playwright Test only (recommended)** | Extend `docker-compose.yml` with a Playwright service that uses the official `mcr.microsoft.com/playwright` image whose version matches the chosen `@playwright/test` version (`https://playwright.dev/docs/docker`, accessed 2026-07-20); the existing `web` container is the `webServer` target (`https://playwright.dev/docs/test-webserver`, accessed 2026-07-20) | `globalSetup` inserts one row per role into `sessions` (`src/db/schema.ts:55-66`), calls `sealSessionCookie({ sessionId })` (`src/auth/session.ts:39-51`), and writes `playwright/.auth/{user,organizer,admin}.json` `storageState` files via `await page.context().storageState({ path })` (`https://playwright.dev/docs/auth`, accessed 2026-07-20). One dedicated rendered magic-link journey is reserved and reads the URL from a new local/test-only mock Email outbox / transport capture seam | New server-side application-clock injection seam in `APP_ENV in {local,test}` only, paired with `page.clock.install({ time: FIXTURE_DATE })` for the browser context (`https://playwright.dev/docs/clock`, accessed 2026-07-20) | New local/test-only HTTP sidecar that fronts the Google and Microsoft provider endpoints, OR a new explicit local/test startup adapter seam that the Next web process installs at boot (replacing the global `fetch` that `app/me/calendar-connections/[id]/route.ts:87` and `app/me/calendar-connections/callback/route.ts:83` pass into the provider modules); `EMAIL_ADAPTER=mock` (`src/email/transport.ts:15-23`) remains the production mock path; the new mock Email outbox / transport capture seam records rendered mock messages and URLs without a production schema migration | Native via `page.screenshot({ fullPage: true })` in a dedicated capture project/run (`https://playwright.dev/docs/screenshots`, accessed 2026-07-20) | Native via `video: 'on'` in a dedicated capture project/run, output is WebM (`https://playwright.dev/docs/videos`, accessed 2026-07-20); MP4 conversion is a separate `ffmpeg` step | Native via `trace: 'retain-on-failure'` (`https://playwright.dev/docs/trace-viewer`, accessed 2026-07-20) | `workflow_dispatch` only; no `pull_request`, no `push`, no `schedule`, no merge-queue trigger | Yes (`@playwright/test`, `playwright.config.ts`, project scripts); existing Vitest configs untouched |
| 2 | Vitest Browser Mode + Playwright Test (second-rank, only if isolated real-browser component visual regression is later proven necessary) | Vitest Browser Mode runs in its own Vite-served harness, not against the running Next container (`https://vitest.dev/guide/browser/`, accessed 2026-07-20; `https://vitest.dev/config/browser/playwright`, accessed 2026-07-20); Playwright Test runs against the running Next container as in Option 1 | Vitest browser specs use `setSessionRepositoryForTests` (`src/auth/session.ts:33-37`) and stay in-process; Playwright uses direct DB session seeding | Vitest side: server-side `fixedClock` plus per-test browser clock; Playwright side: as in Option 1 | Both: provider HTTP sidecar / startup adapter seam; `EMAIL_ADAPTER=mock` | Vitest Browser Mode `toMatchScreenshot` (`https://vitest.dev/guide/browser/visual-regression-testing`, accessed 2026-07-20) for component-browser; Playwright `page.screenshot` for journeys | Playwright only | Vitest traces via Playwright provider (`https://vitest.dev/guide/browser/trace-view`, accessed 2026-07-20); Playwright HTML report traces | Same as Option 1 | Yes (Vitest Browser Mode provider + Playwright Test; two browser harnesses to maintain) |
| 3 | Vitest Browser Mode preview provider only | Same as Option 1 | Same as Option 1 | Same as Option 1 | Same as Option 1 | Native | None (preview provider does not support advanced browser features per `https://vitest.dev/config/browser/preview`, accessed 2026-07-20) | None | Same as Option 1 | None |
| 4 | Add Cypress as a third runner | Same as Option 1 | Cypress session fixtures | Cypress clock control | Same as Option 1 | Cypress screenshots | Cypress videos | Cypress traces | Same as Option 1 | Yes (Cypress, separate config) |
| 5 | Existing Vitest only (no browser evidence) | Existing `docker compose`; no browser tests | n/a | Existing `fixedClock` | Existing `vi.stubGlobal` and `EMAIL_ADAPTER=mock` | None (only `renderToString` and `happy-dom` HTML inspection) | None | None | Same as Option 1 | None (status quo) |

Notes on the matrix:

- **Why Option 1 is the recommended browser harness.** The audit identified "no real navigation across Next.js routes by a real browser" as the missing evidence class (`docs/research/mvp-web-screen-and-tracker-coverage.md:19-26`). Playwright Test is the only harness in the matrix that drives the live Next/Postgres/worker stack end-to-end with first-class `webServer`, `globalSetup`, `storageState`, traces, screenshots, and videos. The existing Vitest config (`vitest.config.ts`, `vitest.e2e.config.ts`, `vitest.e2e-infra.config.ts`) is the locked test framework (`AGENTS.md:23`) and stays as the unit/domain/handler/`happy-dom`-component harness; the recommendation is one focused stack extension (Playwright Test) alongside it, not in place of it.
- **Why Option 5 (status quo) is rejected.** Direct handler/domain JSON tests and `happy-dom` component tests already exist (`vitest.e2e.config.ts:1-17`; `package.json:43,54`; `tests/slot-details-drawer.test.tsx:1-7,132-231`; `tests/searches/results.test.tsx:1-7,38-183`). The audit concluded that these are not browser evidence and that the gap must be closed by a real-browser harness (`docs/research/mvp-web-screen-and-tracker-coverage.md:17-25,250-262`).
- **Why Option 2 is second-rank, not co-recommended.** Vitest Browser Mode is "still in its early stages of development… It is recommended that users augment their Vitest browser experience with a standalone browser-side test runner like WebdriverIO, Cypress or Playwright" (`https://vitest.dev/guide/browser/why`, accessed 2026-07-20). It runs in a Vite-served harness on a single page per test file (`https://vitest.dev/config/browser/playwright`, accessed 2026-07-20). Adding it now without a concrete requirement creates two browser harnesses to maintain and overlaps with Playwright Test for visual regression. If a later ticket proves that `happy-dom` cannot reproduce a CSS regression and an isolated real-browser component visual regression is needed, Option 2 becomes the candidate.
- **Why Option 3 is rejected.** The preview provider has no headless mode, no parallel instances, no advanced browser features, and no CDP (`https://vitest.dev/config/browser/preview`, accessed 2026-07-20). It cannot drive CI in any form.
- **Why Option 4 is rejected.** Cypress is a third runner that overlaps Playwright Test in feature set without adding capability not already available through Playwright.

## Decisions to surface to issue 274

The following are concrete choices for the architecture decision in issue 274. None of these is a binding decision in this artifact; each is a single-line summary of the trade-offs.

### D1. Browser harness: existing Vitest + Playwright Test only

Keep the existing Vitest config (`vitest.config.ts`, `vitest.e2e.config.ts`, `vitest.e2e-infra.config.ts`) untouched. Add `@playwright/test` as the only real-browser journey and capture harness. Vitest Browser Mode is listed as Option 2 / second-rank only, behind a future concrete requirement for isolated real-browser component visual regression. This is one focused stack extension and avoids maintaining two browser harnesses.

### D2. Local orchestration: extend the existing Docker Compose stack

`docker-compose.yml:1-42` already runs the production-shaped web/worker/postgres trio. Add an opt-in `e2e-browser` service using the official `mcr.microsoft.com/playwright` Docker image (`https://playwright.dev/docs/docker`, accessed 2026-07-20). The image tag must match the chosen `@playwright/test` version at install time — the official docs explicitly require this: "ensure the Playwright version in your tests matches the version running in the Docker container" (`https://playwright.dev/docs/docker`, accessed 2026-07-20). This artifact deliberately does not pin a specific image tag; the install ticket must pick the image at install time so the image's Playwright version equals the chosen `@playwright/test` version.

### D3. Per-role session strategy: direct DB session seeding + `storageState`

`globalSetup` connects to the same Postgres that the running web uses, inserts one row per role (User, Organizer, Admin) into the `sessions` table (`src/db/schema.ts:55-66`), calls `sealSessionCookie({ sessionId })` (`src/auth/session.ts:39-51`) to obtain a sealed cookie, opens a Playwright context with that cookie, and writes `playwright/.auth/{user,organizer,admin}.json` `storageState` files via `await page.context().storageState({ path })` (`https://playwright.dev/docs/auth`, accessed 2026-07-20). Tests then `test.use({ storageState: 'playwright/.auth/organizer.json' })` and start already authenticated. This is the same direct-DB seeding pattern that `tests/auth-session-route.test.ts:61`, `tests/availability-overrides-route.test.ts:81`, and `tests/calendar-action-required-email-wiring-fixtures.ts:80` already use. **No generic auth bypass endpoint is proposed.**

### D4. Magic-link rendering: one dedicated rendered journey reads from a local/test-only mock Email outbox / transport capture seam

The default Playwright setup does **not** obtain a magic-link token from `email_events`. The `email_events` schema stores only a SHA256 `payload_reference`, not the payload itself (`src/db/schema.ts:272-291`; `src/email/service.ts:74-113`); the magic-link payload is passed only to the Graphile Worker `queueJob` (`src/email/service.ts:96-101`) and through the email transport (`src/email/transport.ts:41-50`). One dedicated rendered invite-then-magic-link browser journey is reserved, and for that journey the test reads the URL from a **new** local/test-only **mock Email outbox** (a sidecar listener that records the rendered mock messages the mock `EMAIL_ADAPTER=mock` transport produces) or, equivalently, a **transport capture seam** that the mock email transport writes through in `APP_ENV in {local,test}` only. Both shapes are pure local/test additions and do **not** require a production schema migration. This seam is new implementation work, gated on `APP_ENV in {local,test}` and on an explicit env flag, mirroring the existing `app/api/local/health` and `app/api/local/enqueue-smoke` shape.

A Postgres mirror-table alternative exists but is **not recommended** here: it would be a persistence-shape change (a new table plus a Drizzle migration) and would require separate authorization. If a later ticket needs durable queryable mock outbox history it can revisit that alternative.

### D5. Deterministic clock: server-side application-clock injection seam + Playwright `page.clock`

The locked single global clock (`AGENTS.md:23-24`) is owned at the app boundary. The existing `tests/fixtures/clock.ts:1-8` and `FIXTURE_DATE` from `tests/fixtures/seeds.ts:13` work **inside** the test process; for Playwright, `page.clock.install({ time: new Date(FIXTURE_DATE) })` overrides the **browser** clock (`https://playwright.dev/docs/clock`, accessed 2026-07-20) but does not reach the Next server, the Graphile Worker, or Postgres `now()`. The install ticket must add a server-side application-clock injection/config seam (env-controlled fixed clock in `APP_ENV in {local,test}` only) so that the running web and worker share the same frozen clock. Alternatively, the demo fixture can be made date-relative so it does not depend on `now()`. This seam is required new implementation work and is **not** already present in the source.

### D6. Provider mocks: local/test-only HTTP sidecar OR explicit startup adapter seam

The existing `tests/google-calendar-adapter.ts` and `tests/mock-microsoft-graph-adapter.ts` mocks work via `vi.stubGlobal("fetch", ...)` inside the Vitest process (`tests/e2e/choose-contributing-calendars-per-connection.test.ts:254-266`; `tests/e2e/disconnect-removes-tokens-and-prevents-further-sync.test.ts:175`; `tests/e2e/google-calendar-connect-freebusy-only-scopes.test.ts:167`; and others). That pattern does **not** cross the Playwright ↔ Next ↔ provider process boundary. The `CALENDAR_PROVIDER_MODE` env switch exposed by `src/config/runtime.ts:7,47-53` is **not** read by any production code path: `src/calendar/providers/index.ts:11-14` statically registers `googleCalendarProvider` and `microsoftCalendarProvider` only, and `app/me/calendar-connections/[id]/route.ts:87` and `app/me/calendar-connections/callback/route.ts:83` pass the global `fetch` directly into the provider modules. Playwright tests against a separately running Next server therefore need a **new** provider-mock boundary. Two safe options, both new implementation work:

- **Option D6a — local/test-only HTTP sidecar.** A small Node/Express or Fastify service that listens on `http://localhost:5678` and responds to the Google OAuth (`https://oauth2.googleapis.com/token`, `https://oauth2.googleapis.com/revoke`) and Microsoft Graph endpoints (`https://login.microsoftonline.com/organizations/oauth2/v2.0/token`, `https://login.microsoftonline.com/organizations/oauth2/v2.0/logout`, `https://graph.microsoft.com/v1.0/...`) with deterministic OAuth tokens, free/busy intervals, calendar listings, and webhook acks. The Next web process reads `APP_ENV=test` plus `LOCAL_PROVIDER_OVERRIDE_URL=http://e2e-provider-sidecar:5678` and rewrites outbound `fetch` to point at the sidecar. The sidecar is registered as a Docker Compose service gated on a profile.
- **Option D6b — explicit local/test startup adapter seam.** The Next web process, when started in `APP_ENV in {local,test}` with `LOCAL_PROVIDER_ADAPTER=mock`, installs an in-process `fetch` replacement at server-startup time that calls the existing `buildMockGoogleCalendarAdapter().getFetchImpl()` / `buildMockMicrosoftGraphAdapter().getFetchImpl()` factories. This is similar in shape to the existing `vi.stubGlobal("fetch", ...)` pattern but happens at server boot instead of test boot.

Either option keeps the production runtime untouched (gated on `APP_ENV` and an explicit env flag, mirroring `src/config/runtime.ts:63-86`).

### D7. Email mock: keep `EMAIL_ADAPTER=mock`; no SMTP parsing

`src/email/transport.ts:15-23` already returns a synthetic `providerMessageId` without any network call when `EMAIL_ADAPTER=mock`. The reserved rendered invite-then-magic-link journey (D4) reads the URL from the new local/test-only mock Email outbox / transport capture seam, not from SMTP.

### D8. Screenshots: per-screen baselines + per-state capture in a dedicated capture project/run

Two conventions in the recommended harness:

- **Per-screen baseline (regression)**: one full-page screenshot per screen in every named visible state (loading, populated, empty, error, stale). Saved under `tests/e2e-browser/screenshots/{screen}/{state}.png`. Captured with `await page.screenshot({ path, fullPage: true })` (`https://playwright.dev/docs/screenshots`, accessed 2026-07-20).
- **Per-journey capture (acceptance)**: a dedicated capture project/run, separate from the regular Playwright Test pass, with `video: 'on'` so the full happy-path screencast is recorded (`https://playwright.dev/docs/videos`, accessed 2026-07-20). Output is WebM; MP4 conversion, if required downstream, is a separate deterministic `ffmpeg` post-process and is not part of Playwright's defaults.

The two runs are separate because the regular Playwright Test pass uses `video: 'retain-on-failure'` to keep CI artifacts small; the capture run uses `video: 'on'` because the screencast is the acceptance artifact.

### D9. Traces: `trace: 'retain-on-failure'` only

The locked CI policy means browser tests run only on `workflow_dispatch`. In that lane, `trace: 'retain-on-failure'` produces `trace.zip` files only for failures (`https://playwright.dev/docs/trace-viewer`, accessed 2026-07-20). Local debugging can use `--trace on` to capture every trace.

### D10. Artifact location and retention: `playwright/.artifacts/` plus GitHub Actions artifact upload

- Screenshots: `tests/e2e-browser/screenshots/` (committed baselines) and `playwright/.artifacts/{journey}/` (not committed, uploaded as workflow artifacts).
- Videos: `test-results/*/video.webm` (not committed, uploaded). WebM is the default Playwright output (`https://playwright.dev/docs/videos`, accessed 2026-07-20).
- Traces: `test-results/*/trace.zip` (not committed, uploaded).
- Retention: 14 days for workflow artifacts; ephemeral locally.

### D11. Local execution: `pnpm test:e2e:browser` requires `pnpm local:up`

The new script checks that the web container responds at `http://localhost:3000/api/local/health` and refuses to start otherwise. Playwright uses the same health-check endpoint and the existing `local-verify` script (`scripts/local-verify.ts:55-71`) as its readiness gate.

### D12. CI execution: `workflow_dispatch` only; PR CI untouched

The existing `.github/workflows/ci.yml:1-39` runs `pnpm test` (Vitest) only. One new opt-in workflow (`browser-tests.yml`) is added. It is `workflow_dispatch` only — no `pull_request`, no `push`, no `schedule`, no merge-queue trigger. Any automatic CI execution is a future explicit decision that requires amending `AGENTS.md` to lift the CI policy lock, and is **out of scope** for the install ticket.

### D13. DB lifecycle ordering

Playwright `globalSetup` runs once per test run. The order must be:

1. Apply Drizzle migrations to the test database (`tests/helpers/test-db.ts:66-84` already does this for the unit/E2E suite).
2. Seed the deterministic fixture dataset (`tests/fixtures/seeds.ts:13-302`) into the test database.
3. Start (or wait for) the Next web and worker containers pointing at the same test database URL.
4. Insert per-role `sessions` rows and seal cookies.
5. Write `storageState` files.

Both web and worker must be configured with the test database URL **before startup** so they connect to the seeded database, not to a different one. The existing `docker-compose.yml:22-24,35-37` sets `DATABASE_URL` per service; the install ticket must extend this so the same URL is shared between the web, worker, and the browser-test service.

## Distinguishing component tests from complete route/navigation journeys

This distinction is the single most important architectural point for the audit's gap.

- **Component test (Vitest, not a real browser)**: a Vitest test that renders a React component in isolation against `happy-dom` via `@testing-library/react`. Existing examples: `tests/slot-details-drawer.test.tsx:1-7,132-231`, `tests/searches/results.test.tsx:1-7,38-183`, `tests/match-card.test.tsx:1-6,49-182`. These are not real-browser tests and the audit identifies them as non-browser evidence (`docs/research/mvp-web-screen-and-tracker-coverage.md:17-25`). They are kept as-is in the recommended harness.
- **Real-browser component test (future, only if needed)**: a Vitest Browser Mode test that renders one React component in isolation against the Playwright or WebdriverIO provider. Runs in a real browser but on a single page that contains only that component (`https://vitest.dev/config/browser/playwright`, accessed 2026-07-20). Catches CSS, layout, accessibility, and focused interaction bugs that `happy-dom` cannot reproduce. Listed here as Option 2 only; not adopted unless a later ticket proves a concrete `happy-dom`-only gap.
- **Complete route/navigation journey (Playwright Test)**: a Playwright Test spec that opens `http://localhost:3000/`, signs in via stored `storageState`, clicks through the role-aware shell, runs a Search, opens the Slot Details drawer, and verifies rendered text on the drawer panel. Requires a running web server, a per-role session, real navigation, real fetches to the in-app API, and at least one OAuth round trip mocked at the new provider-mock boundary. This is the missing evidence class the audit identified (`docs/research/mvp-web-screen-and-tracker-coverage.md:19-26`); Playwright Test is the only harness in this artifact that drives it end-to-end.

## External services and the safe-mock contract

The locked stack mandates "mocks implement only what the tests assert against" (`AGENTS.md:23-24`) and "mocks only external services" (`docs/research/mvp-web-screen-and-tracker-coverage.md:342`). The mocks in scope after the install ticket:

- **Postmark email**: `src/email/transport.ts:15-23` returns a synthetic `providerMessageId` when `EMAIL_ADAPTER=mock`. No network call. Test contract: every `emailEvent` row in the DB is the source of truth for tests that do not need the rendered email body.
- **Google Calendar API and Microsoft Graph API**: D6 — local/test-only HTTP sidecar (D6a) or explicit startup adapter seam (D6b). New implementation work. The existing `tests/google-calendar-adapter.ts` and `tests/mock-microsoft-graph-adapter.ts` factories are reused as the response generators inside the new boundary.
- **Mock Email outbox / transport capture seam (D4)**: local/test-only. Either a sidecar listener that records rendered mock messages, or a transport capture seam that the mock email transport writes through in `APP_ENV in {local,test}` only. **No production schema migration is required.** A Postgres mirror-table alternative exists but is a persistence-shape change requiring separate authorization and is not recommended here.

What is deliberately **not** mocked:

- **HTTP between the browser and the web app**: the browser hits the real `http://localhost:3000` URL. The locked boundary is "single full-stack web app" (`AGENTS.md:22`); proxying in-process requests would defeat the browser-evidence requirement.
- **The application code under test**: there are no shims for route handlers or repositories. Tests drive the running app.

## Repo seams and gaps with file:line references

These are the exact places the harness will plug in or will need a new seam. Listed by category.

### Existing seams the harness will reuse

- Mock email transport: `src/email/transport.ts:15-23`.
- Mock Google adapter factory: `tests/google-calendar-adapter.ts:65-305`. Reused as the response generator inside the new D6 boundary.
- Mock Microsoft adapter factory: `tests/mock-microsoft-graph-adapter.ts:61-271`. Reused as the response generator inside the new D6 boundary.
- `fetchImpl` injection in provider modules: `src/calendar/providers/google.ts:24,44`, `src/calendar/providers/microsoft.ts:29,49`.
- Session schema: `src/db/schema.ts:55-66`.
- Session override for unit tests: `src/auth/session.ts:33-37`.
- Sealed session cookies: `src/auth/session.ts:39-51`.
- Existing direct-DB session seeding pattern: `tests/auth-session-route.test.ts:61`, `tests/availability-overrides-route.test.ts:81`, `tests/calendar-action-required-email-wiring-fixtures.ts:80`.
- Fixture clock (test process only): `tests/fixtures/clock.ts:1-8`, `tests/helpers/setup.ts:38-52`.
- Seeded DB fixtures: `tests/fixtures/seeds.ts:13-302`, `tests/helpers/setup.ts:45-56`.
- Ephemeral Postgres in global setup: `tests/helpers/global-setup.ts:10-30`, `tests/helpers/test-db.ts:86-122`.
- Local runtime verification: `scripts/local-verify.ts:55-99`.
- Vitest project configs: `vitest.config.ts:1-20`, `vitest.e2e.config.ts:1-17`, `vitest.e2e-infra.config.ts:1-15`.
- Docker Compose stack: `docker-compose.yml:1-42`.
- Runtime env switches: `src/config/runtime.ts:7-53`.
- Health-check endpoint pattern: `src/local/enqueue-smoke.ts`, `scripts/local-verify.ts:55-71`.
- Search Result Next page (a working browser target): `app/searches/[id]/results/page.tsx:7-77`.
- Topics HTML route (a working browser target): `app/me/topics/route.ts:11-296`.
- Admin standalone HTML handlers (browser targets once the canonical pages exist): `src/admin/invites.ts:63-277`, `src/admin/users.ts:68-317`, `src/admin/topic-proposals.ts:51-226`, `src/admin/topics.ts:39-190`, `src/admin/operational-status.ts:48-193`.

### Existing seams that need strengthening before browser tests run

- **API route gap**: `app/searches/route.ts:7-33` returns JSON only and has no `POST` export. The audit identified `POST /searches` as a missing handler that the browser Search form depends on (`docs/research/mvp-web-screen-and-tracker-coverage.md:38-44,134-144`). Until `POST /searches` exists, the Search form-to-result journey cannot be browser-tested.
- **Calendar Connection callback path mismatch**: spec says `POST /me/calendar-connections/{id}/callback` (`docs/mvp-spec.md:284-286`); implementation uses `POST /me/calendar-connections/callback` (`app/me/calendar-connections/callback/route.ts:30-35`, `docs/research/mvp-web-screen-and-tracker-coverage.md:130`). Browser tests will assert against the implementation; the canonical contract decision is left to issue 277.
- **Search history route gap**: only JSON routes at `/search/history` and `/search/{id}/snapshot` (`app/search/history/route.ts:1-7`, `app/search/[id]/snapshot/route.ts:1-11`). A rendered Search history page is not yet built (`docs/research/mvp-web-screen-and-tracker-coverage.md:178-188`).
- **Role-aware shell**: `app/layout.tsx:9-14` emits only `<html>`, `<body>`, and children; the role-aware shell required by the prototype is absent (`docs/research/mvp-web-screen-and-tracker-coverage.md:21-22`). Browser tests of Admin navigation, Search, and Search history cannot land until that shell exists.
- **Calendar Connection page**: no rendered page exists; all Calendar Connection routes are JSON (`docs/research/mvp-web-screen-and-tracker-coverage.md:121-130`). Browser tests of the connection journey cannot land until the page is built.
- **Setup Home**: `app/page.tsx:1-8` is a two-line scaffold (`docs/research/mvp-web-screen-and-tracker-coverage.md:65-74`). The setup checklist cannot be browser-tested until it is built.

### New seams the harness requires

- `playwright.config.ts` at repo root.
- `tests/e2e-browser/**` directory with Playwright specs.
- `tests/e2e-browser/screenshots/` for committed per-screen baselines.
- `tests/helpers/playwright/global-setup.ts` that uses the existing `tests/helpers/test-db.ts:86-122` helpers, seeds fixtures, inserts per-role `sessions` rows, seals cookies, and writes `storageState`.
- New `docker-compose.yml` service for the Playwright run (image version matched to `@playwright/test`).
- New `package.json` script: `test:e2e:browser`. The existing `test`, `test:e2e`, and `test:e2e-infra` scripts remain unchanged.
- New `.github/workflows/browser-tests.yml` with `on: workflow_dispatch` only.
- **New** server-side application-clock injection/config seam (D5), gated on `APP_ENV in {local,test}`.
- **New** provider-mock boundary (D6) — either an HTTP sidecar (D6a) or an explicit local/test startup adapter seam (D6b).
- **New** local/test-only mock Email outbox / transport capture seam (D4), gated on `APP_ENV in {local,test}`. No production schema migration.

## Concrete shape of the recommended harness

This is the recommended harness. It is research, not a contract; issue 274 may refine it.

```
.
├── docker-compose.yml                       # add: e2e-browser service (image version = @playwright/test version)
├── package.json                             # add: @playwright/test, scripts (test:e2e:browser)
├── playwright.config.ts                     # new
├── tests/
│   ├── e2e-browser/
│   │   ├── auth.setup.ts                    # Playwright setup project: seeds DB, writes storageState per role
│   │   ├── journey-admin-invites-user.spec.ts
│   │   ├── journey-organizer-runs-search.spec.ts
│   │   ├── journey-user-connects-google-calendar.spec.ts
│   │   ├── journey-invite-magic-link.spec.ts # dedicated rendered magic-link journey (reads URL from D4 mock Email outbox / transport capture)
│   │   ├── screen-setup-home.spec.ts
│   │   ├── screen-search-history.spec.ts
│   │   ├── screen-calendar-connection.spec.ts
│   │   ├── capture/
│   │   │   ├── screencast.config.ts         # dedicated capture project: video='on'
│   │   │   └── screencast-routes.spec.ts
│   │   └── screenshots/                     # committed per-screen baselines
│   └── helpers/
│       └── playwright/
│           └── global-setup.ts              # migrations → seed → DB session insert → seal cookie → storageState
└── .github/
    └── workflows/
        ├── ci.yml                           # unchanged (Vitest only, no browser evidence)
        └── browser-tests.yml                # new, workflow_dispatch only (no PR, no push, no schedule, no merge queue)
```

The Vitest configs (`vitest.config.ts`, `vitest.e2e.config.ts`, `vitest.e2e-infra.config.ts`) remain unchanged. Vitest Browser Mode is not added unless a later ticket proves it is needed (Option 2).

## Stack extension authorization checklist (for issue 274 and AGENTS.md)

This artifact recommends a stack extension. The lock step is recorded so that issue 274 (and any subsequent `AGENTS.md` amendment) can lift it deterministically.

The recommended stack extension adds:

- `@playwright/test` (Playwright Test runner, fixtures, reporters, `webServer`, `storageState`).
- `playwright` (Playwright library; required peer of `@playwright/test`).
- `playwright.config.ts` at repo root.
- One opt-in workflow under `.github/workflows/browser-tests.yml` (`workflow_dispatch` only).
- One new Docker Compose service for the browser-runner image (version matched to `@playwright/test`).
- **New implementation work**: server-side application-clock injection seam (D5).
- **New implementation work**: provider-mock boundary (D6) — HTTP sidecar (D6a) or explicit local/test startup adapter seam (D6b).
- **New implementation work**: local/test-only mock Email outbox / transport capture seam (D4). No production schema migration.

What the extension does **not** add:

- No production-reachable behavior. The recommended stack extension does add source changes (new local/test-gated seams D4, D5, D6), but each seam short-circuits to a no-op when `APP_ENV` is `staging` or `production`, mirroring the env-only requirements at `src/config/runtime.ts:63-86` and the existing `app/api/local/health` and `app/api/local/enqueue-smoke` shape. No Postgres schema migration, no new production dependency, no production log surface.
- No relaxation of the locked test policy: Vitest remains the test framework; existing Vitest configs are unchanged; the new browser harness is added alongside, not in place of, Vitest.
- No relaxation of `single global clock at the app boundary`; the new server-side application-clock seam is the same value across web, worker, and Playwright browser context.
- No change to the locked CI policy: browser tests run on `workflow_dispatch` only; the existing `.github/workflows/ci.yml` is untouched.
- No change to the persistence shape; the harness uses the existing PostgreSQL container, ephemeral DB, and Graphile Worker shape. D4 uses a sidecar listener or transport capture seam, not a Postgres mirror table.
- No change to the implementation language or framework.
- No Vitest Browser Mode by default; the second-rank Option 2 is reserved for a future concrete requirement.

## Comparison: existing Vitest only (status quo, no browser evidence)

This option is rejected but documented here because it is the strongest "no stack extension" candidate.

- **What works**: full coverage of unit, domain, handler, and `happy-dom` component tests today. Existing examples: `tests/slot-details-drawer.test.tsx:1-7,132-231`, `tests/searches/results.test.tsx:1-7,38-183`, `tests/match-card.test.tsx:1-6,49-182`, and the 61 E2E tests under `tests/e2e/`.
- **What does not work for the audit's gap**: no real browser, no real navigation, no `webServer`, no `storageState`, no traces, no screencasts. The audit explicitly concludes that "no browser evidence" is the primary gap (`docs/research/mvp-web-screen-and-tracker-coverage.md:19-26,250-262`).
- **What about Vitest Browser Mode?** It would close the "real browser" sub-gap but does not provide `webServer`, `storageState`, screencasts, or the navigation harness that Playwright Test provides, and the project's own docs recommend augmenting it with a standalone runner for journey-class work (`https://vitest.dev/guide/browser/why`, accessed 2026-07-20).

## Uncertainty and boundaries

1. **No browser harness has been installed in this repository as of this audit.** This artifact recommends installing Playwright Test; the recommendation is research, not implementation. Issue 274 must decide and a follow-up `AGENTS.md` amendment must lift the relevant locks before installation (`AGENTS.md:23-32`).
2. **The local-stack health-check pattern at `scripts/local-verify.ts:55-71` proves the Docker Compose stack can run end-to-end.** That is strong evidence the recommended `e2e-browser` service will work; it is not evidence the service has been built.
3. **The provider-mock boundary (D6) is the largest unknown.** Two safe options are documented (D6a sidecar, D6b startup adapter); the install ticket must pick one and surface its trade-off. Either is new implementation work; neither exists in the audited tree.
4. **The server-side application-clock seam (D5) is required new work.** `tests/fixtures/clock.ts:1-8` is test-process only; the install ticket must add an env-controlled server clock seam so the running web and worker share the frozen fixture date with the Playwright browser context.
5. **The local/test-only mock Email outbox / transport capture seam (D4) is required new work for the one rendered magic-link journey.** It is gated on `APP_ENV in {local,test}` and on an explicit env flag. The recommended shape is a sidecar listener or a transport capture seam; a Postgres mirror-table alternative exists but is a persistence-shape change requiring separate authorization and is not recommended.
6. **No GitHub issue outside #273 was modified except parent map #271.** This is research only; the recommended stack extension is for issue 274 and a future `AGENTS.md` amendment. The pre-existing `docs/research/mvp-web-screen-and-tracker-coverage.md` is unchanged. The recommended Vitest Browser Mode adoption (Option 2) is a future explicit decision, not part of this research.

## Decisions later Wayfinder tickets must make

1. **Whether to adopt Option 1 (existing Vitest + Playwright Test) and amend `AGENTS.md` to lift the test-framework lock for the browser-harness add-on.** Issue 274 should decide.
2. **Whether to adopt Option 2 (Vitest Browser Mode + Playwright Test).** Only after a concrete `happy-dom`-cannot-reproduce-this requirement is documented by a later ticket. Not adopted by this research.
3. **D6a vs D6b.** Which provider-mock boundary the install ticket implements.
4. **D4 shape.** The exact form of the local/test-only mock Email outbox / transport capture seam (sidecar listener vs in-process transport capture).
5. **Capture run vs regular run.** Whether the capture project lives in the same `playwright.config.ts` as a separate project or in a separate config.
6. **Video format downstream.** Whether MP4 conversion is required downstream (separate `ffmpeg` step; not a Playwright default).
7. **Visual regression storage.** Whether committed baselines are tracked under `tests/e2e-browser/screenshots/` or elsewhere; whether baselines are regenerated by a manual workflow.
8. **Any automatic CI execution.** Reserved for a future explicit decision that lifts the CI policy lock via `AGENTS.md` amendment. Out of scope for this research.
