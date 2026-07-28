# Admin section visual-capture baseline

This directory holds the per-state full-page screenshots produced by
the Admin Playwright journey specs under
`tests/e2e-browser/journeys/admin/*.spec.ts` with `CAPTURE=true`.

## Generation

The named states are produced by `pnpm test:capture` against a running
local stack (`pnpm local:up`):

```bash
pnpm local:up
pnpm test:capture
```

## Required named states

### Admin → Users (`users.spec.ts`, `end-to-end.spec.ts`)

| State                     | Source line(s)           | File                                |
| ------------------------- | ------------------------ | ----------------------------------- |
| `users-expanded`          | `users.spec.ts:45`       | `users/users-expanded.png`          |
| `self-row-disabled`       | `users.spec.ts:63`       | `users/self-row-disabled.png`       |
| `users-after-invite`      | `users.spec.ts:84`       | `users/users-after-invite.png`      |
| `users-suspend-confirm`   | `users.spec.ts:121`      | `users/users-suspend-confirm.png`   |
| `users-self-invite-error` | `users.spec.ts:171`      | `users/users-self-invite-error.png` |
| `invite-banner` (T19)     | `end-to-end.spec.ts:68`  | `users/invite-banner.png`           |
| `role-changed` (T19)      | `end-to-end.spec.ts:105` | `users/role-changed.png`            |
| `suspend-confirm` (T19)   | `end-to-end.spec.ts:140` | `users/suspend-confirm.png`         |
| `suspended` (T19)         | `end-to-end.spec.ts:158` | `users/suspended.png`               |
| `reinstated` (T19)        | `end-to-end.spec.ts:209` | `users/reinstated.png`              |

### Admin → Topics (`topics.spec.ts`, `end-to-end.spec.ts`)

| State                         | Source line(s)           | File                                     |
| ----------------------------- | ------------------------ | ---------------------------------------- |
| `topics-expanded`             | `topics.spec.ts:30`      | `topics/topics-expanded.png`             |
| `topics-after-approve`        | `topics.spec.ts:52`      | `topics/topics-after-approve.png`        |
| `topics-after-reject`         | `topics.spec.ts:74`      | `topics/topics-after-reject.png`         |
| `topics-self-action-disabled` | `topics.spec.ts:96`      | `topics/topics-self-action-disabled.png` |
| `topics-retire-confirm`       | `topics.spec.ts:125`     | `topics/topics-retire-confirm.png`       |
| `topics-after-retire`         | `topics.spec.ts:143`     | `topics/topics-after-retire.png`         |
| `approve-proposal` (T19)      | `end-to-end.spec.ts:250` | `topics/approve-proposal.png`            |
| `reject-proposal` (T19)       | `end-to-end.spec.ts:293` | `topics/reject-proposal.png`             |
| `retire-confirm` (T19)        | `end-to-end.spec.ts:337` | `topics/retire-confirm.png`              |
| `retired` (T19)               | `end-to-end.spec.ts:351` | `topics/retired.png`                     |

### Admin → Status (`status.spec.ts`, `end-to-end.spec.ts`)

| State                           | Source line(s)           | File                                       |
| ------------------------------- | ------------------------ | ------------------------------------------ |
| `status-expanded`               | `status.spec.ts:47`      | `status/status-expanded.png`               |
| `status-warning-calendar`       | `status.spec.ts:85`      | `status/status-warning-calendar.png`       |
| `status-warning-email`          | `status.spec.ts:113`     | `status/status-warning-email.png`          |
| `status-tokens-needing-refresh` | `status.spec.ts:138`     | `status/status-tokens-needing-refresh.png` |
| `status-expanded-desktop`       | `status.spec.ts:157`     | `status/status-expanded-desktop.png`       |
| `status-expanded-tablet`        | `status.spec.ts:157`     | `status/status-expanded-tablet.png`        |
| `status-expanded-mobile`        | `status.spec.ts:157`     | `status/status-expanded-mobile.png`        |
| `expanded` (T19 happy path)     | `end-to-end.spec.ts:388` | `status/expanded.png`                      |

The WebM capture for the `capture` Playwright project is uploaded to
the `browser-tests.yml` and `visual-regression.yml` workflow artifacts
(`playwright/.artifacts/`) on a `workflow_dispatch` run; it is not
committed to the repository.

## Closure summaries

After running `pnpm test:capture`, link the latest workflow run from
the closing PR comment so the WebM and per-state PNGs are visible to
reviewers.

- T17 Topics closure: `tests/e2e-browser/screenshots/admin/CLOSURE_SUMMARY.md`
- T18 Status closure: `tests/e2e-browser/screenshots/admin/status/CLOSURE_SUMMARY.md`
- T19 end-to-end closure: `tests/e2e-browser/screenshots/admin/end-to-end-CLOSURE_SUMMARY.md`
