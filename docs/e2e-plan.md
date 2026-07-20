# SlotMerge E2E Test Plan

Companion to `docs/mvp-spec.md` (canonical implementation-ready spec) and the Wayfinder map ([issue #271](https://github.com/rafaelromao/slotmerge/issues/271)). This document is the canonical E2E plan for the MVP web app. It replaces the test-plan body of [issue #62](https://github.com/rafaelromao/slotmerge/issues/62) in-place; the issue is the plan-of-record index, and this document is the detailed plan.

Linked artifacts:

- [Canonical Next.js Page and API Architecture](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/canonical-next-page-api-architecture.md)
- [MVP Web-Screen and Tracker Coverage Audit](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/mvp-web-screen-and-tracker-coverage.md)
- [Browser Acceptance and Mocked Demo Options](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/browser-acceptance-and-mocked-demo-options.md)
- [Implementation Ticket Graph](implementation-graph.md)
- [AGENTS.md](../AGENTS.md) — the binding Browser Acceptance subsection and the "Rendered-screen and browser-journey completion gates" subsection.

## 1. Scope and evidence classes

The E2E plan covers the full MVP web app surface: every screen in `docs/mvp-spec.md` section 4, every inherited User / Organizer / Admin journey in section 3, and the cross-cutting closure gates recorded in `AGENTS.md`.

Evidence classes:

- **Rendered page**: a Next.js page or an HTTP response that emits user-visible HTML.
- **Rendered component**: a React component or HTML renderer tested in isolation, not a browser journey.
- **Handler / API**: an HTTP route or handler returning JSON, redirects, or standalone HTML without a browser.
- **Domain seam**: a repository, service, matching, worker, or provider boundary exercised without rendering the complete screen.
- **Browser evidence**: a Playwright Test that starts the running web app and drives it through a real browser.

The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:248-262` is the source of truth for the closure-evidence contract: a JSON response closes an API seam; a direct-function test closes a domain seam; neither closes a rendered screen or role journey. Every screen-level implementation ticket requires the full evidence set recorded in `AGENTS.md`.

## 2. Test framework and seams

- **Vitest** is the locked test framework (`AGENTS.md` Implementation stack). It covers unit tests, component tests, and the in-process E2E suite under `tests/e2e/`. PR CI runs Vitest only.
- **Playwright Test** is the locked real-browser harness (`AGENTS.md` Browser Acceptance subsection). It covers complete route / navigation journeys under `tests/e2e-browser/`. Playwright runs on `workflow_dispatch` only; PR CI does not run Playwright.
- **Sealed session cookies** with per-session CSRF: `src/auth/session.ts:39-51`. The session helper `sealSessionCookie` is used by Playwright `globalSetup` to mint per-role `storageState` files.
- **Sealed feedback tokens** (per the canonical architecture at `docs/research/canonical-next-page-api-architecture.md:5`): `@hapi/iron`-sealed query tokens that ride through the PRG redirect. Playwright reads the form's hidden `_csrf` field and the redirected URL's `?feedback=<sealed>` to drive validation-error paths.
- **Provider mocks**: the Playwright harness uses the D6a local/test-only HTTP sidecar (per the Browser Acceptance subsection) for Google and Microsoft provider responses. The D4 mock Email outbox records the rendered mock message for the one rendered magic-link journey. The D5 server-side application-clock injection seam pins the running web and worker to `FIXTURE_DATE` (`tests/fixtures/seeds.ts:13`).
- **Per-role authentication**: Playwright `globalSetup` inserts one row per role into the `sessions` table (`src/db/schema.ts:55-66`), calls `sealSessionCookie({ sessionId })` to obtain a sealed cookie, and writes `playwright/.auth/{user,organizer,admin}.json` `storageState` files via `await page.context().storageState({ path })` ([Playwright auth docs](https://playwright.dev/docs/auth)). Tests use `test.use({ storageState: 'playwright/.auth/organizer.json' })`. No generic auth bypass endpoint is added.
- **Clock control**: `page.clock.install({ time: new Date(FIXTURE_DATE) })` ([Playwright clock docs](https://playwright.dev/docs/clock)) overrides the browser's clock. The D5 server-side seam pins the running web and worker to the same value.

## 3. Coverage map (per screen)

The plan covers every screen in `docs/mvp-spec.md` section 4 with one happy-path journey and at least one failure-path journey, plus the three end-to-end role journeys in section 4.

| Spec screen | Happy path | Failure path | Source surface | Workflow module |
| --- | --- | --- | --- | --- |
| 4.1 — Invite and Magic Link | request, verify, land on `/` | three error states (`link_expired`, `link_used`, `link_invalid`) | `app/(public)/sign-in/page.tsx`, `/sign-in/sent`, `/sign-in/verify`; `app/auth/magic-link/{request,resend,verify}/route.ts` | `authWorkflow` |
| 4.2 — Setup Checklist Home | five cards; per-item Continue | missing profile timezone banner; pending Topic Proposal satisfies Topics | `app/page.tsx`; `app/(product)/layout.tsx` | `setupHomeWorkflow` |
| 4.3 — Discoverability Consent | grant; revoke; re-grant | `consent_required` | `app/(product)/me/discoverability/page.tsx` | `discoverabilityWorkflow.set` |
| 4.4 — Topics | select, save, propose, pending | similarity error; empty state | `app/(product)/me/topics/page.tsx` | `topicWorkflow.{listActive,listMyProposals,propose}` |
| 4.5 — Availability Windows | add weekly window, add override, block override, edit buffer | `end_before_start`, `overlap_existing_window`, `outside_day`, `invalid_time`, `date_required`, `profile_timezone_required` | `app/(product)/me/availability/page.tsx` | `availabilityWorkflow` |
| 4.6 — Calendar Connection | connect Google, select calendars, refresh, disconnect, reconnect | `unsupported` (Microsoft personal), `denied`, `failed`, `needs_reconnect` | `app/(product)/me/calendar-connections/page.tsx`; `app/me/calendar-connections/{connect/[provider],callback,[id]/{calendars,refresh,disconnect}}/route.ts` | `calendarConnectionWorkflow` |
| 4.7 — Organizer Search Form | per-Organizer defaults; Run Search | `selected_topics_required`, `minimum_out_of_range`, `duration_out_of_range`, `date_range_invalid`, `organizer_timezone_required`, `topic_retired` | `app/(product)/searches/page.tsx` | `searchWorkflow.{buildForm,run}` |
| 4.8 — Weekly Search Result Calendar | grid; week navigation; stale marker | empty state (zero Matches below threshold); not-found | `app/(product)/searches/[id]/page.tsx` | `searchWorkflow.openSnapshot` |
| 4.9 — Slot Details Drawer | open on Slot click; per-Match row content | stale match; one-Match | `app/components/SlotDetailsDrawer.tsx` (existing client island) | `searchWorkflow.openSnapshot` |
| 4.10 — Search History | chronological list; Open snapshot; Re-run | empty state; pagination | `app/(product)/searches/history/page.tsx` | `searchWorkflow.{listHistory,rerun}` |
| 4.11 — Admin Topic Curation | Approve; Reject; Retire | `proposal_already_decided`; `topic_not_active`; own-proposal retire blocked | `app/(product)/admin/page.tsx` (Topics section) | `adminTopicsWorkflow` |
| 4.12 — Admin Invites and Roles | invite; role change; suspend; reinstate; recent invites | `email_already_invited`; `self_role_change`; `confirm_mismatch`; `user_already_suspended` | `app/(product)/admin/page.tsx` (Users section) | `adminUsersWorkflow` |
| 4.13 — Admin Operational Status | generated timestamp; Email health; Calendar summary; Tokens table | `needs_reconnect` warning banner; failure rate > 5% banner | `app/(product)/admin/page.tsx` (Status section) | `adminStatusWorkflow` |

Each row maps to one Playwright happy-path spec and at least one Playwright failure-path spec under `tests/e2e-browser/`.

## 4. End-to-end role journeys

Three end-to-end Playwright journeys, one per role, that drive the full canonical happy path. The three journeys are the only Playwright projects that must pass before the corresponding sub-PRD can close.

- **User end-to-end** (`tests/e2e-browser/journeys/user/end-to-end.spec.ts`): Admin invites → magic-link verify → setup checklist → profile → consent → Topics → Availability → Calendar Connection → sign-out. Uses the User `storageState`. Every step is a distinct `test.describe` block so failures point at the right surface.
- **Organizer end-to-end** (`tests/e2e-browser/journeys/organizer/end-to-end.spec.ts`): signed-in Organizer → Search form → result → Slot Details drawer → Search history → Re-run. Uses the Organizer `storageState`.
- **Admin end-to-end** (`tests/e2e-browser/journeys/admin/end-to-end.spec.ts`): signed-in Admin → `/admin` → invite → role change → suspend → reinstate → approve Topic Proposal → reject Topic Proposal → retire Topic → Status page. Uses the Admin `storageState`.

The end-to-end journeys are the closure-evidence anchor for the parent-PRD closure tickets (T24 / T25 in the implementation ticket graph).

## 5. Failure-path tests

Failure-path tests cover the typed `Result<T, E>` return shape of every workflow module. They are organized per surface:

- **Auth**: rate-limited, non-invited email, used token, expired token, suspended user.
- **Setup**: profile timezone required, zero Topics selected, similarity-blocked Topic proposal.
- **Calendar Connection**: Microsoft personal account (`unsupported`), denied consent (`denied`), provider failure (`failed`), `needs_reconnect` after token expiry.
- **Search**: zero Topics selected, minimum out of range, duration out of range, date range invalid, retired Topic in submitted form.
- **Search Result**: Search not found, snapshot unavailable, role failure (not Organizer/Admin).
- **Admin Users**: self-role change, self-suspend, `email_already_invited`, `confirm_mismatch`, suspended user already suspended.
- **Admin Topics**: proposal already decided, duplicate topic name, self-retire-blocked.
- **Self-delete**: typed-confirm mismatch, `confirm_required`.

## 6. Component tests

Component tests cover every per-page server component and any client island. The existing component tests in `tests/match-card.test.tsx`, `tests/slot-details-drawer.test.tsx`, and `tests/searches/results.test.tsx` (per the audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:25`) use `renderToString` + `happy-dom`. New component tests for the role-aware shell (`app/(product)/layout.tsx`, `app/(product)/_components/TopBar.tsx`, `HeaderMenuToggle`), the setup checklist view, the Topics form, the availability form, the calendar-connection page, the search form, the search-result page, and the admin sections follow the same pattern. Every component test asserts the rendered HTML's structural shape (data-testid, aria-label, role, form field names) per the [Rendered-screen and browser-journey completion gates](https://github.com/rafaelromao/slotmerge/issues/279).

The `SlotDetailsDrawer` retains its existing interactive `happy-dom` test (`tests/slot-details-drawer.test.tsx:132-231`) for open/close/Escape/focus behavior. The `HeaderMenuToggle` client component gets a single `happy-dom` test for `aria-expanded` flip.

## 7. Capture and visual regression

- **Per-screen baseline**: one full-page screenshot per screen in every named visible state (loading, populated, empty, error, stale). Saved under `tests/e2e-browser/screenshots/{screen}/{state}.png`. Compared via Playwright's `toMatchScreenshot` or `expect(page).toHaveScreenshot()` with tolerance. Baselines are committed to the repo; the capture project regenerates them on demand. The Vitest docs warn that visual regression is unstable across environments ([Vitest visual regression testing](https://vitest.dev/guide/browser/visual-regression-testing, accessed 2026-07-20)); the convention is to take all baselines inside the Playwright Docker image so local reproduction matches CI.
- **Per-journey capture**: a dedicated capture project with `video: 'on'` ([Playwright videos](https://playwright.dev/docs/videos, accessed 2026-07-20)) records a full happy-path screencast per journey. Output is WebM; MP4 conversion is a separate downstream `ffmpeg` step.
- **Per-test traces**: `trace: 'retain-on-failure'` ([Playwright trace viewer](https://playwright.dev/docs/trace-viewer, accessed 2026-07-20)) produces `trace.zip` files only for failures. Local debugging can use `--trace on`.
- **Retention**: 14 days for workflow artifacts. Screenshot baselines are committed; ephemeral capture artifacts are uploaded to GitHub Actions artifacts.

## 8. CI gate policy

The locked "E2E tests are not executed in CI" decision (`AGENTS.md:24`) is preserved. PR CI runs `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (Vitest only). Playwright and the visual capture run only on the `workflow_dispatch` lanes `browser-tests.yml` and `visual-regression.yml`. Any future automatic CI execution requires a new tracker issue that explicitly lifts this CI policy lock and updates the `AGENTS.md` Browser Acceptance subsection.

## 9. Determinism

- **Server clock**: the D5 server-side application-clock injection seam pins the running web and worker to `FIXTURE_DATE` (`tests/fixtures/seeds.ts:13`) in `APP_ENV in {local, test}` only.
- **Browser clock**: `page.clock.install({ time: new Date(FIXTURE_DATE) })` ([Playwright clock](https://playwright.dev/docs/clock, accessed 2026-07-20)) aligns the browser's clock with the server.
- **Fixtures**: `tests/fixtures/seeds.ts:13-302` defines deterministic IDs (`USER_FIXTURES`, `TOPIC_FIXTURES`, `SESSION_FIXTURES`).
- **Secrets**: cookies and CSRF tokens are generated fresh per test run; the `storageState` files are written once per test run and re-read per test.
- **Network**: provider responses come from the D6a local/test-only HTTP sidecar; the harness never hits a live provider.

## 10. Mock contract

- **Email**: `EMAIL_ADAPTER=mock` (`src/email/transport.ts:15-23`); the D4 mock Email outbox records the rendered mock message for the one rendered magic-link journey. The default mock adapter returns a synthetic `providerMessageId`; tests assert on the `emailEvents` table.
- **Google Calendar**: D6a local/test-only HTTP sidecar fronts `https://oauth2.googleapis.com/token`, `https://oauth2.googleapis.com/revoke`, and `https://www.googleapis.com/calendar/v3/freeBusy`. Responses are deterministic OAuth tokens, free/busy intervals, calendar listings, and webhook acks. Tests inspect `oauthCallbacks`, `freeBusyQueries`, `webhookDeliveries`, `requestedScopes` on the mock adapter.
- **Microsoft Graph**: D6a sidecar fronts `https://login.microsoftonline.com/organizations/oauth2/v2.0/token`, `https://login.microsoftonline.com/organizations/oauth2/v2.0/logout`, and `https://graph.microsoft.com/v1.0/...`. Responses mirror the Google shape plus the `accountKind: "work-school" | "personal"` switch. Tests inspect `getScheduleCalls`, `primaryCalendarCalls`, `webhookDeliveries`.
- **Worker**: the `vitest` E2E suite (`vitest.e2e.config.ts:1-17`) runs Graphile Worker in-process; the Playwright suite runs the worker in the same Docker Compose stack as the web container, with the D5 server clock seam and the deterministic fixtures.

## 11. Plan-of-record

- **Owner of this plan**: [issue #62](https://github.com/rafaelromao/slotmerge/issues/62) — the E2E test plan issue is the index. Its body is updated in place when this document changes.
- **Owner of the binding closure gates**: [issue #279](https://github.com/rafaelromao/slotmerge/issues/279) — the rendered-screen and browser-journey completion gates are recorded in `AGENTS.md` and bind every implementation ticket.
- **Owner of the binding browser harness**: [issue #274](https://github.com/rafaelromao/slotmerge/issues/274) — the browser acceptance and capture gates; the AGENTS.md Browser Acceptance subsection is the binding surface.
- **Owner of the implementation ticket graph**: `docs/implementation-graph.md` and [issue #271](https://github.com/rafaelromao/slotmerge/issues/271) — the Wayfinder map's Decisions-so-far is the index.
- **Owner of the canonical spec**: `docs/mvp-spec.md` — the spec is the binding contract for what the test plan covers.

When this document changes, the next agent updates issue #62's body, the implementation ticket graph, and the relevant test files; PR CI runs the updated Vitest suite; the workflow_dispatch lane runs the updated Playwright suite.

## 12. Closure criteria for the E2E plan

The E2E plan closes when every screen in `docs/mvp-spec.md` section 4 is covered by a Playwright happy-path spec, a Playwright failure-path spec, and a Vitest unit test, and the three end-to-end role journeys pass under the locked browser harness. The parent-PRD closure tickets T24 and T25 (per `docs/implementation-graph.md`) are the binding closure gates; the E2E plan is one of the AGENTS.md acceptance-bar items every implementation ticket must check.
