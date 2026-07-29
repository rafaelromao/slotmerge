# Closure-evidence repair audit

## Scope

This document records the audit of [issue #347](https://github.com/rafaelromao/slotmerge/issues/347) ("Repair implementation-ticket closure evidence") and the corrective evidence record for every deficient implementation ticket identified. It is the canonical artifact for revalidation of the journey maps and PRDs and is pinned by [`tests/closure-evidence-repair.test.ts`](https://github.com/rafaelromao/slotmerge/blob/main/tests/closure-evidence-repair.test.ts).

The audit scope is restricted to **implementation tickets** — the implementation tickets in `docs/implementation-graph.md` (T1–T23), the dependent fix tickets for issue #347 (#343, #344, #345, #346), the five sub-PRD parents (#15, #16, #17, #18, #19), and the screen-level tickets whose "Closed by sandman — issue already completed" stand-alone closure comment remained after the audit window opened. The audit does not reopen closed PRs; it repairs their closure-evidence records by posting corrective comments on the offending issues and pinning the result with a Vitest guard.

## Deficient categories

The audit identified two categories of deficiency. Each is fixed in this change request by posting a new closure-evidence comment on the offending issue that supersedes the prohibited stand-alone comment and supplies the missing links.

### Category A — Prohibited stand-alone "Closed by sandman — issue already completed." comment

`AGENTS.md` rendered-screen and browser-journey completion gates (line 66) state:

> The legacy "Closed by sandman — issue already completed" auto-closure comment is not a substitute for the closure-evidence set and remains disallowed as a stand-alone closure reason.

The audit located every implementation ticket closed between the T22 land and the audit-window open where the only top-level comment is that prohibited string. Sixteen implementation tickets were affected and are listed in the `## Per-ticket evidence — Category A` section. The corrective comment is posted on each individual issue so the comment lives above the prohibited stand-alone comment and supersedes it for revalidation.

### Category B — Implementation ticket closed without any closing comment

Four dependent fix tickets (#343, #344, #345, #346) closed via merge-only events without a closing reference comment. Their closing PR bodies contain only the `Closes #<n>` reference and no per-ticket evidence links. The audit groups these under `## Per-ticket evidence — Category B`. The corrective comment is posted on each individual issue so the durable, evidence-bearing record exists independently of the closing PR body.

## Closure-evidence standard

Every row in `## Per-ticket evidence` below satisfies the seven fields the AGENTS.md rendered-screen and browser-journey completion gate enumerates (`AGENTS.md` lines 51–66). The seven required fields are recorded as columns A–G below:

- **A. Playwright journey** — the `tests/e2e-browser/journeys/{user,organizer,admin}/...spec.ts` file or `n/a — <reason>` for tickets whose deliverable is a deep module, a specification, or a sub-PRD parent.
- **B. Vitest unit test** — the `*.test.ts` file under `src/**` or `tests/**` exercising the typed `Result<T, E>` return shape (workflow boundary) or the equivalent for non-workflow modules.
- **C. Component test** — the `*.test.tsx` file using `renderToString` + `happy-dom` for the per-page server component / client island, or `n/a — <reason>` for tickets that do not change a rendered surface.
- **D. Visual capture (committed baseline)** — the per-state PNG path under `tests/e2e-browser/screenshots/{screen}/{state}.png` (committed to the repo) or `n/a — <reason>` for tickets that do not own a screen surface.
- **E. Visual capture (workflow artifact)** — the WebM capture upload on the `workflow_dispatch` `visual-regression.yml` lane per `AGENTS.md` line 65, or `n/a — <reason>` for tickets that do not own a screen surface.
- **F. AGENTS.md acceptance bar** — the subset of items from `AGENTS.md` lines 51–66 that apply, plus the per-ticket AC list from the original issue body.
- **G. Closure-evidence corrective comment** — the new top-level comment posted on the offending issue by this change request, which supersedes the prohibited stand-alone comment or fills the missing-comment gap and is identified by URL `https://github.com/rafaelromao/slotmerge/issues/<ticket>#issuecomment-<id>` after the comment is posted.

For tickets with `n/a` in any cell the rationale is recorded as `n/a — <reason>` and cross-references `docs/implementation-graph.md` (or `docs/mvp-spec.md` for the localTime contract) so the rationale is auditable.

## Per-ticket evidence — Category A (prohibited stand-alone comment)

Each row is one implementation ticket. The Vitest guard pins the row count, the row identifiers, the issue URLs, the closing PR URL (where applicable), and the canonical Vitest / Playwright / visual-capture paths.

### A1. [#15](https://github.com/rafaelromao/slotmerge/issues/15) Sub-PRD: Search & Matching

- **A. Playwright journey**: `tests/e2e-browser/journeys/organizer/*.spec.ts` (T11–T15 per `docs/implementation-graph.md`).
- **B. Vitest unit test**: `tests/workflow-search.test.ts`, `src/api/serializers.test.ts`.
- **C. Component test**: `tests/app-searches-page.test.tsx`, `tests/search-result-page.test.tsx`, `tests/search-history-page.test.tsx`, `tests/slot-details-drawer.test.tsx`, `tests/api-v1-me-setup-status.test.ts`, `tests/api-v1-searches-list.test.ts`, `tests/api-v1-searches-id.test.ts`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/search-form/`, `tests/e2e-browser/screenshots/search-result/`, `tests/e2e-browser/screenshots/search-history/`, `tests/e2e-browser/screenshots/organizer/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65 (WebM capture upload).
- **F. AGENTS.md acceptance bar**: T24 entry in `docs/implementation-graph.md` line 218; AGENTS.md lines 51–66 reproduced in `docs/t24-closure-evidence.md` and `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment**: posted on issue [#15](https://github.com/rafaelromao/slotmerge/issues/15#issuecomment-5111821232).

### A2. [#16](https://github.com/rafaelromao/slotmerge/issues/16) Sub-PRD: Auth & Invites

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/magic-link.spec.ts` (T3).
- **B. Vitest unit test**: `src/workflow/auth.test.ts`.
- **C. Component test**: `tests/app-sign-in-page.test.tsx`, `tests/app-sign-in-sent-page.test.tsx`, `tests/app-sign-in-verify-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/sign-in/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T3 entry in `docs/implementation-graph.md` line 39; lines 51–66 reproduced in `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment**: posted on issue [#16](https://github.com/rafaelromao/slotmerge/issues/16#issuecomment-5111821426).

### A3. [#17](https://github.com/rafaelromao/slotmerge/issues/17) Sub-PRD: Calendar Connections

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8).
- **B. Vitest unit test**: `src/workflow/calendar-connection.test.ts`.
- **C. Component test**: `tests/app-me-calendar-connections-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/calendar-connections/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; lines 51–66 reproduced in `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment**: posted on issue [#17](https://github.com/rafaelromao/slotmerge/issues/17#issuecomment-5111821672).

### A4. [#18](https://github.com/rafaelromao/slotmerge/issues/18) Sub-PRD: Admin & Notifications

- **A. Playwright journey**: n/a — T17, T18, and T19 are open at audit time per `docs/t24-closure-evidence.md` `## Open blockers`; the journeys are landed for T16 only.
- **B. Vitest unit test**: n/a at the sub-PRD layer; per-ticket Vitest pinning via `src/workflow/admin-users.test.ts`, `src/workflow/admin-topics.test.ts`, `src/workflow/calendar-connection.test.ts`.
- **C. Component test**: `tests/app-admin-page.test.tsx`, `tests/app-admin-status-section.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/admin/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T16–T19 entries in `docs/implementation-graph.md` lines 157–189; lines 51–66 reproduced in `docs/t24-closure-evidence.md`.
- **G. Corrective comment**: posted on issue [#18](https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5111821884); the comment records the open T17/T18/T19 status per the `## Open blockers` table.

### A5. [#19](https://github.com/rafaelromao/slotmerge/issues/19) Sub-PRD: Profile & Setup

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/profile.spec.ts`, `discoverability.spec.ts`, `topics.spec.ts`, `availability.spec.ts`, `self-delete.spec.ts`.
- **B. Vitest unit test**: `src/profile/profile-workflow.test.ts`, `src/workflow/discoverability.test.ts`, `src/topics/topic-workflow.test.ts`, `src/workflow/availability.test.ts`, `src/workflow/account.test.ts`.
- **C. Component test**: `tests/app-me-profile-page.test.tsx`, `tests/discoverability-view.test.tsx`, `tests/app-me-topics-page.test.tsx`, `tests/app-me-availability-page.test.tsx`, `tests/app-me-delete-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/user/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T4–T9 entries in `docs/implementation-graph.md` lines 47–97; lines 51–66 reproduced in `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment**: posted on issue [#19](https://github.com/rafaelromao/slotmerge/issues/19#issuecomment-5111822022).

### A6. [#33](https://github.com/rafaelromao/slotmerge/issues/33) Define weekly Availability Windows in profile timezone

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/availability.spec.ts` (T7).
- **B. Vitest unit test**: `src/workflow/availability.test.ts`, `tests/e2e/define-weekly-availability-windows.test.ts`.
- **C. Component test**: `tests/app-me-availability-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/user/availability/` (per-state PNGs from T7 capture run).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T7 entry in `docs/implementation-graph.md` line 75; issue #33 acceptance criteria 1–2; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#33](https://github.com/rafaelromao/slotmerge/issues/33#issuecomment-5111822140).

### A7. [#37](https://github.com/rafaelromao/slotmerge/issues/37) Invite a User with email and role from Admin UI

- **A. Playwright journey**: `tests/e2e-browser/journeys/admin/users.spec.ts` (T16).
- **B. Vitest unit test**: `src/workflow/admin-users.test.ts`, `tests/e2e/admin-invites-user-from-admin-users-screen.test.ts`, `tests/e2e/admin-invites-refresh-transaction.test.ts`.
- **C. Component test**: `tests/app-admin-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/admin/users/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T16 entry in `docs/implementation-graph.md` line 157; issue #37 acceptance criteria 1–3; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#37](https://github.com/rafaelromao/slotmerge/issues/37#issuecomment-5111822257).

### A8. [#45](https://github.com/rafaelromao/slotmerge/issues/45) Encrypt Calendar Connection OAuth tokens at rest

- **A. Playwright journey**: n/a — deep-module security fix; the per-page journey is captured by `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8).
- **B. Vitest unit test**: `tests/calendar-token-encryption.test.ts`.
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #45 acceptance criteria 1–3; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#45](https://github.com/rafaelromao/slotmerge/issues/45#issuecomment-5111822349).

### A9. [#49](https://github.com/rafaelromao/slotmerge/issues/49) Disconnect a Calendar Connection

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8).
- **B. Vitest unit test**: `src/workflow/calendar-connection.test.ts`, `tests/e2e/disconnect-removes-tokens-and-prevents-further-sync.test.ts`.
- **C. Component test**: `tests/app-me-calendar-connections-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/calendar-connections/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #49 acceptance criteria 1–2; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#49](https://github.com/rafaelromao/slotmerge/issues/49#issuecomment-5111822465).

### A10. [#52](https://github.com/rafaelromao/slotmerge/issues/52) Trigger Calendar Connection action-required email

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8).
- **B. Vitest unit test**: `src/workflow/calendar-connection.test.ts`, `tests/e2e/action-required-email-on-token-revocation.test.ts`, `tests/calendar-action-required-email-wiring.test.ts`.
- **C. Component test**: n/a — the email is async and not a rendered surface.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #52 acceptance criteria 1–2; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#52](https://github.com/rafaelromao/slotmerge/issues/52#issuecomment-5111822597).

### A11. [#98](https://github.com/rafaelromao/slotmerge/issues/98) E2E test: Calendar Connection action-required state sends email

- **A. Playwright journey**: n/a — the screen-level Playwright journey is captured by `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8); the deliverable of #98 is the Vitest E2E test file.
- **B. Vitest unit test**: `tests/e2e/action-required-email-on-token-revocation.test.ts`.
- **C. Component test**: n/a — lower-level Vitest test only.
- **D. Visual capture (committed)**: n/a — lower-level Vitest test only.
- **E. Visual capture (workflow artifact)**: n/a — lower-level Vitest test only.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #98 acceptance criteria; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#98](https://github.com/rafaelromao/slotmerge/issues/98#issuecomment-5111822850).

