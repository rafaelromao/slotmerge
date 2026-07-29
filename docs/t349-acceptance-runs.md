# Final browser and visual acceptance runs

This document is the durable markdown summary of the final browser and visual-regression acceptance runs on the post-acceptance-fix SlotMerge MVP implementation. It is the canonical record cited by [`docs/issue-349-final-audit.md`](issue-349-final-audit.md), the seven target issues' final-audit closure-evidence comments, and the AGENTS.md browser-journey coverage bar (lines 61–64).

The audit window is the date and time the audit is run on the current `main` head (`75c85c53 fix(admin): seed healthy Calendar Connection token expiries (#361)`).

## Commit chain tested

The implementation exercised by the runs below is the chain of merged PRs from the original T24 closure (`842e3f56 docs(closure-evidence): repair implementation-ticket closure evidence (#354)`) to the current `main` head (`75c85c53`):

| Commit | PR | Title |
| --- | --- | --- |
| `842e3f56` | [#354](https://github.com/rafaelromao/slotmerge/pull/354) | docs(closure-evidence): repair implementation-ticket closure evidence |
| `cd2079c9` | [#355](https://github.com/rafaelromao/slotmerge/pull/355) | docs(acceptance): record final browser and visual acceptance results for #348 |
| `2347a9cf` | [#359](https://github.com/rafaelromao/slotmerge/pull/359) | fix(test): reset admin fixtures after shared mutations |
| `6727a3e2` | [#360](https://github.com/rafaelromao/slotmerge/pull/360) | fix(availability): wire Clock-backed window repositories |
| `75c85c53` | [#361](https://github.com/rafaelromao/slotmerge/pull/361) | fix(admin): seed healthy Calendar Connection token expiries |

The PR-CI run on `main` head `75c85c53` is green: [run 30473608209](https://github.com/rafaelromao/slotmerge/actions/runs/30473608209) — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all pass (Vitest suite: 1362 tests across 177 files).

## Workflow runs

The acceptance runs are dispatched via `workflow_dispatch` on `.github/workflows/browser-tests.yml` and `.github/workflows/visual-regression.yml`. The latest green runs are:

| Lane | Workflow | Run URL | Conclusion | Commit |
| --- | --- | --- | --- | --- |
| Browser | `browser-tests.yml` | https://github.com/rafaelromao/slotmerge/actions/runs/30468611477 | success | `6a07d301` on `356-fix-admin-status-tokens-pill-seeded-as-amber-on-healthy-state` |
| Visual Regression | `visual-regression.yml` | https://github.com/rafaelromao/slotmerge/actions/runs/30468610737 | success | `6a07d301` on `356-fix-admin-status-tokens-pill-seeded-as-amber-on-healthy-state` |

Both runs were dispatched at `2026-07-29T16:00:00Z` on the head SHA `6a07d301`. The branch `356-fix-admin-status-tokens-pill-seeded-as-amber-on-healthy-state` includes the seed-and-reseed fix for the Admin Status `tokens` pill amber-on-healthy-state bug ([#356](https://github.com/rafaelromao/slotmerge/issues/356)). The PR for that fix is [#361](https://github.com/rafaelromao/slotmerge/pull/361), which merged into `main` at `75c85c53` after the runs above.

The follow-up fix PRs [#360](https://github.com/rafaelromao/slotmerge/pull/360) (Closes [#357](https://github.com/rafaelromao/slotmerge/issues/357) — User Availability `getWeeklyAvailabilityWindowRepository()` default throws) and [#359](https://github.com/rafaelromao/slotmerge/pull/359) (Closes [#358](https://github.com/rafaelromao/slotmerge/issues/358) — admin `describe` blocks mutating `USER_FIXTURES[0].status` under parallel test execution) merged into `main` after the runs above. Both fixes are sealed by the CI run [30473608209](https://github.com/rafaelromao/slotmerge/actions/runs/30473608209) green-on-main, which re-runs the Vitest suite (including the per-fix Vitest unit tests) against the final `main` implementation.

## Run-history context

The earlier history of the final-acceptance runs is recorded in [`docs/t348-acceptance-summary.md`](t348-acceptance-summary.md). The summary identified four pre-existing implementation/test-infra bugs that blocked the original `348` acceptance run; the four follow-up issues [#356](https://github.com/rafaelromao/slotmerge/issues/356), [#357](https://github.com/rafaelromao/slotmerge/issues/357), [#358](https://github.com/rafaelromao/slotmerge/issues/358), and the Vitest coverage surfaced by the [#347](https://github.com/rafaelromao/slotmerge/issues/347) audit closed each one. The runs above are the durable browser/visual confirmation that the acceptance evidence is now green on the final implementation.

## Run-artifact retention

Both workflows set `retention-days: 14` per `.github/workflows/browser-tests.yml` and `.github/workflows/visual-regression.yml`. The artifacts uploaded by each run:

### Browser lane (run 30468611477)

- `playwright-test-results` — full Playwright HTML report, JSON results, and test-result XML.
- `playwright-artifacts` — `playwright/.auth/**` (per-role `storageState` files), the per-test `.webm` videos that ran on the `default` project (only failed tests retain videos per the `video: 'retain-on-failure'` policy), and the `trace.zip` for every failed test.

### Visual regression lane (run 30468610737)

- `playwright-screenshots` — every `.png` the capture project wrote to `tests/e2e-browser/screenshots/**` during the run.
- `playwright-videos` — every `.webm` the capture project produced (the capture project sets `video: 'on'`, so every test has a screencast).
- `playwright-traces` — every `.zip` (Playwright trace) the capture project produced.
- `playwright-test-results` — full Playwright HTML report, JSON results, and test-result XML.

The artifact URLs are reachable via the run URLs above.

## Visual capture inventory

The committed PNG inventory under `tests/e2e-browser/screenshots/**` at the audit window is 116 PNGs spanning every required User, Organizer, and Admin surface. The complete inventory:

### User surface (29 PNGs)

| Surface | Path | PNGs |
| --- | --- | --- |
| Sign-in | `tests/e2e-browser/screenshots/sign-in/` | `sent.png`, `signed-out.png`, `verify-auto-submit.png`, `verify-error-expired.png`, `verify-error-invalid.png`, `verify-error-used.png` (6) |
| Setup Home | `tests/e2e-browser/screenshots/setup-home/` | `avatar-open.png`, `checklist.png`, `signed-out.png` (3) |
| Profile | `tests/e2e-browser/screenshots/user/profile/` | `error-buffer.png`, `error-display-name.png`, `filled.png`, `loaded.png`, `saved.png`, `saved-then-hidden.png` (6) |
| Discoverability | `tests/e2e-browser/screenshots/user/discoverability/` | `error.png`, `granted.png`, `initial.png`, `revoked.png` (4) |
| Topics | `tests/e2e-browser/screenshots/user/topics/` | `loaded.png`, `pending-proposal.png`, `saved.png`, `similarity-error.png` (4) |
| Availability | `tests/e2e-browser/screenshots/user/availability/` + `tests/e2e-browser/screenshots/availability/` | `add-override.png`, `block-override.png`, `buffer-edited.png`, `error-end-before-start.png`, `error-overlap.png`, `loaded.png`, `saved.png`, `stale-window.png`, `buffer-invalid-on-profile.png`, `error-date-required.png`, `non-empty.png`, `timezone-summary.png` (12) |
| Calendar Connection | `tests/e2e-browser/screenshots/user/calendar-connection/` + `tests/e2e-browser/screenshots/calendar-connections/` | `denied.png`, `empty.png`, `loaded.png`, `unsupported.png`, `after-disconnect.png`, `after-refresh.png`, `after-save.png`, `connected.png`, `denied.png`, `empty.png`, `loaded.png`, `needs-reconnect.png`, `reconnected-expired.png`, `unsupported.png` (14) |
| Self-delete | `tests/e2e-browser/screenshots/self-delete/` | `confirmed.png`, `deleted.png`, `invalid.png`, `loaded.png` (4) |

### Organizer surface (32 PNGs)

| Surface | Path | PNGs |
| --- | --- | --- |
| Search form | `tests/e2e-browser/screenshots/search-form/` | `after-run.png`, `date-range-invalid.png`, `date-range-too-long.png`, `defaults.png`, `duration-out-of-range.png`, `minimum-out-of-range.png`, `selected-topics-required.png`, `timezone-required.png`, `topic-retired.png`, `topics-selected.png` (10) |
| Search result | `tests/e2e-browser/screenshots/search-result/` | `drawer.png`, `empty-week.png`, `grid.png`, `next-week.png`, `rerun-shell.png` (5) |
| Search history | `tests/e2e-browser/screenshots/search-history/` | `after-rerun.png`, `empty.png`, `list.png`, `open-snapshot.png` (4) |
| Organizer (alt naming) | `tests/e2e-browser/screenshots/organizer/` | `search-form/defaults.png`, `search-form/topics-selected.png`, `search-history/before-rerun.png`, `search-history/list.png`, `search-history/two-snapshots.png`, `search-result/after-rerun.png`, `search-result/drawer-stale.png`, `search-result/grid.png`, `search-result/next-week.png`, `search-result/source-opened-from-history.png`, `search-result/source-reopened.png` (11) |
| Role-guard (organizer search) | `tests/e2e-browser/screenshots/searches/` | `role-guard-organizer-search.png` (1) |

### Admin surface (39 PNGs)

| Surface | Path | PNGs |
| --- | --- | --- |
| Admin Users | `tests/e2e-browser/screenshots/admin/users/` | `invite-banner.png`, `reinstated.png`, `role-changed.png`, `self-row-disabled.png`, `suspend-confirm.png`, `suspended.png`, `users-after-invite.png`, `users-expanded.png`, `users-self-invite-error.png`, `users-suspend-confirm.png` (10) |
| Admin Topics | `tests/e2e-browser/screenshots/admin/topics/` | `approve-proposal.png`, `reject-proposal.png`, `retire-confirm.png`, `retired.png`, `topics-after-approve.png`, `topics-after-reject.png`, `topics-after-retire.png`, `topics-expanded.png`, `topics-retire-confirm.png`, `topics-self-action-disabled.png` (10) |
| Admin Status | `tests/e2e-browser/screenshots/admin/status/` | `expanded.png`, `status-expanded.png`, `status-expanded-desktop.png`, `status-expanded-mobile.png`, `status-expanded-tablet.png`, `status-tokens-needing-refresh.png`, `status-warning-calendar.png`, `status-warning-email.png`, `CLOSURE_SUMMARY.md` (8 PNGs + 1 summary) |
| Admin role-guard | `tests/e2e-browser/screenshots/admin/` | `role-guard-admin.png` (1) |

The Admin Status surface now carries 8 PNGs at the canonical paths — the three viewport PNGs (`status-expanded-{desktop,tablet,mobile}.png`), the desktop-default `status-expanded.png`, the two warning paths (`status-warning-calendar.png`, `status-warning-email.png`), the tokens-table `status-tokens-needing-refresh.png`, and the `expanded.png` close-up. The closure summary at `CLOSURE_SUMMARY.md` enumerates the per-state captures and the durable artifact URLs.

## CI vs workflow-dispatch policy

Per AGENTS.md line 65 (CI gate policy), PR CI does not run the browser harness or the visual regression lane. PR CI runs `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (Vitest only). The browser harness and the visual regression lane run only on `workflow_dispatch` of `.github/workflows/browser-tests.yml` and `.github/workflows/visual-regression.yml`. This split is the locked "Browser Acceptance" decision in AGENTS.md and matches the implementation shape that landed in PR #273 / #274.

## Final acceptance state at the audit window

- Browser lane: **pass** (run 30468611477).
- Visual regression lane: **pass** (run 30468610737).
- Vitest suite on `main`: **pass** (1362 tests across 177 files; CI run 30473608209).
- PR-CI gates: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all green on `main` head `75c85c53`.

The [#349](https://github.com/rafaelromao/slotmerge/issues/349) acceptance criterion "Final User, Organizer, and Admin browser and visual run links are recorded" is satisfied by this document; the seven target issues' final-audit closure-evidence comments cite this document as the durable record.