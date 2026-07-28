# T25 sub-PRD closure evidence

## AGENTS.md closure gates

The following block is reproduced from `AGENTS.md` lines 51–66 character-for-character. Each sub-PRD closing comment reproduces only the rows applicable to its owned surfaces.

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

## Scoped evidence

| Sub-PRD | Required tickets | Workflow module(s) | Journey owner | Status |
| --- | --- | --- | --- | --- |
| #15 Search & Matching | T10–T15 | `searchWorkflow` | `tests/e2e-browser/journeys/organizer/*` | Blocked by T10 (#296) |
| #16 Auth & Invites | T3 | `authWorkflow` | `tests/e2e-browser/journeys/user/magic-link.spec.ts` | Eligible |
| #17 Calendar Connections | T8 | `calendarConnectionWorkflow` | `tests/e2e-browser/journeys/user/calendar-connection.spec.ts` | Eligible |
| #18 Admin & Notifications | T16–T19 | `adminUsersWorkflow`, `adminTopicsWorkflow`, `adminStatusWorkflow` | `tests/e2e-browser/journeys/admin/*` | Blocked by T17 (#303), T18 (#304), T19 (#305) |
| #19 Profile & Setup | T4, T5, T6, T7, T9 | `profileWorkflow`, `discoverabilityWorkflow`, `topicWorkflow`, `availabilityWorkflow`, `accountWorkflow` | `tests/e2e-browser/journeys/user/*` | Eligible |

Evidence rows are pinned by `docs/t24-closure-evidence.md` lines 70–84. The eligible issues may close after the current PR receives human approval; blocked issues remain open until their listed tickets close.

## Per-sub-PRD closing comment templates

Each template consists of the scoped rows above, the applicable verbatim gate lines from `AGENTS.md`, and this required sign-off line:

`Human reviewer sign-off: approved on the current T25 change-request diff (see PR review).`

- #15: T10–T15 rows and Organizer journey gates; blocked by T10 (#296), do not close.
- #16: T3 row and User magic-link journey gates; eligible to close after human sign-off.
- #17: T8 row and User Calendar Connection journey gates; eligible to close after human sign-off.
- #18: T16–T19 rows and Admin journey gates; blocked by T17 (#303), T18 (#304), and T19 (#305), do not close.
- #19: T4, T5, T6, T7, and T9 rows and User journey gates; eligible to close after human sign-off.

## Tracker sequence

The PR body uses `Closes #311`. For an eligible sub-PRD, post its scoped evidence comment, observe the current-diff human approval, then close the issue with that same closing comment. Blocked sub-PRDs receive their evidence and blocker comment but remain open. The evidence document is the durable record of the exact comments.

## PR-CI gate

`pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` remains the required PR-CI gate. Playwright and visual capture remain workflow-dispatch-only.