### A12. [#108](https://github.com/rafaelromao/slotmerge/issues/108) E2E test: clicking a Slot opens a drawer with matching Users

- **A. Playwright journey**: `tests/e2e-browser/journeys/organizer/search-result.spec.ts` (T12).
- **B. Vitest unit test**: `tests/workflow-search.test.ts`, `tests/e2e/slot-shows-stale-marker-when-calendar-connection-is-stale.test.ts`.
- **C. Component test**: `tests/slot-details-drawer.test.tsx`, `tests/search-result-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/search-result/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T12 entry in `docs/implementation-graph.md` line 121; issue #108 acceptance criteria; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#108](https://github.com/rafaelromao/slotmerge/issues/108#issuecomment-5111823096).

### A13. [#114](https://github.com/rafaelromao/slotmerge/issues/114) E2E test: match only considers setup-complete users

- **A. Playwright journey**: `tests/e2e-browser/journeys/user/setup-home.spec.ts` (T1).
- **B. Vitest unit test**: `tests/e2e/setup-checklist-gates-matching-eligibility.test.ts`, `tests/workflow-search.test.ts`.
- **C. Component test**: `tests/app-setup-home-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/setup-home/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T1 entry in `docs/implementation-graph.md` line 20; issue #114 acceptance criteria; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#114](https://github.com/rafaelromao/slotmerge/issues/114#issuecomment-5111823282).

