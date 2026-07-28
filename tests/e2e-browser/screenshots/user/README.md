# T10 User end-to-end journey visual-capture baselines

This directory holds the per-state full-page screenshots produced by
`tests/e2e-browser/journeys/user/end-to-end.spec.ts` with
`CAPTURE=true`.

## Generation

The named states are produced by `pnpm test:capture` against a running
local stack (`pnpm local:up`):

```bash
pnpm local:up
pnpm test:capture -- tests/e2e-browser/journeys/user/end-to-end.spec.ts
```

## Required named states

| State                     | Surface              | File                                             |
| ------------------------- | -------------------- | ------------------------------------------------ |
| `signed-out`              | setup-home           | `user/setup-home/signed-out.png`                 |
| `checklist`               | setup-home           | `user/setup-home/checklist.png`                  |
| `avatar-open`             | setup-home           | `user/setup-home/avatar-open.png`                |
| `loaded`                  | profile              | `user/profile/loaded.png`                        |
| `filled`                  | profile              | `user/profile/filled.png`                        |
| `saved`                   | profile              | `user/profile/saved.png`                         |
| `saved-then-hidden`       | profile              | `user/profile/saved-then-hidden.png`             |
| `error-display-name`      | profile              | `user/profile/error-display-name.png`            |
| `error-buffer`            | profile              | `user/profile/error-buffer.png`                  |
| `initial`                 | discoverability      | `user/discoverability/initial.png`               |
| `granted`                 | discoverability      | `user/discoverability/granted.png`               |
| `revoked`                 | discoverability      | `user/discoverability/revoked.png`               |
| `error`                   | discoverability      | `user/discoverability/error.png`                 |
| `loaded`                  | topics               | `user/topics/loaded.png`                         |
| `saved`                   | topics               | `user/topics/saved.png`                          |
| `pending-proposal`        | topics               | `user/topics/pending-proposal.png`               |
| `similarity-error`        | topics               | `user/topics/similarity-error.png`               |
| `loaded`                  | availability         | `user/availability/loaded.png`                    |
| `saved`                   | availability         | `user/availability/saved.png`                    |
| `add-override`            | availability         | `user/availability/add-override.png`             |
| `block-override`          | availability         | `user/availability/block-override.png`           |
| `buffer-edited`           | availability         | `user/availability/buffer-edited.png`            |
| `error-end-before-start`  | availability         | `user/availability/error-end-before-start.png`   |
| `error-overlap`           | availability         | `user/availability/error-overlap.png`            |
| `loaded`                  | calendar-connection  | `user/calendar-connection/loaded.png`            |
| `denied`                  | calendar-connection  | `user/calendar-connection/denied.png`            |
| `unsupported`             | calendar-connection  | `user/calendar-connection/unsupported.png`       |
| `empty`                   | calendar-connection  | `user/calendar-connection/empty.png`             |

## State-vocabulary coverage

Issue #296 calls for the AC's "loading, populated, empty, error, stale"
state vocabulary. The end-to-end journey covers the categories that
have a natural surface-level expression for the User role:

- **loading** — `signed-out`, `loaded`, `initial` (initial form renders
  before any user input).
- **populated** — `checklist`, `avatar-open`, `filled`, `saved`,
  `saved-then-hidden`, `granted`, `revoked`, `pending-proposal`,
  `add-override`, `block-override`, `buffer-edited`,
  `calendar-connection/loaded`, `denied`, `unsupported`.
- **empty** — `calendar-connection/empty.png`.
- **error** — `error-display-name`, `error-buffer`, `discoverability/error`,
  `similarity-error`, `error-end-before-start`, `error-overlap`.
- **stale** — The User surfaces do not have a "stale" data state of the
  same kind as the Organizer surfaces (e.g. stale search results, stale
  calendar connection). The closest candidates are the populated captures
  that show data that has been left from a prior interaction:
  `discoverability/revoked.png` (consent was granted and then revoked —
  the form is populated with stale form values), `topics/pending-proposal.png`
  (a proposal submitted earlier and awaiting admin action — the row is
  populated with stale-but-pending data), and `availability/buffer-edited.png`
  (the buffer summary now reads the round-tripped value, while the rest of
  the page reflects state that was edited via `/me/profile` and is therefore
  momentarily out-of-date relative to the seed). The `stale` category is
  therefore implicitly covered by the populated captures above; an
  explicit `stale.png` would be a duplicate of one of those surfaces.

## WebM capture

The WebM capture for the `capture` Playwright project is uploaded to
the `browser-tests.yml` and `visual-regression.yml` workflow
artifacts (`playwright/.artifacts/`) on a `workflow_dispatch` run; it
is not committed to the repository.
