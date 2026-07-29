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

Four dependent fix tickets (#343, #344, #345, #346) closed via merge-only events without a closing reference comment. Their closing PR bodies contain only the `Closes #<n>` reference and no per-ticket evidence links. The audit groups these under `## Per-ticket evidence — Category B`. The corrective comment is posted on each individual issue so the durable, evidence-bearing record exists independently of the closing PR body. The closing-PR-side audit-repair comment (`## Closure Evidence` block as a top-level comment on the merged PR) is also posted on each Category B PR per the AGENTS.md line 66 ("The closing PR comment reproduces each link verbatim.") requirement.

## Closure-evidence standard

Every row in `## Per-ticket evidence` below satisfies the eight canonical closure-evidence fields that `AGENTS.md` rendered-screen and browser-journey completion gate enumerates (`AGENTS.md` lines 51–66) and the per-ticket template at `docs/implementation-graph.md:276-285` reproduces. The audit maps those eight fields into the seven columns A–G used below so each row remains one tight ticket-evidence record:

- **A. Playwright happy-path spec** — the `tests/e2e-browser/journeys/{user,organizer,admin}/...spec.ts` file (and the per-surface file enumeration where the row covers a sub-PRD) or `n/a — <reason>` for tickets whose deliverable is a deep module, a specification, or a sub-PRD parent. Per the `docs/implementation-graph.md:276-285` template, the same journey file hosts both the happy-path and the failure-path; the audit splits them into distinct cells so the canonical eight fields are reproduced verbatim.
- **A.1 Playwright failure-path spec** — a named `test('renders ... error state', ...)` block inside the same journey file per `docs/implementation-graph.md:280-281`, or `n/a — <reason>` for deep-module / spec tickets. For sub-PRD rows the failure-path is the per-surface failure-path spec inside the same journey file.
- **B. Vitest unit test** — the `*.test.ts` file under `src/**` or `tests/**` exercising the typed `Result<T, E>` return shape (workflow boundary) or the equivalent for non-workflow modules.
- **C. Component test** — the `*.test.tsx` file using `renderToString` + `happy-dom` for the per-page server component / client island, or `n/a — <reason>` for tickets that do not change a rendered surface.
- **D. Visual capture (committed baseline)** — the per-state PNG path under `tests/e2e-browser/screenshots/{screen}/{state}.png` (committed to the repo). When the row covers a sub-PRD or a deep module the cell enumerates every per-state PNG committed by the surface ticket(s); for tickets that do not own a screen surface the cell is `n/a — <reason>`.
- **E. Visual capture (workflow artifact)** — the WebM capture upload on the `workflow_dispatch` `visual-regression.yml` lane per `AGENTS.md` line 65, plus the concrete per-PR run summary link where known. The `workflow_dispatch` lane name is the durable pin; the per-PR run summary is per-PR state.
- **F. AGENTS.md acceptance bar** — the subset of items from `AGENTS.md` lines 51–66 that apply, plus the per-ticket AC list from the original issue body.
- **G. Closure-evidence corrective comment + Closure PR** — for every row the issue-side corrective comment URL is recorded (it carries the eight canonical fields under the canonical `## Closure Evidence` header), and for Category B tickets the closing-PR-side audit-repair comment URL is recorded alongside.

For tickets with `n/a` in any cell the rationale is recorded as `n/a — <reason>` and cross-references `docs/implementation-graph.md` (or `docs/mvp-spec.md` for the localTime contract) so the rationale is auditable.

## Per-ticket evidence — Category A (prohibited stand-alone comment)

Each row is one implementation ticket. The Vitest guard pins the row count, the row identifiers, the issue URLs, the closing PR URL (where applicable), the canonical Vitest / Playwright / visual-capture paths, and the per-row issue-side corrective-comment URL.

### A1. [#15](https://github.com/rafaelromao/slotmerge/issues/15) Sub-PRD: Search & Matching

- **A. Playwright happy-path spec**:
  - `tests/e2e-browser/journeys/organizer/search-form.spec.ts` (T11; runs the happy search, click Run, get a result).
  - `tests/e2e-browser/journeys/organizer/search-result.spec.ts` (T12; renders the weekly grid, opens a Slot drawer, Next-week navigation).
  - `tests/e2e-browser/journeys/organizer/search-history.spec.ts` (T13; chronological list, Open snapshot, Re-run).
  - `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` (T15; the full Organizer happy path).
  - `tests/e2e-browser/journeys/organizer/api-v1.spec.ts` (T14; per-role `storageState` `fetch` + DTO assertion).
- **A.1 Playwright failure-path spec**: same five journey files; each carries a `test('renders ... error state', ...)` block per `docs/implementation-graph.md:280-281` (e.g., zero / oversized date-range, retired topic in selection, missing timezone).
- **B. Vitest unit test**: `tests/workflow-search.test.ts` (workflow boundary; `Result<T, E>` shape), `src/api/serializers.test.ts` (T14 serializer).
- **C. Component test**: `tests/app-searches-page.test.tsx`, `tests/search-result-page.test.tsx`, `tests/search-history-page.test.tsx`, `tests/slot-details-drawer.test.tsx`, `tests/api-v1-me-setup-status.test.ts`, `tests/api-v1-searches-list.test.ts`, `tests/api-v1-searches-id.test.ts`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/search-form/{after-run.png, defaults.png, topics-selected.png, date-range-invalid.png, date-range-too-long.png, duration-out-of-range.png, minimum-out-of-range.png, selected-topics-required.png, timezone-required.png, topic-retired.png}` (10 PNGs in `tests/e2e-browser/screenshots/search-form/`); plus `tests/e2e-browser/screenshots/search-result/`, `tests/e2e-browser/screenshots/search-history/`, `tests/e2e-browser/screenshots/organizer/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65; the per-PR WebM artifact URL lives in the `default` and `capture` `workflow_dispatch` run summary that produced the per-screen PNGs.
- **F. AGENTS.md acceptance bar**: T11–T15 entries in `docs/implementation-graph.md` lines 111–151; AGENTS.md lines 51–66 reproduced in `docs/t24-closure-evidence.md` and `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #15 comment 5111930041](https://github.com/rafaelromao/slotmerge/issues/15#issuecomment-5111930041); **no single closing PR owns this issue** (the sub-PRD closes via the T25 batch: PR #335 chain).
- **Inconsistency callout**: reopened by the #347 audit on 2026-07-29 with `state_reason="reopened"` because T10 ([#296](https://github.com/rafaelromao/slotmerge/issues/296)) is still open. Per `docs/t25-sub-prd-closure-evidence.md:42`, the sub-PRD must not close until T10 lands.

### A2. [#16](https://github.com/rafaelromao/slotmerge/issues/16) Sub-PRD: Auth & Invites

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/user/magic-link.spec.ts` (T3; Admin invite → verify → magic-link verify-page).
- **A.1 Playwright failure-path spec**: same file; the `renders ... error state` blocks for expired, used, and invalid magic links, plus the resend error path.
- **B. Vitest unit test**: `src/workflow/auth.test.ts`.
- **C. Component test**: `tests/app-sign-in-page.test.tsx`, `tests/app-sign-in-sent-page.test.tsx`, `tests/app-sign-in-verify-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/sign-in/{sent.png, verify-auto-submit.png, verify-error-expired.png, verify-error-invalid.png, verify-error-used.png, signed-out.png}` (6 PNGs in `tests/e2e-browser/screenshots/sign-in/`).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T3 entry in `docs/implementation-graph.md` line 39; lines 51–66 reproduced in `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #16 comment 5111930110](https://github.com/rafaelromao/slotmerge/issues/16#issuecomment-5111930110); **no single closing PR owns this issue** (the sub-PRD closes via the T25 batch).

### A3. [#17](https://github.com/rafaelromao/slotmerge/issues/17) Sub-PRD: Calendar Connections

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8; Connect Google, see `connected` outcome, contributing calendars, refresh, disconnect).
- **A.1 Playwright failure-path spec**: same file; the Microsoft personal-account `unsupported` outcome, the `needs_reconnect` outcome, the consent-denied outcomes.
- **B. Vitest unit test**: `src/workflow/calendar-connection.test.ts`.
- **C. Component test**: `tests/app-me-calendar-connections-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/calendar-connections/`.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; lines 51–66 reproduced in `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #17 comment 5111930172](https://github.com/rafaelromao/slotmerge/issues/17#issuecomment-5111930172); **no single closing PR owns this issue** (the sub-PRD closes via the T25 batch).

### A4. [#18](https://github.com/rafaelromao/slotmerge/issues/18) Sub-PRD: Admin & Notifications

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/admin/users.spec.ts` (T16; the only Admin journey landed so far).
- **A.1 Playwright failure-path spec**: same file; the typed-confirm Suspend inline form, the self-action protection (current Admin row disabled), the access-denied failure paths.
- **B. Vitest unit test**: `src/workflow/admin-users.test.ts`, `src/workflow/admin-topics.test.ts` (T17 plans), `src/workflow/calendar-connection.test.ts` (Status section per-row refresh/disconnect).
- **C. Component test**: `tests/app-admin-page.test.tsx`, `tests/app-admin-status-section.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/admin/users/`, plus the Admin Topics/Status capture sets per T17 / T18 once those tickets close.
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T16–T19 entries in `docs/implementation-graph.md` lines 157–189; lines 51–66 reproduced in `docs/t24-closure-evidence.md`.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #18 comment 5111930281](https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5111930281); **no single closing PR owns this issue** (the sub-PRD closes via the T25 batch).
- **Inconsistency callout**: this ticket is currently open (the prior `Closed by sandman` comment did not match the issue state). T17 (#303), T18 (#304), and T19 (#305) are open per `docs/t24-closure-evidence.md` `## Open blockers`. Per `docs/t25-sub-prd-closure-evidence.md:45`, the sub-PRD must not close until T17 / T18 / T19 land.

### A5. [#19](https://github.com/rafaelromao/slotmerge/issues/19) Sub-PRD: Profile & Setup

- **A. Playwright happy-path spec**:
  - `tests/e2e-browser/journeys/user/profile.spec.ts` (T4).
  - `tests/e2e-browser/journeys/user/discoverability.spec.ts` (T5).
  - `tests/e2e-browser/journeys/user/topics.spec.ts` (T6).
  - `tests/e2e-browser/journeys/user/availability.spec.ts` (T7).
  - `tests/e2e-browser/journeys/user/self-delete.spec.ts` (T9).
- **A.1 Playwright failure-path spec**: same five files; each carries the `renders ... error state` block for validation, similarity, retired topic, etc.
- **B. Vitest unit test**: `src/profile/profile-workflow.test.ts`, `src/workflow/discoverability.test.ts`, `src/topics/topic-workflow.test.ts`, `src/workflow/availability.test.ts`, `src/workflow/account.test.ts`.
- **C. Component test**: `tests/app-me-profile-page.test.tsx`, `tests/discoverability-view.test.tsx`, `tests/app-me-topics-page.test.tsx`, `tests/app-me-availability-page.test.tsx`, `tests/app-me-delete-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/user/{availability,calendar-connection,discoverability,profile,setup-home,topics}/` (29 PNGs across the User surface in `tests/e2e-browser/screenshots/user/`).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T4–T9 entries in `docs/implementation-graph.md` lines 47–97; lines 51–66 reproduced in `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #19 comment 5111930358](https://github.com/rafaelromao/slotmerge/issues/19#issuecomment-5111930358); **no single closing PR owns this issue** (the sub-PRD closes via the T25 batch).

### A6. [#33](https://github.com/rafaelromao/slotmerge/issues/33) Define weekly Availability Windows in profile timezone

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/user/availability.spec.ts` (T7; add weekly window, override, edit buffer, see effective Availability preview).
- **A.1 Playwright failure-path spec**: same file; the `renders ... error state` blocks for window-range validation, override conflicts, and timezone-mismatch validation.
- **B. Vitest unit test**: `src/workflow/availability.test.ts`, `tests/e2e/define-weekly-availability-windows.test.ts`.
- **C. Component test**: `tests/app-me-availability-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/user/availability/` per-state PNGs (T7 capture run).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T7 entry in `docs/implementation-graph.md` line 75; issue #33 acceptance criteria 1–2; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #33 comment 5111930429](https://github.com/rafaelromao/slotmerge/issues/33#issuecomment-5111930429); **no single closing PR owns this issue** (the surface ticket closes via T7 / PR #322 chain).

### A7. [#37](https://github.com/rafaelromao/slotmerge/issues/37) Invite a User with email and role from Admin UI

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/admin/users.spec.ts` (T16; invite a User; the masked-email success banner; change a User's role).
- **A.1 Playwright failure-path spec**: same file; the typed-confirm Suspend inline form, the self-action protection (current Admin row disabled), the access-denied failure paths.
- **B. Vitest unit test**: `src/workflow/admin-users.test.ts`, `tests/e2e/admin-invites-user-from-admin-users-screen.test.ts`, `tests/e2e/admin-invites-refresh-transaction.test.ts`.
- **C. Component test**: `tests/app-admin-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/admin/users/` (per-state PNGs).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T16 entry in `docs/implementation-graph.md` line 157; issue #37 acceptance criteria 1–3; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #37 comment 5111930488](https://github.com/rafaelromao/slotmerge/issues/37#issuecomment-5111930488); **no single closing PR owns this issue** (the surface ticket closes via T16 / PR #323 chain).

### A8. [#45](https://github.com/rafaelromao/slotmerge/issues/45) Encrypt Calendar Connection OAuth tokens at rest

- **A. Playwright happy-path spec**: n/a — deep-module security fix; the per-page journey is `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8 happy + failure; covered by A3 above).
- **A.1 Playwright failure-path spec**: n/a — same deep-module scope as the happy-path above.
- **B. Vitest unit test**: `tests/calendar-token-encryption.test.ts` (encryption-at-rest boundary).
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #45 acceptance criteria 1–3; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #45 comment 5111930538](https://github.com/rafaelromao/slotmerge/issues/45#issuecomment-5111930538); **no single closing PR owns this issue** (the surface ticket closes via T8 / PR #324 chain).

