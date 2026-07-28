# T15 Organizer end-to-end journey visual-capture baselines

This directory holds the per-state full-page screenshots produced by
`tests/e2e-browser/journeys/organizer/end-to-end.spec.ts` with
`CAPTURE=true`.

## Generation

The named states are produced by `pnpm test:capture` against a running
local stack (`pnpm local:up`):

```bash
pnpm local:up
pnpm test:capture -- tests/e2e-browser/journeys/organizer/end-to-end.spec.ts
```

## Required named states

| State                            | Surface    | File                                |
| -------------------------------- | ---------- | ----------------------------------- |
| `defaults`                       | form       | `organizer/search-form/defaults.png` |
| `topics-selected`                | form       | `organizer/search-form/topics-selected.png` |
| `grid`                           | result     | `organizer/search-result/grid.png` |
| `next-week`                      | result     | `organizer/search-result/next-week.png` |
| `drawer-stale`                   | drawer     | `organizer/search-result/drawer-stale.png` |
| `list`                           | history    | `organizer/search-history/list.png` |
| `source-opened-from-history`     | history    | `organizer/search-result/source-opened-from-history.png` |
| `before-rerun`                   | rerun      | `organizer/search-history/before-rerun.png` |
| `after-rerun`                    | rerun      | `organizer/search-result/after-rerun.png` |
| `two-snapshots`                  | rerun      | `organizer/search-history/two-snapshots.png` |
| `source-reopened`                | rerun      | `organizer/search-result/source-reopened.png` |

The WebM capture for the `capture` Playwright project is uploaded to
the `browser-tests.yml` and `visual-regression.yml` workflow
artifacts (`playwright/.artifacts/`) on a workflow_dispatch run; it is
not committed to the repository.
