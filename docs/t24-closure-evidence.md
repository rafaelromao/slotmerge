# T24 closure evidence

## AGENTS.md closure gates

The following block reproduces `AGENTS.md` lines 51–66 character-for-character, per the [Define rendered-screen and browser-journey completion gates](https://github.com/rafaelromao/slotmerge/issues/279) entry and the [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14) closure-evidence contract.

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

## Implementation-graph T24 entry

The following block reproduces `docs/implementation-graph.md` lines 218–222 character-for-character, per the [implementation ticket graph T24 entry](https://github.com/rafaelromao/slotmerge/blob/main/docs/implementation-graph.md#24-top-level-prd-14-closure) referenced by issue #310 and the [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14) closure contract.

```text
### T24. Top-level PRD #14 closure

- **Depends on**: T1–T23.
- **Owns**: the closure of issue #14. The closing comment reproduces the closure evidence set: every screen ticket under the five sub-PRDs is closed with the AGENTS.md closure evidence; the three end-to-end Playwright journeys pass; the visual capture run produces the per-screen baselines; the spec/PRD/E2E plan repair PRs are merged; a human reviewer has signed the closure.
- **Closure evidence**: the AGENTS.md closure-gate set reproduced verbatim; the link to each end-to-end Playwright journey run; the link to the visual capture artifacts; the human reviewer's sign-off.
```

## Implementation-graph T24 parent-PRD closure ticket

The T24 entry above is the canonical record of the parent-PRD closure ticket. The `## Implementation-graph T24 parent-PRD closure ticket` heading anchors the eventual closing comment on issue #14 to this document.

## AGENTS.md acceptance bar

The verbatim `## AGENTS.md closure gates` block at the top of this document is the source-of-truth reproduction of the AGENTS.md acceptance bar (lines 51–66). The closing PR comment on #14 reproduces the same block.

## Screen-level closure (per sub-PRD)

The screen-level closure of issue #14 requires every screen-level implementation ticket under the five sub-PRDs to be closed with the AGENTS.md closure evidence. Per the `## Closure Evidence` body of issue #14 and the [implementation ticket graph](https://github.com/rafaelromao/slotmerge/blob/main/docs/implementation-graph.md), the per-sub-PRD scope is:

- **Search & Matching** ([#15](https://github.com/rafaelromao/slotmerge/issues/15)): closes when **T10–T15** are closed. T11–T15 are closed; **T10 (#296) is open** and is the end-to-end User journey blocker.
- **Auth & Invites** ([#16](https://github.com/rafaelromao/slotmerge/issues/16)): closes when **T3** is closed. T3 is closed.
- **Calendar Connections** ([#17](https://github.com/rafaelromao/slotmerge/issues/17)): closes when **T8** is closed. T8 is closed.
- **Admin & Notifications** ([#18](https://github.com/rafaelromao/slotmerge/issues/18)): closes when **T16–T19** are closed. T16 is closed; **T17 (#303), T18 (#304), and T19 (#305) are open** and are the Admin journey blockers.
- **Profile & Setup** ([#19](https://github.com/rafaelromao/slotmerge/issues/19)): closes when **T4, T5, T6, T7, T9** are closed. All five are closed.

## End-to-end browser journeys

The `## End-to-end browser journeys` subsection records the per-role end-to-end Playwright journey status, per the AGENTS.md browser-journey coverage bar (lines 61–64).

- **User** (`tests/e2e-browser/journeys/user/end-to-end.spec.ts`): **not landed** — T10 (#296) is open. The journey drives invite → verify → setup checklist → profile → consent → topics → availability → calendar connection → sign-out.
- **Organizer** (`tests/e2e-browser/journeys/organizer/end-to-end.spec.ts`): **landed** — closed by PR [#331](https://github.com/rafaelromao/slotmerge/pull/331). The journey drives search form → result → drawer → history → rerun.
- **Admin** (`tests/e2e-browser/journeys/admin/end-to-end.spec.ts`): **not landed** — T19 (#305) is open. The journey drives invite → role change → suspend → reinstate → approve proposal → reject proposal → retire topic → status page.

## Closed implementation tickets

The following 19 implementation tickets are closed. Each row records the T-number, the issue number, the closing PR URL, the Playwright journey file, the Vitest test file, and the visual-capture directory. The T-number → issue → PR mapping is pinned by `tests/t24-closure-evidence.test.ts` so any future re-run that reopens or re-closes a ticket requires a corresponding edit to the test.

| T | Issue | Closing PR | Playwright journey | Vitest test | Visual capture |
| --- | --- | --- | --- | --- | --- |
| T1 | [#287](https://github.com/rafaelromao/slotmerge/issues/287) | [#316](https://github.com/rafaelromao/slotmerge/pull/316) | `tests/e2e-browser/journeys/user/setup-home.spec.ts` | `src/workflow/setup-home.test.ts` | `tests/e2e-browser/screenshots/setup-home/` |
| T2 | [#288](https://github.com/rafaelromao/slotmerge/issues/288) | [#317](https://github.com/rafaelromao/slotmerge/pull/317) | `tests/e2e-browser/journeys/user/role-guard.spec.ts` | `src/auth/page-context.test.ts` | n/a |
| T3 | [#289](https://github.com/rafaelromao/slotmerge/issues/289) | [#318](https://github.com/rafaelromao/slotmerge/pull/318) | `tests/e2e-browser/journeys/user/magic-link.spec.ts` | `src/workflow/auth.test.ts` | `tests/e2e-browser/screenshots/sign-in/` |
| T4 | [#290](https://github.com/rafaelromao/slotmerge/issues/290) | [#319](https://github.com/rafaelromao/slotmerge/pull/319) | `tests/e2e-browser/journeys/user/profile.spec.ts` | `src/workflow/profile.test.ts` | n/a |
| T5 | [#291](https://github.com/rafaelromao/slotmerge/issues/291) | [#320](https://github.com/rafaelromao/slotmerge/pull/320) | `tests/e2e-browser/journeys/user/discoverability.spec.ts` | `src/workflow/discoverability.test.ts` | n/a |
| T6 | [#292](https://github.com/rafaelromao/slotmerge/issues/292) | [#321](https://github.com/rafaelromao/slotmerge/pull/321) | `tests/e2e-browser/journeys/user/topics.spec.ts` | `src/topics/topic-workflow.ts` | n/a |
| T7 | [#293](https://github.com/rafaelromao/slotmerge/issues/293) | [#322](https://github.com/rafaelromao/slotmerge/pull/322) | `tests/e2e-browser/journeys/user/availability.spec.ts` | `src/workflow/availability.test.ts` | n/a |
| T8 | [#294](https://github.com/rafaelromao/slotmerge/issues/294) | [#324](https://github.com/rafaelromao/slotmerge/pull/324) | `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` | `src/workflow/calendar-connection.test.ts` | `tests/e2e-browser/screenshots/calendar-connections/` |
| T9 | [#295](https://github.com/rafaelromao/slotmerge/issues/295) | [#327](https://github.com/rafaelromao/slotmerge/pull/327) | `tests/e2e-browser/journeys/user/self-delete.spec.ts` | `src/workflow/account.test.ts` | `tests/e2e-browser/screenshots/self-delete/` |
| T11 | [#297](https://github.com/rafaelromao/slotmerge/issues/297) | [#325](https://github.com/rafaelromao/slotmerge/pull/325) | `tests/e2e-browser/journeys/organizer/search-form.spec.ts` | `src/workflow/search.ts` | `tests/e2e-browser/screenshots/search-form/` |
| T12 | [#298](https://github.com/rafaelromao/slotmerge/issues/298) | [#328](https://github.com/rafaelromao/slotmerge/pull/328) | `tests/e2e-browser/journeys/organizer/search-result.spec.ts` | `src/workflow/search.ts` | `tests/e2e-browser/screenshots/search-result/` |
| T13 | [#299](https://github.com/rafaelromao/slotmerge/issues/299) | [#329](https://github.com/rafaelromao/slotmerge/pull/329) | `tests/e2e-browser/journeys/organizer/search-history.spec.ts` | `src/workflow/search.ts` | `tests/e2e-browser/screenshots/search-history/` |
| T14 | [#300](https://github.com/rafaelromao/slotmerge/issues/300) | [#330](https://github.com/rafaelromao/slotmerge/pull/330) | `tests/e2e-browser/journeys/organizer/api-v1.spec.ts` | `src/api/serializers.test.ts` | n/a |
| T15 | [#301](https://github.com/rafaelromao/slotmerge/issues/301) | [#331](https://github.com/rafaelromao/slotmerge/pull/331) | `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` | `src/workflow/search.ts` | `tests/e2e-browser/screenshots/organizer/` |
| T16 | [#302](https://github.com/rafaelromao/slotmerge/issues/302) | [#323](https://github.com/rafaelromao/slotmerge/pull/323) | `tests/e2e-browser/journeys/admin/users.spec.ts` | `src/workflow/admin-users.test.ts` | `tests/e2e-browser/screenshots/admin/` |
| T20 | [#306](https://github.com/rafaelromao/slotmerge/issues/306) | [#313](https://github.com/rafaelromao/slotmerge/pull/313) | n/a (PRD amendments) | n/a | n/a |
| T21 | [#307](https://github.com/rafaelromao/slotmerge/issues/307) | [#312](https://github.com/rafaelromao/slotmerge/pull/312) | n/a (E2E plan in-place update) | n/a | n/a |
| T22 | [#308](https://github.com/rafaelromao/slotmerge/issues/308) | [#314](https://github.com/rafaelromao/slotmerge/pull/314) | n/a (compat adapter retirement) | n/a | n/a |
| T23 | [#309](https://github.com/rafaelromao/slotmerge/issues/309) | [#315](https://github.com/rafaelromao/slotmerge/pull/315) | n/a (stale assertion cleanup) | n/a | n/a |