### A14. [#279](https://github.com/rafaelromao/slotmerge/issues/279) Define rendered-screen and browser-journey completion gates

- **A. Playwright journey**: n/a — specification ticket; the Playwright journeys are enumerated downstream by each surface ticket.
- **B. Vitest unit test**: `tests/t24-closure-evidence.test.ts`, `tests/t25-closure-evidence.test.ts`, `tests/closure-evidence-repair.test.ts` (this audit).
- **C. Component test**: n/a — specification ticket.
- **D. Visual capture (committed)**: n/a — specification ticket.
- **E. Visual capture (workflow artifact)**: n/a — specification ticket.
- **F. AGENTS.md acceptance bar**: the AGENTS.md completion gates encoded at lines 51–66 are the deliverable; the gate text is reproduced verbatim in `docs/t24-closure-evidence.md` and `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment**: posted on issue [#279](https://github.com/rafaelromao/slotmerge/issues/279#issuecomment-5111823471).

### A15. [#307](https://github.com/rafaelromao/slotmerge/issues/307) T21 E2E plan #62 in-place update

- **A. Playwright journey**: n/a — at the plan layer; the per-screen Playwright journeys are enumerated downstream in issue #62 (the deliverable).
- **B. Vitest unit test**: `tests/retired-routes.test.ts`, `tests/e2e-plan.test.ts`.
- **C. Component test**: n/a — plan layer.
- **D. Visual capture (committed)**: n/a — plan layer.
- **E. Visual capture (workflow artifact)**: n/a — plan layer.
- **F. AGENTS.md acceptance bar**: T21 entry in `docs/implementation-graph.md` line 199; issue #62 body content (the deliverable); AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#307](https://github.com/rafaelromao/slotmerge/issues/307#issuecomment-5111823640).

### A16. [#326](https://github.com/rafaelromao/slotmerge/issues/326) Commit Search-form visual-capture baselines

- **A. Playwright journey**: `tests/e2e-browser/journeys/organizer/search-form.spec.ts` (T11).
- **B. Vitest unit test**: `tests/workflow-search.test.ts`.
- **C. Component test**: `tests/app-searches-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/search-form/{after-run.png, date-range-invalid.png, date-range-too-long.png, defaults.png, duration-out-of-range.png, minimum-out-of-range.png, selected-topics-required.png, timezone-required.png, topic-retired.png}` plus the `tests/e2e-browser/screenshots/search-form/README.md` index.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65 (WebM capture upload).
- **F. AGENTS.md acceptance bar**: T11 entry in `docs/implementation-graph.md` line 111; issue #326 acceptance criteria 1–5; AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#326](https://github.com/rafaelromao/slotmerge/issues/326#issuecomment-5111823794).

## Per-ticket evidence — Category B (missing closing comment)

### B1. [#343](https://github.com/rafaelromao/slotmerge/issues/343) Fix Search candidate preparation to run once per Search

- **A. Playwright journey**: n/a — deep-module refactor; the screen-level journeys (T11, T12, T15) cover the Search surface.
- **B. Vitest unit test**: `src/search/search-snapshot-assembler.test.ts`, `tests/workflow-search.test.ts` (per-dependency call count assertions across the full Search path).
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: issue #343 acceptance criteria 1–5 (each eligible candidate prepared at most once; validation + assembly share the prepared set; Search Result JSON shape unchanged; per-dependency call counts asserted; PR CI green); AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#343](https://github.com/rafaelromao/slotmerge/issues/343#issuecomment-5111806044).
- **Closing PR**: [#350](https://github.com/rafaelromao/slotmerge/pull/350).

### B2. [#344](https://github.com/rafaelromao/slotmerge/issues/344) Restore repo-wide AppClock boundary ownership

- **A. Playwright journey**: n/a — cross-cutting boundary.
- **B. Vitest unit test**: `tests/appclock-boundary-migration.test.ts`, `tests/poll-clock-seam.test.ts`, `tests/sync-clock-seam.test.ts`, `tests/email-clock-seam.test.ts`, `tests/calendar-callback-get.test.ts`, `tests/microsoft-calendar-connection-state.test.ts`, `tests/microsoft-calendar-start.test.ts`, `tests/microsoft-calendar-complete.test.ts`, `tests/microsoft-calendar-revoke.test.ts`, `tests/topic-proposals-route.test.ts`, `tests/me-topic-proposals-route.test.ts`, `tests/me-route.test.ts`, `tests/google-calendar-connections.test.ts`.
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: issue #344 acceptance criteria 1–4 (migration-completeness test; boundary-required clock; per-handler clock parameter; existing tests pass); AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#344](https://github.com/rafaelromao/slotmerge/issues/344#issuecomment-5111809903).
- **Closing PR**: [#353](https://github.com/rafaelromao/slotmerge/pull/353).

### B3. [#345](https://github.com/rafaelromao/slotmerge/issues/345) Complete Admin Invite shell and repository migration

- **A. Playwright journey**: n/a — the Admin Users journey was landed for T16 (PR #323).
- **B. Vitest unit test**: `src/admin/invites.test.ts`, `src/admin/invites.repository.test.ts`, `tests/admin-shell-repository-migration.test.ts`.
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: issue #345 acceptance criteria 1–6 (shell delegation; access-denied responses; Invite persistence boundary; repository-migration test; regression test on `createPostErrorResponse`; PR CI green); AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#345](https://github.com/rafaelromao/slotmerge/issues/345#issuecomment-5111812970).
- **Closing PR**: [#352](https://github.com/rafaelromao/slotmerge/pull/352).

### B4. [#346](https://github.com/rafaelromao/slotmerge/issues/346) Resolve localTime timezone validation contract

- **A. Playwright journey**: n/a — deep-module contract; the Profile / Search-form error surfaces are covered by the T4 (Profile) and T11 (Search form) journeys.
- **B. Vitest unit test**: `src/time/local-time.test.ts`.
- **C. Component test**: n/a — no new rendered surface; the existing T4/T11 component tests cover the profile and search-form surfaces that consume the contract.
- **D. Visual capture (committed)**: n/a — no new rendered surface.
- **E. Visual capture (workflow artifact)**: n/a — no new rendered surface.
- **F. AGENTS.md acceptance bar**: issue #346 acceptance criteria 1–5 (`Intl` round-trip strict equality; `Asia/Kathmandu` documented alias; casing / abbreviation / unknown-string rejection; mvp-spec 6.10 Timezone Validation Contract subsection; PR CI green); AGENTS.md PR-CI gates.
- **G. Corrective comment**: posted on issue [#346](https://github.com/rafaelromao/slotmerge/issues/346#issuecomment-5111815637).
- **Closing PR**: [#351](https://github.com/rafaelromao/slotmerge/pull/351).

## Corrective comment template

Each corrective comment is posted at the issue top-level so it lives above the prohibited stand-alone comment and therefore supersedes it for revalidation. The verbatim template:

```markdown
## Closure Evidence (audit-repair from #347)