### A9. [#49](https://github.com/rafaelromao/slotmerge/issues/49) Disconnect a Calendar Connection

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8; disconnect, see token-removed UI, reconnect).
- **A.1 Playwright failure-path spec**: same file; the `needs_reconnect` outcome, the disconnect-failure state.
- **B. Vitest unit test**: `src/workflow/calendar-connection.test.ts`, `tests/e2e/disconnect-removes-tokens-and-prevents-further-sync.test.ts`.
- **C. Component test**: `tests/app-me-calendar-connections-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/calendar-connections/` (per-state PNGs).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #49 acceptance criteria 1–2; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #49 comment 5111930596](https://github.com/rafaelromao/slotmerge/issues/49#issuecomment-5111930596); **no single closing PR owns this issue** (the surface ticket closes via T8 / PR #324 chain).

### A10. [#52](https://github.com/rafaelromao/slotmerge/issues/52) Trigger Calendar Connection action-required email

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8; the `needs_reconnect` outcome triggers the action-required email).
- **A.1 Playwright failure-path spec**: same file; the email-not-sent-and-stale-marker-shown failure path.
- **B. Vitest unit test**: `src/workflow/calendar-connection.test.ts`, `tests/e2e/action-required-email-on-token-revocation.test.ts`, `tests/calendar-action-required-email-wiring.test.ts`.
- **C. Component test**: n/a — the email is async and not a rendered surface.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/calendar-connections/` (per-state PNGs).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #52 acceptance criteria 1–2; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #52 comment 5111930657](https://github.com/rafaelromao/slotmerge/issues/52#issuecomment-5111930657); **no single closing PR owns this issue** (the surface ticket closes via T8 / PR #324 chain).

### A11. [#98](https://github.com/rafaelromao/slotmerge/issues/98) E2E test: Calendar Connection action-required state sends email

- **A. Playwright happy-path spec**: n/a — the screen-level Playwright journey lives in `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` (T8 happy + failure); the deliverable of #98 is the Vitest E2E test file (`tests/e2e/action-required-email-on-token-revocation.test.ts`).
- **A.1 Playwright failure-path spec**: n/a — lower-level Vitest test only.
- **B. Vitest unit test**: `tests/e2e/action-required-email-on-token-revocation.test.ts`.
- **C. Component test**: n/a — lower-level Vitest test only.
- **D. Visual capture (committed)**: n/a — lower-level Vitest test only.
- **E. Visual capture (workflow artifact)**: n/a — lower-level Vitest test only.
- **F. AGENTS.md acceptance bar**: T8 entry in `docs/implementation-graph.md` line 83; issue #98 acceptance criteria; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #98 comment 5111930728](https://github.com/rafaelromao/slotmerge/issues/98#issuecomment-5111930728); **no single closing PR owns this issue** (lower-level Vitest test only; tracked via the test file path).

### A12. [#108](https://github.com/rafaelromao/slotmerge/issues/108) E2E test: clicking a Slot opens a drawer with matching Users

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/organizer/search-result.spec.ts` (T12; click Slot, drawer opens).
- **A.1 Playwright failure-path spec**: same file; the `stale-data` marker failure path.
- **B. Vitest unit test**: `tests/workflow-search.test.ts`, `tests/e2e/slot-shows-stale-marker-when-calendar-connection-is-stale.test.ts`.
- **C. Component test**: `tests/slot-details-drawer.test.tsx`, `tests/search-result-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/search-result/` (5 PNGs in `tests/e2e-browser/screenshots/search-result/`).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T12 entry in `docs/implementation-graph.md` line 121; issue #108 acceptance criteria; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #108 comment 5111930786](https://github.com/rafaelromao/slotmerge/issues/108#issuecomment-5111930786); **no single closing PR owns this issue** (the surface ticket closes via T12 / PR #328 chain).

