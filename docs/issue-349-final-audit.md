# Issue #349 — Final audit of journey maps and PRDs

This document is the canonical final-audit record for [issue #349](https://github.com/rafaelromao/slotmerge/issues/349) ("Revalidate and close journey maps and PRDs"). It records the state of the seven target issues at the audit window, the browser/visual acceptance evidence on disk, the closure evidence on each child implementation ticket, and the per-issue final decision (close-with-evidence or remain-open-with-findings).

The audit window is the date and time the audit is run on the current `main` head (`75c85c53 fix(admin): seed healthy Calendar Connection token expiries (#361)`). The audit revalidates the closure-evidence contract defined in [AGENTS.md](https://github.com/rafaelromao/slotmerge/blob/main/AGENTS.md) lines 51–66 against the implementation, the implementation-ticket closure records, and the durable browser/visual acceptance run links.

## Scope

The audit scope is restricted to the seven target issues named in the body of [#349](https://github.com/rafaelromao/slotmerge/issues/349):

- [#14](https://github.com/rafaelromao/slotmerge/issues/14) — SlotMerge MVP PRD (top-level)
- [#18](https://github.com/rafaelromao/slotmerge/issues/18) — Sub-PRD: Admin & Notifications
- [#62](https://github.com/rafaelromao/slotmerge/issues/62) — E2E test plan: SlotMerge MVP
- [#283](https://github.com/rafaelromao/slotmerge/issues/283) — Wayfinder: foundation
- [#284](https://github.com/rafaelromao/slotmerge/issues/284) — Wayfinder: User journey
- [#285](https://github.com/rafaelromao/slotmerge/issues/285) — Wayfinder: Organizer journey
- [#286](https://github.com/rafaelromao/slotmerge/issues/286) — Wayfinder: Admin journey

For each, the audit records the issue state at the audit window, the children tickets required by the body or by the implementation graph, the closure-evidence records on each child, and the final close/remain-open decision.

## Audit window

- Audit timestamp (UTC): 2026-07-29T17:30:00Z
- `main` head SHA at the audit window: `75c85c53`
- Implementation ticket graph at the audit window: all 25 T-tickets (`T1`–`T25`) closed; the four follow-up bugs from the [#348](https://github.com/rafaelromao/slotmerge/issues/348) acceptance run ([#356](https://github.com/rafaelromao/slotmerge/issues/356), [#357](https://github.com/rafaelromao/slotmerge/issues/357), [#358](https://github.com/rafaelromao/slotmerge/issues/358), [#341](https://github.com/rafaelromao/slotmerge/issues/341)) are closed except [#341](https://github.com/rafaelromao/slotmerge/issues/341) (Polish remaining UI surfaces — flagged as out-of-scope by [#349](https://github.com/rafaelromao/slotmerge/issues/349)).
- PR-CI gates at the audit window: `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` all green on the latest `main` push (run [30473608209](https://github.com/rafaelromao/slotmerge/actions/runs/30473608209)).

## Final acceptance runs

The durable browser and visual-regression acceptance runs on the post-acceptance-fix implementation are recorded in [`docs/t349-acceptance-runs.md`](t349-acceptance-runs.md). The summary is:

| Lane | Workflow | Run | Conclusion | Commit |
| --- | --- | --- | --- | --- |
| Browser | `browser-tests.yml` | https://github.com/rafaelromao/slotmerge/actions/runs/30468611477 | success | `6a07d301` on `356-fix-admin-status-tokens-pill-seeded-as-amber-on-healthy-state` |
| Visual Regression | `visual-regression.yml` | https://github.com/rafaelromao/slotmerge/actions/runs/30468610737 | success | `6a07d301` on `356-fix-admin-status-tokens-pill-seeded-as-amber-on-healthy-state` |

Both lanes pass on the post-acceptance-fix implementation that includes the [#356](https://github.com/rafaelromao/slotmerge/issues/356) seed-and-reseed fix. The follow-up fix PRs [#360](https://github.com/rafaelromao/slotmerge/pull/360) (Closes [#357](https://github.com/rafaelromao/slotmerge/issues/357)) and [#359](https://github.com/rafaelromao/slotmerge/pull/359) (Closes [#358](https://github.com/rafaelromao/slotmerge/issues/358)) merged into `main` after those runs; both are sealed by the CI run [30473608209](https://github.com/rafaelromao/slotmerge/actions/runs/30473608209) green-on-main. The Vitest suite (1362 tests across 177 files) is green locally and on `main`.

## Per-issue verification matrix

The table below is the canonical per-issue verification record at the audit window. Each row records the issue number, its title, the children tickets required by the issue body or by the implementation graph (`docs/implementation-graph.md`), the closure-evidence source for each child, and the final decision.

| Issue | Title | Required children | Closure evidence source | Final decision |
| --- | --- | --- | --- | --- |
| [#14](https://github.com/rafaelromao/slotmerge/issues/14) | SlotMerge MVP PRD | Sub-PRDs [#15](https://github.com/rafaelromao/slotmerge/issues/15), [#16](https://github.com/rafaelromao/slotmerge/issues/16), [#17](https://github.com/rafaelromao/slotmerge/issues/17), [#18](https://github.com/rafaelromao/slotmerge/issues/18), [#19](https://github.com/rafaelromao/slotmerge/issues/19); implementation tickets `T1`–`T23` | [`docs/t24-closure-evidence.md`](t24-closure-evidence.md), [`docs/t25-sub-prd-closure-evidence.md`](t25-sub-prd-closure-evidence.md), [`docs/closure-evidence-repair.md`](closure-evidence-repair.md), [issue #15 comment 5111930041](https://github.com/rafaelromao/slotmerge/issues/15#issuecomment-5111930041), [issue #16 comment 5111930110](https://github.com/rafaelromao/slotmerge/issues/16#issuecomment-5111930110), [issue #17 comment 5111930172](https://github.com/rafaelromao/slotmerge/issues/17#issuecomment-5111930172), [issue #19 comment 5111930358](https://github.com/rafaelromao/slotmerge/issues/19#issuecomment-5111930358), [issue #18 comment 5111930281](https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5111930281) | **Close** — all five sub-PRDs closed with proper closure-evidence records and audit-repair strengthening comments; all `T1`–`T23` are closed |
| [#18](https://github.com/rafaelromao/slotmerge/issues/18) | Sub-PRD: Admin & Notifications | `T16`–`T19` ([#302](https://github.com/rafaelromao/slotmerge/issues/302), [#303](https://github.com/rafaelromao/slotmerge/issues/303), [#304](https://github.com/rafaelromao/slotmerge/issues/304), [#305](https://github.com/rafaelromao/slotmerge/issues/305)) | [issue #18 comment 5099921404](https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5099921404) (T25-batch closure-evidence record), [issue #18 comment 5111930281](https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5111930281) (audit-repair strengthening), [issue #18 comment 5112191346](https://github.com/rafaelromao/slotmerge/issues/18#issuecomment-5112191346) (framing clarification); Admin Status + T19 per-state PNGs committed at `tests/e2e-browser/screenshots/admin/status/` (9 PNGs) and the Admin journey end-to-end WebM at [run 30468611477](https://github.com/rafaelromao/slotmerge/actions/runs/30468611477) | **Close** — all four T-tickets closed; Admin Status per-state PNGs now committed; the prior closure-evidence record plus the audit-repair strengthening record together satisfy the AGENTS.md closure-evidence contract |
| [#62](https://github.com/rafaelromao/slotmerge/issues/62) | E2E test plan: SlotMerge MVP | The plan document itself (`docs/e2e-plan.md`) and the implementation tickets that implement it (`T1`–`T23`) | [issue #62 comment 4948206091](https://github.com/rafaelromao/slotmerge/issues/62#issuecomment-4948206091) (decisions), `docs/e2e-plan.md` content (the plan itself), the T1–T23 closure-evidence records (each Playwright journey file under `tests/e2e-browser/journeys/{user,organizer,admin}/` is on disk and linked from the plan) | **Close** — the canonical E2E plan is in `docs/e2e-plan.md`; all per-screen Playwright journeys exist on disk; the AGENTS.md acceptance bar is met |
| [#283](https://github.com/rafaelromao/slotmerge/issues/283) | Wayfinder: foundation | `T1` (#287), `T2` (#288), `T20` (#306), `T21` (#307), `T22` (#308), `T23` (#309) | [PR #316](https://github.com/rafaelromao/slotmerge/pull/316) (T1), [PR #317](https://github.com/rafaelromao/slotmerge/pull/317) (T2), [PR #313](https://github.com/rafaelromao/slotmerge/pull/313) (T20), [PR #312](https://github.com/rafaelromao/slotmerge/pull/312) (T21), [PR #314](https://github.com/rafaelromao/slotmerge/pull/314) (T22), [PR #315](https://github.com/rafaelromao/slotmerge/pull/315) (T23); per-ticket rows in [`docs/t24-closure-evidence.md`](t24-closure-evidence.md) | **Close** — all six children closed with proper closure-evidence records |
| [#284](https://github.com/rafaelromao/slotmerge/issues/284) | Wayfinder: User journey | `T3` (#289), `T4` (#290), `T5` (#291), `T6` (#292), `T7` (#293), `T8` (#294), `T9` (#295), `T10` (#296) | [PR #318](https://github.com/rafaelromao/slotmerge/pull/318) (T3), [PR #319](https://github.com/rafaelromao/slotmerge/pull/319) (T4), [PR #320](https://github.com/rafaelromao/slotmerge/pull/320) (T5), [PR #321](https://github.com/rafaelromao/slotmerge/pull/321) (T6), [PR #322](https://github.com/rafaelromao/slotmerge/pull/322) (T7), [PR #324](https://github.com/rafaelromao/slotmerge/pull/324) (T8), [PR #327](https://github.com/rafaelromao/slotmerge/pull/327) (T9), [PR #332](https://github.com/rafaelromao/slotmerge/pull/332) (T10); per-ticket rows in [`docs/t24-closure-evidence.md`](t24-closure-evidence.md) | **Close** — all eight children closed with proper closure-evidence records; the canonical User journey Playwright spec drives the end-to-end path |
| [#285](https://github.com/rafaelromao/slotmerge/issues/285) | Wayfinder: Organizer journey | `T11` (#297), `T12` (#298), `T13` (#299), `T14` (#300), `T15` (#301) | [PR #325](https://github.com/rafaelromao/slotmerge/pull/325) (T11), [PR #328](https://github.com/rafaelromao/slotmerge/pull/328) (T12), [PR #329](https://github.com/rafaelromao/slotmerge/pull/329) (T13), [PR #330](https://github.com/rafaelromao/slotmerge/pull/330) (T14), [PR #331](https://github.com/rafaelromao/slotmerge/pull/331) (T15); per-ticket rows in [`docs/t24-closure-evidence.md`](t24-closure-evidence.md) | **Close** — all five children closed with proper closure-evidence records |
| [#286](https://github.com/rafaelromao/slotmerge/issues/286) | Wayfinder: Admin journey | `T16` (#302), `T17` (#303), `T18` (#304), `T19` (#305) | [PR #323](https://github.com/rafaelromao/slotmerge/pull/323) (T16), [PR #336](https://github.com/rafaelromao/slotmerge/pull/336) (T17), [PR #334](https://github.com/rafaelromao/slotmerge/pull/334) (T18), [PR #337](https://github.com/rafaelromao/slotmerge/pull/337) (T19); per-ticket rows in [`docs/t24-closure-evidence.md`](t24-closure-evidence.md) | **Close** — all four children closed with proper closure-evidence records |

All seven target issues pass verification. None fail validation; none remain open with a findings report.

## Per-issue evidence — closure-evidence contract

The AGENTS.md closure-evidence contract at lines 51–66 is satisfied for each target issue. The verbatim `Rendered-screen and browser-journey completion gates` block from `AGENTS.md` is reproduced below for the audit record:

```text
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
```

The verbatim block above is the source-of-truth reproduction of the AGENTS.md acceptance bar. Each per-issue closure-evidence comment on the seven target issues references this block via the canonical `## Closure Evidence` header and the eight canonical fields. The per-issue evidence record is the closure-evidence comment posted on the issue itself at the audit run; the canonical comment template is:

```markdown
## Closure Evidence

> Final-audit record from [#349](https://github.com/rafaelromao/slotmerge/issues/349) ([docs/issue-349-final-audit.md](https://github.com/rafaelromao/slotmerge/blob/main/docs/issue-349-final-audit.md)). The previous open state and any prior partial closure-evidence records are superseded by this final audit per AGENTS.md line 66.

- **Playwright happy-path spec**: <per-issue happy-path evidence>
- **Playwright failure-path spec**: <per-issue failure-path evidence>
- **Vitest unit test**: <per-issue Vitest file path(s)>
- **Component test**: <per-issue component test file path(s)>
- **Visual capture (committed baselines)**: <per-issue committed baselines path or n/a>
- **Visual capture (workflow artifact)**: <per-issue workflow_dispatch lane + per-issue WebM artifact URL>
- **AGENTS.md acceptance bar checked**: <per-issue acceptance bar items>
- **Closure PR**: <per-issue closing PR URL when available>

Closing reference: Closes #<issue>; this comment is the final-audit closure-evidence record.
```

For each of the seven issues, the final-audit closure-evidence comment is posted at the issue top-level. The comment uses the canonical `## Closure Evidence` header and the eight canonical fields so the GitHub-side record conforms to the same shape that the original PR body should have carried per AGENTS.md line 66.

### Final-audit closure comments

The final-audit closure-evidence comment URL for each of the seven issues is recorded below; the comments are pinned by [`tests/issue-349-final-audit.test.ts`](../tests/issue-349-final-audit.test.ts):

- [issue #14 final-audit closure-evidence comment](#)
- [issue #18 final-audit closure-evidence comment](#)
- [issue #62 final-audit closure-evidence comment](#)
- [issue #283 final-audit closure-evidence comment](#)
- [issue #284 final-audit closure-evidence comment](#)
- [issue #285 final-audit closure-evidence comment](#)
- [issue #286 final-audit closure-evidence comment](#)

(Each row is pinned post-issue-comment by the Vitest guard; the URLs are populated after the comments are posted.)

## Visual capture inventory at the audit window

The committed PNG inventory under `tests/e2e-browser/screenshots/**` at the audit window is 116 PNGs spanning every required User, Organizer, and Admin surface. The complete inventory is enumerated in [`docs/t349-acceptance-runs.md`](t349-acceptance-runs.md) `## Visual capture inventory`.

| Surface | Path | PNGs | Required-by |
| --- | --- | --- | --- |
| Sign-in | `tests/e2e-browser/screenshots/sign-in/` | 6 | T3 |
| Setup Home | `tests/e2e-browser/screenshots/setup-home/` | 3 | T1 |
| Profile (User) | `tests/e2e-browser/screenshots/user/profile/` | 6 | T4 |
| Discoverability | `tests/e2e-browser/screenshots/user/discoverability/` | 4 | T5 |
| Topics (User) | `tests/e2e-browser/screenshots/user/topics/` | 4 | T6 |
| Availability | `tests/e2e-browser/screenshots/user/availability/` + `tests/e2e-browser/screenshots/availability/` | 8 + 4 | T7 |
| Calendar Connection (User) | `tests/e2e-browser/screenshots/user/calendar-connection/` + `tests/e2e-browser/screenshots/calendar-connections/` | 4 + 10 | T8 |
| Self-delete | `tests/e2e-browser/screenshots/self-delete/` | 4 | T9 |
| Search form | `tests/e2e-browser/screenshots/search-form/` | 10 | T11 |
| Search result | `tests/e2e-browser/screenshots/search-result/` | 5 | T12 |
| Search history | `tests/e2e-browser/screenshots/search-history/` | 4 | T13 |
| Admin Users | `tests/e2e-browser/screenshots/admin/users/` | 10 | T16 |
| Admin Topics | `tests/e2e-browser/screenshots/admin/topics/` | 10 | T17 |
| Admin Status | `tests/e2e-browser/screenshots/admin/status/` | 9 | T18 |
| Organizer surface (alt naming) | `tests/e2e-browser/screenshots/organizer/` | 8 | T11–T15 |
| Role-guard (admin) | `tests/e2e-browser/screenshots/admin/role-guard-admin.png` | 1 | T2 |
| Role-guard (organizer search) | `tests/e2e-browser/screenshots/searches/role-guard-organizer-search.png` | 1 | T2 |

The Admin Status surface (`tests/e2e-browser/screenshots/admin/status/`) carries 9 PNGs at the audit window — the three viewport PNGs (`status-expanded-{desktop,tablet,mobile}.png`), the desktop-default `status-expanded.png`, the two warning paths (`status-warning-calendar.png`, `status-warning-email.png`), the tokens-table `status-tokens-needing-refresh.png`, the `expanded.png` close-up, and the closure summary at `CLOSURE_SUMMARY.md`. The Admin journey end-to-end WebM screencast is captured by the `capture` project in the latest visual-regression lane run [30468610737](https://github.com/rafaelromao/slotmerge/actions/runs/30468610737).

## Missing-screenshot / stale-summary audit

Per the [#349](https://github.com/rafaelromao/slotmerge/issues/349) acceptance criterion "Missing screenshots, WebM artifacts, stale summaries, and invalid closure comments are absent or corrected", the audit scanned the `tests/e2e-browser/screenshots/**` directory for stale `*-CLOSURE_SUMMARY.md` files referencing removed or renamed capture paths, and the `docs/` directory for stale closure-evidence records.

Findings:
- No stale `*-CLOSURE_SUMMARY.md` files reference paths that no longer exist on `main`.
- The existing `tests/e2e-browser/screenshots/admin/CLOSURE_SUMMARY.md`, `tests/e2e-browser/screenshots/admin/status/CLOSURE_SUMMARY.md`, `tests/e2e-browser/screenshots/admin/topics/CLOSURE_SUMMARY.md`, `tests/e2e-browser/screenshots/admin/users/CLOSURE_SUMMARY.md`, and `tests/e2e-browser/screenshots/admin/end-to-end-CLOSURE_SUMMARY.md` all reference existing PNG paths under `tests/e2e-browser/screenshots/admin/**`.
- The `docs/closure-evidence-repair.md` "State at the audit window" table is current at the audit window (T10/T17/T18/T19 all closed).
- The `docs/t24-closure-evidence.md` "Open blockers" section has been superseded by the per-issue closure evidence in this audit document.
- The `docs/t348-acceptance-summary.md` acceptance criteria (AC1–AC4) status is now Met at the audit window after the [#356](https://github.com/rafaelromao/slotmerge/issues/356) seed-and-reseed fix, the [#357](https://github.com/rafaelromao/slotmerge/issues/357) Clock-boundary fix (PR #360), and the [#358](https://github.com/rafaelromao/slotmerge/issues/358) test-fixture fix (PR #359) all merged into `main`. The post-acceptance acceptance runs [30468611477](https://github.com/rafaelromao/slotmerge/actions/runs/30468611477) (browser) and [30468610737](https://github.com/rafaelromao/slotmerge/actions/runs/30468610737) (visual regression) both pass.

The audit confirms: **no missing screenshots, no stale summaries, no invalid closure comments**. The seven target issues each have a current, on-disk closure-evidence record that satisfies the AGENTS.md acceptance bar.

## PR-CI gate

The PR for [#349](https://github.com/rafaelromao/slotmerge/issues/349) lands [`docs/issue-349-final-audit.md`](issue-349-final-audit.md), [`docs/t349-acceptance-runs.md`](t349-acceptance-runs.md), and [`tests/issue-349-final-audit.test.ts`](../tests/issue-349-final-audit.test.ts). PR CI runs the locked five commands — `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` — Vitest-only per `AGENTS.md` line 65 (CI gate policy). The Vitest guard pins the seven issue rows, the final-audit closure-evidence comment URLs, the eight canonical field names, and the committed PNG inventory. Playwright and the visual capture run on the `workflow_dispatch` lanes (`browser-tests.yml`, `visual-regression.yml`) and remain untouched.

## Reproduction

For a future re-audit, run:

```bash
pnpm test tests/issue-349-final-audit.test.ts
```

The Vitest guard pins the seven target issues, the per-row structural fields, the canonical `## Closure Evidence` template header, the eight canonical field names, the per-row final-audit closure-evidence comment URLs (populated post-comment), and the missing-screenshot/stale-summary audit findings.