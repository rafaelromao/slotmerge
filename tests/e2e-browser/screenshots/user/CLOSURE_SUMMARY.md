# T10 User end-to-end journey closure summary

This is the closure summary for issue #296. Each entry maps an
acceptance criterion to the evidence on the current branch head, and
identifies the inherited per-screen evidence from the closed T2–T9
dependencies.

## Acceptance criteria

| AC                                                                                                                                                                                  | Evidence                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e-browser/journeys/user/end-to-end.spec.ts` is a single Playwright spec with distinct `test.describe` blocks per User surface (invite + verify, setup checklist, profile, discoverability, topics, availability, calendar connection, sign-out) | `tests/e2e-browser/journeys/user/end-to-end.spec.ts` — 8 top-level `test.describe` blocks (no outer wrapper, no file-level `test.describe.configure({ mode: "serial" })`)                                                                                                                  |
| Uses the User `storageState` (`playwright/.auth/user.json`) and the D4 mock Email outbox seam for the rendered magic-link URL                                                       | Each per-surface block uses `test.use({ storageState: "playwright/.auth/user.json" })`; the `invite + verify` block uses `getCapturedEmails` against `http://localhost:3000/api/local/emails/:email` (`tests/e2e-browser/journeys/user/end-to-end.spec.ts:28-58`)                                                                                  |
| Each `test.describe` block is self-contained: a failure points at the right User surface, not at the whole journey                                                                  | 8 flat sibling `test.describe` blocks; each block has either a single test or its own `beforeEach` reseed (discoverability, topics, availability, calendar-connection) so a failure in one block does not block the others from running. The `sign-out` block sits last in the file so its cookie destruction cannot leak into a later block.   |
| `tests/e2e-browser/screenshots/user/{setup-home,profile,discoverability,topics,availability,calendar-connection}/<state>.png` baselines committed for every named visible state | 28 per-state PNGs committed under the six surface directories; full table in `tests/e2e-browser/screenshots/user/README.md`                                                                                                                                                                                                                              |
| Capture project run produces WebM screencasts for the full journey; PR links the artifacts                                                                                          | `playwright/.artifacts/**/*.webm` (capture lane) — linked from the PR comment by the `visual-regression.yml` and `browser-tests.yml` workflow run URLs                                                                                                                                                                                                   |
| Green on a clean local stack and on the `workflow_dispatch` lane. PR CI does not run the journey                                                                                    | `browser-tests.yml` and `visual-regression.yml` run on `workflow_dispatch` only; PR CI runs `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (Vitest only)                                                                                                                                                                |
| `AGENTS.md` Rendered-screen completion gates honored                                                                                                                                | Inherited per-screen evidence listed below; T10 itself adds the cross-surface happy path, the cross-surface failure path per surface, the cross-surface visual-capture baselines, and the closure-evidence anchor for the User sub-PRD #19                                                                                                                |

## Rendered-screen completion gates (AGENTS.md)

| Gate                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright happy-path (per surface, T2–T9) | `tests/e2e-browser/journeys/user/{magic-link,setup-home,profile,discoverability,topics,availability,calendar-connection}.spec.ts`                                                                                                                                                                                                                                                                                       |
| Playwright failure-path (per surface)       | Per-surface failure paths are inside the same per-surface specs (e.g. `profile.spec.ts` empty-display-name / unsupported-timezone / out-of-range-buffer / http-avatar / 281-char-bio; `discoverability.spec.ts` consent-required; `topics.spec.ts` similarity-blocked; `availability.spec.ts` end-before-start / overlap / invalid-time / date-required; `calendar-connection.spec.ts` denied / unsupported / needs-reconnect / reconnected-expired) |
| Vitest unit (workflow boundary)             | `tests/workflow-magic-link.test.ts`, `tests/workflow-profile.test.ts`, `tests/workflow-discoverability.test.ts`, `tests/workflow-topics.test.ts`, `tests/workflow-availability.test.ts`, `tests/workflow-calendar-connection.test.ts`, `tests/workflow-self-delete.test.ts` (typed `Result<T, E>` return shape for each workflow module)                                                                              |
| Component tests (`renderToString` + `happy-dom`) | Per-page `renderToString` + `happy-dom` component tests landed by T2–T9 for each per-page server component and any client island                                                                                                                                                                                                                                                                                  |
| Visual capture (T10 journey)                | `tests/e2e-browser/screenshots/user/{setup-home,profile,discoverability,topics,availability,calendar-connection}/*.png` per the README; capture lane `playwright/.artifacts/**/*.webm`                                                                                                                                                                                                                                |
| WCAG 2.1 AA bar                              | Per-page server component carries labelled inputs, `role="alert"` / `aria-describedby` on errors, single `h1` per page, colour not the sole carrier of state, `prefers-reduced-motion` honored; the journey re-asserts `role="alert"` + `aria-live="polite"` on the discoverability consent error (`tests/e2e-browser/journeys/user/end-to-end.spec.ts:343-347`)                                       |
| Three-tier responsive bar                  | Inherited from the per-page evidence; journey drives the default Desktop Chrome viewport (matches the per-screen capture convention)                                                                                                                                                                                                                                                                                   |
| SSR first paint                              | Every page in the journey renders the surface's primary content in server-rendered HTML; the journey asserts the server-rendered headings (`Edit profile`, `Discoverability consent`, `My Topics`, `Edit availability`, `Calendar connections`, `Welcome to SlotMerge`) on first navigation                                                                                                                                 |
| Empty-state with primary action             | `calendar-connection/empty.png` shows the canonical empty-state copy with the two `calendar-connection-connect-{google,microsoft}` CTAs as primary actions                                                                                                                                                                                                                                                              |
| Browser-journey coverage (User)             | `tests/e2e-browser/journeys/user/end-to-end.spec.ts` (this PR)                                                                                                                                                                                                                                                                                                                                                         |
| CI gate policy                              | PR CI runs `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (Vitest only); Playwright runs on `workflow_dispatch` only                                                                                                                                                                                                                                                                     |

## Self-contained block contract

The eight `test.describe` blocks (invite + verify, setup checklist
Home, profile, discoverability consent, topics, availability,
calendar connection, sign-out) each own a single surface. A test
failure in a block points to that surface in the Playwright HTML
report and in the per-test WebM. The blocks that mutate the shared
seeded fixtures (discoverability, topics, availability,
calendar-connection) each carry a `beforeEach` reseed that wipes the
fixture rows the block touches, so per-block failure isolation holds
even under `fullyParallel` mode without any file-level
`test.describe.configure({ mode: "serial" })`. The sign-out block sits
last in the file so its cookie destruction cannot leak into a later
block.

## Capture artifact

The capture lane artifact produced by `pnpm test:capture` is uploaded
to the `visual-regression.yml` and `browser-tests.yml` workflow
artifacts on a `workflow_dispatch` run. For the implementor's local
run, the WebM is available at:

```
playwright/.artifacts/test-results/journeys-user-end-to-end-User-*-*-capture/video.webm
```

The 28 per-state PNGs accompany this WebM in the same
`visual-regression.yml` workflow artifact and are auto-committed to
`tests/e2e-browser/screenshots/user/` by the workflow.
