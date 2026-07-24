# Admin section visual-capture baseline

This directory holds the per-state full-page screenshots produced by
`tests/e2e-browser/journeys/admin/users.spec.ts` with `CAPTURE=true`.

## Generation

The named states are produced by `pnpm test:capture` against a running
local stack (`pnpm local:up`):

```bash
pnpm local:up
pnpm test:capture
```

## Required named states

| State                          | Source line in `users.spec.ts` | File                              |
| ------------------------------ | ------------------------------ | --------------------------------- |
| `users-expanded`               | 41                             | `users-expanded.png`              |
| `self-row-disabled`            | 59                             | `self-row-disabled.png`           |
| `users-after-invite`           | 80                             | `users-after-invite.png`          |
| `users-suspend-confirm`        | 113                            | `users-suspend-confirm.png`       |
| `users-self-invite-error`      | 163                            | `users-self-invite-error.png`     |

The WebM capture for the `capture` Playwright project is uploaded to
the `browser-tests.yml` workflow artifacts (`playwright/.artifacts/`)
on a workflow_dispatch run; it is not committed to the repository.

## Closure summary

After running `pnpm test:capture`, link the latest workflow run from
the closing PR comment so the WebM and per-state PNGs are visible to
reviewers.