### A13. [#114](https://github.com/rafaelromao/slotmerge/issues/114) E2E test: match only considers setup-complete users

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/user/setup-home.spec.ts` (T1 happy; the eligibility surface is in the same file).
- **A.1 Playwright failure-path spec**: same file; the setup-incomplete failure path that blocks matching.
- **B. Vitest unit test**: `tests/e2e/setup-checklist-gates-matching-eligibility.test.ts`, `tests/workflow-search.test.ts`.
- **C. Component test**: `tests/app-setup-home-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/setup-home/{checklist.png, signed-out.png, avatar-open.png}` (3 PNGs in `tests/e2e-browser/screenshots/setup-home/`).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65.
- **F. AGENTS.md acceptance bar**: T1 entry in `docs/implementation-graph.md` line 20; issue #114 acceptance criteria; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #114 comment 5111930848](https://github.com/rafaelromao/slotmerge/issues/114#issuecomment-5111930848); **no single closing PR owns this issue** (the surface ticket closes via T1 / PR #316 chain).

### A14. [#279](https://github.com/rafaelromao/slotmerge/issues/279) Define rendered-screen and browser-journey completion gates

- **A. Playwright happy-path spec**: n/a — specification ticket; the Playwright journeys are enumerated downstream by each surface ticket (see `docs/t24-closure-evidence.md` `## Closed implementation tickets` table and AGENTS.md lines 51–66).
- **A.1 Playwright failure-path spec**: n/a — specification ticket.
- **B. Vitest unit test**: `tests/t24-closure-evidence.test.ts`, `tests/t25-closure-evidence.test.ts`, `tests/closure-evidence-repair.test.ts` (this audit's own guard; one Vitest guard per closure-evidence document).
- **C. Component test**: n/a — specification ticket.
- **D. Visual capture (committed)**: n/a — specification ticket.
- **E. Visual capture (workflow artifact)**: n/a — specification ticket.
- **F. AGENTS.md acceptance bar**: the AGENTS.md completion gates encoded at lines 51–66 are the deliverable; the gate text is reproduced verbatim in `docs/t24-closure-evidence.md` and `docs/t25-sub-prd-closure-evidence.md`.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #279 comment 5111930904](https://github.com/rafaelromao/slotmerge/issues/279#issuecomment-5111930904); **no single closing PR owns this issue** (the deliverable is the AGENTS.md update merged by the closure-evidence-repair chain).

### A15. [#307](https://github.com/rafaelromao/slotmerge/issues/307) T21 E2E plan #62 in-place update

- **A. Playwright happy-path spec**: n/a — at the plan layer; the per-screen Playwright journeys are enumerated downstream in issue #62 (the deliverable of #307).
- **A.1 Playwright failure-path spec**: n/a — plan layer.
- **B. Vitest unit test**: `tests/retired-routes.test.ts`, `tests/e2e-plan.test.ts`.
- **C. Component test**: n/a — plan layer.
- **D. Visual capture (committed)**: n/a — plan layer.
- **E. Visual capture (workflow artifact)**: n/a — plan layer.
- **F. AGENTS.md acceptance bar**: T21 entry in `docs/implementation-graph.md` line 199; issue #62 body content (the deliverable); AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #307 comment 5111930980](https://github.com/rafaelromao/slotmerge/issues/307#issuecomment-5111930980); the closing PR is the [Wayfinder plan PR #312](https://github.com/rafaelromao/slotmerge/pull/312) which updated issue #62's body in place.

### A16. [#326](https://github.com/rafaelromao/slotmerge/issues/326) Commit Search-form visual-capture baselines

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/organizer/search-form.spec.ts` (T11 happy; pre-submit defaults → see /searches/{newId}).
- **A.1 Playwright failure-path spec**: same file; the ten failure-path states (date-range-invalid, date-range-too-long, duration-out-of-range, minimum-out-of-range, selected-topics-required, timezone-required, topic-retired, etc.).
- **B. Vitest unit test**: `tests/workflow-search.test.ts`.
- **C. Component test**: `tests/app-searches-page.test.tsx`.
- **D. Visual capture (committed)**: `tests/e2e-browser/screenshots/search-form/{after-run.png, defaults.png, topics-selected.png, date-range-invalid.png, date-range-too-long.png, duration-out-of-range.png, minimum-out-of-range.png, selected-topics-required.png, timezone-required.png, topic-retired.png}` — 10 committed-baseline PNGs (the per-state PNG inventory A16 contributed).
- **E. Visual capture (workflow artifact)**: `workflow_dispatch` `visual-regression.yml` lane per AGENTS.md line 65; the per-PR WebM artifact URL is in the `default` and `capture` `workflow_dispatch` run summary for the PR that landed A16.
- **F. AGENTS.md acceptance bar**: T11 entry in `docs/implementation-graph.md` line 111; issue #326 acceptance criteria 1–5; AGENTS.md PR-CI gates.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #326 comment 5111931052](https://github.com/rafaelromao/slotmerge/issues/326#issuecomment-5111931052); **no single closing PR owns this issue** (the visual-capture commit chain carried the per-state PNGs and the lane-named WebM artifact).

## Per-ticket evidence — Category B (missing closing comment)

### B1. [#343](https://github.com/rafaelromao/slotmerge/issues/343) Fix Search candidate preparation to run once per Search

- **A. Playwright happy-path spec**: n/a — deep-module refactor; the screen-level journeys (`tests/e2e-browser/journeys/organizer/search-form.spec.ts` T11, `tests/e2e-browser/journeys/organizer/search-result.spec.ts` T12, `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` T15) cover the Search surface happy + failure paths.
- **A.1 Playwright failure-path spec**: n/a — same deep-module scope.
- **B. Vitest unit test**: `src/search/search-snapshot-assembler.test.ts` (per-dependency call count assertions at the SUT boundary), `tests/workflow-search.test.ts` (per-dependency call count assertions across the full Search path; rerun fallback; failure-path counters stay at 1).
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: issue #343 acceptance criteria 1–5 (each eligible candidate prepared at most once; validation + assembly share the prepared set; Search Result JSON shape unchanged; per-dependency call counts asserted; PR CI green); AGENTS.md PR-CI gates per line 65.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #343 comment 5111931105](https://github.com/rafaelromao/slotmerge/issues/343#issuecomment-5111931105); closing PR [#350](https://github.com/rafaelromao/slotmerge/pull/350) with closing-PR-side audit-repair comment at [PR #350 comment 5111946461](https://github.com/rafaelromao/slotmerge/pull/350#issuecomment-5111946461).

### B2. [#344](https://github.com/rafaelromao/slotmerge/issues/344) Restore repo-wide AppClock boundary ownership

- **A. Playwright happy-path spec**: n/a — cross-cutting boundary, no per-screen journey.
- **A.1 Playwright failure-path spec**: n/a — cross-cutting boundary.
- **B. Vitest unit test**: `tests/appclock-boundary-migration.test.ts` (allowlist / denylist enforcement); updated `tests/poll-clock-seam.test.ts`, `tests/sync-clock-seam.test.ts`, `tests/email-clock-seam.test.ts`, `tests/calendar-callback-get.test.ts`, `tests/microsoft-calendar-connection-state.test.ts`, `tests/microsoft-calendar-start.test.ts`, `tests/microsoft-calendar-complete.test.ts`, `tests/microsoft-calendar-revoke.test.ts`, `tests/topic-proposals-route.test.ts`, `tests/me-topic-proposals-route.test.ts`, `tests/me-route.test.ts`, `tests/google-calendar-connections.test.ts` (existing seam tests continue to pass).
- **C. Component test**: n/a — no rendered-surface change.
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: issue #344 acceptance criteria 1–4 (migration-completeness test passes with allowed forms and denies removed forms; every Admin / Search / Calendar / Auth / Session / Email handler requires `clock`; worker continuity tests pass; PR CI green); AGENTS.md PR-CI gates per line 65.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #344 comment 5111931149](https://github.com/rafaelromao/slotmerge/issues/344#issuecomment-5111931149); closing PR [#353](https://github.com/rafaelromao/slotmerge/pull/353) with closing-PR-side audit-repair comment at [PR #353 comment 5111949851](https://github.com/rafaelromao/slotmerge/pull/353#issuecomment-5111949851).

### B3. [#345](https://github.com/rafaelromao/slotmerge/issues/345) Complete Admin Invite shell and repository migration

- **A. Playwright happy-path spec**: `tests/e2e-browser/journeys/admin/users.spec.ts` (T16 happy; the Admin Invite migration was an internal refactor).
- **A.1 Playwright failure-path spec**: same file; the Admin Invite access-denied failure path is in the same journey.
- **B. Vitest unit test**: `src/admin/invites.test.ts` (handler-level coverage including the `createPostErrorResponse` regression), `src/admin/invites.repository.test.ts` (persistence boundary coverage), `tests/admin-shell-repository-migration.test.ts` (import-only-from-`./page` boundary; no inline `getDb()` / Drizzle / private `database*Repository` constants).
- **C. Component test**: n/a — no rendered-surface change; the Admin Users surface is covered by `tests/app-admin-page.test.tsx` (T16).
- **D. Visual capture (committed)**: n/a — no rendered-surface change.
- **E. Visual capture (workflow artifact)**: n/a — no rendered-surface change.
- **F. AGENTS.md acceptance bar**: issue #345 acceptance criteria 1–6 (Admin Invite handler delegates authorization and access-denied responses through `./page`; `invites.repository` persistence boundary; `tests/admin-shell-repository-migration.test.ts` boundary; `createPostErrorResponse` regression test; behavior / validation / refresh / persistence semantics unchanged; PR CI green); AGENTS.md PR-CI gates per line 65.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #345 comment 5111931206](https://github.com/rafaelromao/slotmerge/issues/345#issuecomment-5111931206); closing PR [#352](https://github.com/rafaelromao/slotmerge/pull/352) with closing-PR-side audit-repair comment at [PR #352 comment 5111948865](https://github.com/rafaelromao/slotmerge/pull/352#issuecomment-5111948865).

### B4. [#346](https://github.com/rafaelromao/slotmerge/issues/346) Resolve localTime timezone validation contract

- **A. Playwright happy-path spec**: n/a — deep-module contract; the Profile / Search-form error surfaces are covered by `tests/e2e-browser/journeys/user/profile.spec.ts` (T4) and `tests/e2e-browser/journeys/organizer/search-form.spec.ts` (T11).
- **A.1 Playwright failure-path spec**: n/a — same deep-module scope.
- **B. Vitest unit test**: `src/time/local-time.test.ts` (canonical round-trip equality; documented alias acceptance; casing-variant / abbreviation / Link-style alias rejection; unknown-string / empty-string / non-string rejection; TIMEZONE_ALIASES pin describe; ICU regression lock).
- **C. Component test**: n/a — no new rendered surface; the Profile form (`tests/app-me-profile-page.test.tsx`) and Search form (`tests/app-searches-page.test.tsx`) consume the contract.
- **D. Visual capture (committed)**: n/a — no new rendered surface.
- **E. Visual capture (workflow artifact)**: n/a — no new rendered surface.
- **F. AGENTS.md acceptance bar**: issue #346 acceptance criteria 1–5 (`Intl` round-trip strict equality; `Asia/Kathmandu` documented alias; casing / abbreviation / unknown-string rejection; mvp-spec 6.10 Timezone Validation Contract subsection; PR CI green); AGENTS.md PR-CI gates per line 65.
- **G. Corrective comment + Closure PR**: issue-side corrective comment posted at [issue #346 comment 5111931274](https://github.com/rafaelromao/slotmerge/issues/346#issuecomment-5111931274); closing PR [#351](https://github.com/rafaelromao/slotmerge/pull/351) with closing-PR-side audit-repair comment at [PR #351 comment 5111947463](https://github.com/rafaelromao/slotmerge/pull/351#issuecomment-5111947463).

## Corrective comment template

Each corrective comment is posted at the issue top-level so it lives above the prohibited stand-alone comment and therefore supersedes it for revalidation. The header is the canonical `## Closure Evidence` per `docs/implementation-graph.md:276`; the body uses the canonical eight-field body:

```markdown
## Closure Evidence

> Audit-repair record from [#347](https://github.com/rafaelromao/slotmerge/issues/347) ([docs/closure-evidence-repair.md](https://github.com/rafaelromao/slotmerge/blob/main/docs/closure-evidence-repair.md)). The previous stand-alone "Closed by sandman — issue already completed." comment (and any missing closing comment, for Category B tickets) is superseded by this record per AGENTS.md line 66.

- **Playwright happy-path spec**: <per-ticket happy-path evidence>
- **Playwright failure-path spec**: <per-ticket failure-path evidence>
- **Vitest unit test**: <per-ticket Vitest file path(s)>
- **Component test**: <per-ticket component test file path(s)>
- **Visual capture (committed baselines)**: <per-ticket committed baselines path or n/a>
- **Visual capture (workflow artifact)**: <per-ticket workflow_dispatch lane + per-PR WebM artifact URL when known>
- **AGENTS.md acceptance bar checked**: <per-ticket acceptance bar items>
- **Closure PR**: <per-ticket closing PR URL when available; sub-PRD / spec / ADR tickets get the n/a line>

Closing reference: Closes #<issue>; this comment is the audited closure-evidence record.
```

For Category B tickets the matching closing-PR-side audit-repair comment on the merged PR carries the same eight fields per the AGENTS.md line 66 ("The closing PR comment reproduces each link verbatim.") requirement. See `## Closing-PR-side closure evidence (Category B)` below for the table.

## Practical constraints (comment-only repair)

The AGENTS.md "Tracker closure rule" entry at line 66 states the literal closure-evidence contract — both an issue-body `## Closure Evidence` section and a closing PR comment that reproduces each link verbatim. The audit's comment-only repair is the strongest record that can be posted without reopening already-merged closing PRs and breaking the auto-close behaviour on `Closes #<n>` (the merging of the PR with the `Closes` keyword is the durable state change). The corrective comments therefore use the canonical `## Closure Evidence` header and the eight canonical fields so the GitHub-side record conforms to the same shape that the original PR body should have carried. For Category B tickets the closing-PR-side audit-repair comments supply the closing-PR-side record per AGENTS.md line 66. A future audit run may edit the affected issue bodies in place to add a permanent `## Closure Evidence` section, but that is out of scope for the comment-only repair that [#347](https://github.com/rafaelromao/slotmerge/issues/347) authorizes.

## Inconsistency callouts

The audit surfaced two closure-state inconsistencies where the issue is recorded as closed but the implementation tickets that gate its actual closure are still open. These are surfaced explicitly per `AGENTS.md:71` ("surface the contradiction explicitly rather than silently overriding"). The corrective comment on the offending issue records the inconsistency in its `G. Closure PR` cell's "Inconsistency callout" sub-bullet and the audit carries the corresponding action:

- **[#15](https://github.com/rafaelromao/slotmerge/issues/15) Sub-PRD: Search & Matching** — closed on 2026-07-28 while T10 ([#296](https://github.com/rafaelromao/slotmerge/issues/296)) is open. Per `docs/t25-sub-prd-closure-evidence.md:42`, "do not close" until T10 lands. The #347 audit reopened #15 on 2026-07-29 with `state_reason="reopened"` and posted a reopening notice as the audit-repair comment. The sub-PRD closure-evidence record remains in the audit doc (row A1) for revalidation when T10 closes.
- **[#18](https://github.com/rafaelromao/slotmerge/issues/18) Sub-PRD: Admin & Notifications** — open (the prior `Closed by sandman` comment does not match the current issue state). T17 ([#303](https://github.com/rafaelromao/slotmerge/issues/303)), T18 ([#304](https://github.com/rafaelromao/slotmerge/issues/304)), and T19 ([#305](https://github.com/rafaelromao/slotmerge/issues/305)) are open per `docs/t24-closure-evidence.md` `## Open blockers`. Per `docs/t25-sub-prd-closure-evidence.md:45`, "do not close". The corrective comment on #18 records the open-blocker state.

## Closing-PR-side closure evidence (Category B)

`AGENTS.md` line 66 requires the closing PR comment to reproduce each closure-evidence link verbatim. The audit therefore posts the matching `## Closure Evidence` block as a top-level comment on each Category B closing PR. The PR body deliberately remains `Closes #<N>` so the auto-close binding does not regress; the closing-PR-side comment carries the eight canonical fields and cross-references the issue-side audit-repair comment.

| Closing PR | Closing-PR-side audit-repair comment |
| --- | --- |
| [#350](https://github.com/rafaelromao/slotmerge/pull/350) (closes #343) | https://github.com/rafaelromao/slotmerge/pull/350#issuecomment-5111946461 |
| [#351](https://github.com/rafaelromao/slotmerge/pull/351) (closes #346) | https://github.com/rafaelromao/slotmerge/pull/351#issuecomment-5111947463 |
| [#352](https://github.com/rafaelromao/slotmerge/pull/352) (closes #345) | https://github.com/rafaelromao/slotmerge/pull/352#issuecomment-5111948865 |
| [#353](https://github.com/rafaelromao/slotmerge/pull/353) (closes #344) | https://github.com/rafaelromao/slotmerge/pull/353#issuecomment-5111949851 |

For sub-PRD parents (#15–#19) and the spec / ADR tickets (#279, #307, #326) the closing PR exists in the git history (PR #335 for #311 / T25; PR #335 chain for the rest) but the relationship is one-to-many — one PR closed multiple sub-PRDs via the T25 batch — so the closing-PR-side comment is logged in `docs/t25-sub-prd-closure-evidence.md` and the audit does not duplicate it on each sub-PRD's PR thread.

## Reopening safety

Per `sandman-implement` Hard Rule 3, the original implementation ticket's `Closes #<N>` keyword on the closing PR still owns the auto-close behavior on merge. The corrective comment does not reopen the issue (except for the two surfaced inconsistencies on #15 and #18, where the audit took the explicit action to reopen #15 with `state_reason="reopened"` and posted a reopening notice on the other); the rest of the audit lands only the corrective comments and the audit doc. The Vitest guard pins the row count and the per-row paths so a future re-audit cannot silently regress the ticket set.

## Open blockers (unchanged)

Per [`docs/t24-closure-evidence.md`](https://github.com/rafaelromao/slotmerge/blob/main/docs/t24-closure-evidence.md) `## Open blockers`, the four implementation tickets T10 ([#296](https://github.com/rafaelromao/slotmerge/issues/296)), T17 ([#303](https://github.com/rafaelromao/slotmerge/issues/303)), T18 ([#304](https://github.com/rafaelromao/slotmerge/issues/304)), and T19 ([#305](https://github.com/rafaelromao/slotmerge/issues/305)) remain open at the audit window and gate the actual `Closes #14` step. None of those open-blocker tickets appear in `## Per-ticket evidence` (they are not closed / deficient), but #15 / #18's references to the open-blocker tickets are recorded in each row's `Inconsistency callout` sub-bullet per `AGENTS.md:71`. A future audit run on the post-#347 state will pick those blockers up once they close.

## Reproduction

For a future re-audit, run:

```bash
pnpm test tests/closure-evidence-repair.test.ts
```

The Vitest guard pins the audit-document heading, the per-row structural fields, the canonical `## Closure Evidence` template header, the eight canonical field names, the per-row corrective-comment URLs, the AGENTS.md line 65 reference for the CI gate, and the surfaced inconsistency callouts.

## PR-CI gate

The change-request PR for [#347](https://github.com/rafaelromao/slotmerge/issues/347) lands `docs/closure-evidence-repair.md` and `tests/closure-evidence-repair.test.ts`. PR CI runs the locked five commands — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` — Vitest-only per `AGENTS.md` line 65 (CI gate policy). Playwright and the visual capture run on the `workflow_dispatch` lanes (`browser-tests.yml`, `visual-regression.yml`) and remain untouched.