This ticket's deliverable, the closing PR, and the relevant evidence set are pinned by [`docs/closure-evidence-repair.md`](https://github.com/rafaelromao/slotmerge/blob/main/docs/closure-evidence-repair.md) as part of the [#347 audit](https://github.com/rafaelromao/slotmerge/issues/347). The previous stand-alone "Closed by sandman — issue already completed." comment is superseded by this record per AGENTS.md line 66.

- **Playwright journey**: <A cell from the per-ticket evidence row>
- **Vitest unit test**: <B cell from the per-ticket evidence row>
- **Component test**: <C cell from the per-ticket evidence row>
- **Visual capture (committed baselines)**: <D cell from the per-ticket evidence row>
- **Visual capture (workflow artifact)**: <E cell from the per-ticket evidence row>
- **AGENTS.md acceptance bar**: <F cell from the per-ticket evidence row>
- **Closing PR**: <G cell linking to #N from the per-ticket evidence row>

Closing reference: `Closes #<ticket>`; this comment is the audited closure-evidence record.
```

The wording on every corrective comment matches the template, with substitutions drawn from the per-ticket evidence rows above. The Vitest guard pins the cross-reference so a future re-audit cannot silently regress the ticket set.

## Reopening safety

Per `sandman-implement` Hard Rule 3, the original implementation ticket's `Closes #<N>` keyword on the closing PR still owns the auto-close behavior on merge. The corrective comment does not reopen the issue; it adds the missing evidence to the existing closure. The Vitest guard pins the row count and the per-row paths so a future re-audit cannot silently regress the ticket set.

## Open blockers (unchanged)

Per [`docs/t24-closure-evidence.md`](https://github.com/rafaelromao/slotmerge/blob/main/docs/t24-closure-evidence.md) `## Open blockers`, the four implementation tickets T10 ([#296](https://github.com/rafaelromao/slotmerge/issues/296)), T17 ([#303](https://github.com/rafaelromao/slotmerge/issues/303)), T18 ([#304](https://github.com/rafaelromao/slotmerge/issues/304)), and T19 ([#305](https://github.com/rafaelromao/slotmerge/issues/305)) remain open at the audit window and gate the actual `Closes #14` step. None of those tickets appear in `## Per-ticket evidence` above; the audit scope is the closed-but-deficient tickets, not the open-blocker list. A future audit run on the post-#347 state will pick those up once they close.

## PR-CI gate

The change-request PR for [#347](https://github.com/rafaelromao/slotmerge/issues/347) lands only `docs/closure-evidence-repair.md` and `tests/closure-evidence-repair.test.ts`. PR CI runs the locked five commands — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` — Vitest-only per AGENTS.md line 64. Playwright and the visual capture run on the `workflow_dispatch` lanes (`browser-tests.yml`, `visual-regression.yml`) and remain untouched.
