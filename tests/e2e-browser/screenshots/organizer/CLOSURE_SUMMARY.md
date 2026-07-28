# T15 Organizer end-to-end journey closure summary

This is the closure summary for issue #301. Each entry maps an acceptance
criterion to the evidence on the current branch head, and identifies the
inherited per-screen evidence from the closed T11–T13 dependencies.

## Acceptance criteria

| AC                                                                          | Evidence                                                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` per surface       | `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` — 5 `test.describe` blocks (form, result, drawer, history, rerun) |
| Organizer `storageState` (`playwright/.auth/organizer.json`)                | L69 of the spec                                                                                                            |
| Self-contained `test.describe` blocks (failure points at the right surface)  | L67-68 (`mode: "serial"`) + per-describe `beforeEach` reseeds + per-test independent flow                                  |
| `tests/e2e-browser/screenshots/organizer/{search-form,search-result,search-history}/<state>.png` baselines | `tests/e2e-browser/screenshots/organizer/README.md` enumerates the 11 required named states; the `CAPTURE=true` capture project produces them and `visual-regression.yml` auto-commits them on `workflow_dispatch` |
| Capture WebM artifacts                                                       | `playwright/.artifacts/test-results/journeys-organizer-end-to-end-*-capture/video.webm` (capture lane) — linked from the PR comment by the workflow run URL |
| Green on local stack + `workflow_dispatch` lane; PR CI does not run journey | Local `pnpm test:e2e:browser` + `pnpm test:capture` (when the local Docker stack is up); `browser-tests.yml` and `visual-regression.yml` run on `workflow_dispatch` only |
| `AGENTS.md` Rendered-screen completion gates honored                        | Inherited per-screen evidence listed below; T15 itself adds the cross-surface happy path and self-contained failure path per surface |

## Rendered-screen completion gates (AGENTS.md)

| Gate                                       | Evidence                                                                                                                                                                                                                                                                                |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright happy-path (per surface, T11–T13) | `tests/e2e-browser/journeys/organizer/search-form.spec.ts`, `tests/e2e-browser/journeys/organizer/search-result.spec.ts`, `tests/e2e-browser/journeys/organizer/search-history.spec.ts`                                                                                                  |
| Playwright failure-path (per surface, T11–T13) | `tests/e2e-browser/journeys/organizer/search-form.spec.ts:52-191`, `tests/e2e-browser/journeys/organizer/search-result.spec.ts:144-170`, `tests/e2e-browser/journeys/organizer/search-history.spec.ts:95-114`                                                                            |
| Vitest unit (workflow boundary)             | `tests/workflow-search.test.ts`, `tests/run-search-action-handler.test.ts` (typed `Result<T, E>` for `searchWorkflow.buildForm`, `openSnapshot`, `run`, `listHistory`, `rerun`)                                                                                                          |
| Component tests (renderToString)            | `tests/app-searches-page.test.tsx`, `tests/search-result-page.test.tsx`, `tests/search-history-page.test.tsx`, `tests/slot-details-drawer.test.tsx`, `tests/match-card.test.tsx`                                                                                                         |
| Vitest e2e (in-process seam)                | `tests/e2e/search-path-end-to-end.test.ts` (T15 inherits as the lower-level seam)                                                                                                                                                                                                       |
| Visual capture (T15 journey)                | `tests/e2e-browser/screenshots/organizer/{search-form,search-result,search-history}/<state>.png` per the README; capture lane `playwright/.artifacts/test-results/**/video.webm`                                                                                                       |
| WCAG 2.1 AA bar                              | Per-page server component + drawer carry labelled inputs, `role="alert"` / `aria-describedby` on errors, `role="dialog"` + `aria-modal` + `aria-labelledby` + `aria-describedby` + focus trap + Escape close on `SlotDetailsDrawer` (asserted in `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts`) |
| Three-tier responsive bar                  | T15 inherits the per-page evidence; journey drives the default Desktop Chrome viewport (matches the per-screen capture convention)                                                                                                                                                       |
| SSR first paint                              | `/searches`, `/searches/{id}`, `/searches/history` are `async function` RSC pages; the journey asserts the server-rendered headings on first navigation                                                                                                                                |
| Empty-state with primary action             | `search-history-empty-state` primary action `Run your first Search → /searches` is asserted in the journey's failure path                                                                                                                                                              |
| Browser-journey coverage (Organizer)       | `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` (this PR)                                                                                                                                                                                                                     |
| CI gate policy                              | PR CI runs `pnpm typecheck && pnpm lint && pnpm format:check && pnpm test && pnpm build` (Vitest only); Playwright runs on `workflow_dispatch` only                                                                                                                                   |

## Self-contained block contract

The five `test.describe` blocks (search form, search result, slot
details drawer, search history, rerun) each own a single surface. A
test failure in a block points to that surface in the Playwright HTML
report and in the per-test WebM. The rerun block is a single
self-contained test that replays form → result → drawer → history →
re-run, so the full canonical journey appears in one capture WebM
without relying on cross-test mutable state.

## Capture artifact

The capture lane artifact produced by `pnpm test:capture` is uploaded
to the `visual-regression.yml` and `browser-tests.yml` workflow
artifacts on a `workflow_dispatch` run. For the implementor's local
run, the WebM is available at:

```
playwright/.artifacts/test-results/journeys-organizer-end-to-end-Organizer-*-rerun-surface-capture/video.webm
```

The eleven per-state PNGs accompany this WebM in the same
`visual-regression.yml` workflow artifact and are auto-committed to
`tests/e2e-browser/screenshots/organizer/` by the workflow.
