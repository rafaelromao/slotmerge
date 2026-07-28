# Admin Status section closure evidence

## Implementation

The Status section of `/admin` renders a read-only dashboard with three sub-blocks (Transactional email delivery, Calendar connections, Tokens needing refresh), threshold pills (green/amber/red), warning banners with verbatim copy from issue #304, and per-row Refresh/Disconnect forms that delegate to the user-page Server Actions (`refreshConnectionAction` / `disconnectConnectionAction`) via an admin override branch that resolves the connection's owning `userId` via `findById` and redirects to `/admin?action=…`.

The legacy `/admin/status` route still 308-redirects to `/admin#status` (unchanged).

## Visual evidence

### Happy path (green pills, empty tokens table)

- `tests/e2e-browser/screenshots/admin/status-expanded.png` — desktop happy-path capture.
- `tests/e2e-browser/screenshots/admin/status-expanded-desktop.png` — viewport ≥1024px.
- `tests/e2e-browser/screenshots/admin/status-expanded-tablet.png` — viewport 768–1023px.
- `tests/e2e-browser/screenshots/admin/status-expanded-mobile.png` — viewport <768px.

### Warning path (Email + Calendar degraded, two needs_reconnect rows)

- `tests/e2e-browser/screenshots/admin/status-warning.png` — desktop warning-path capture.

### Tokens-needing-refresh path

- `tests/e2e-browser/screenshots/admin/status-tokens-needing-refresh.png` — populated tokens table with Refresh/Disconnect forms.

### WebM artifact

- Local capture run produces `playwright/.artifacts/admin/status-warning.webm` (capture project).
- Canonical lane-uploaded WebM lives in the `browser-tests.yml` workflow artifacts on `workflow_dispatch`.

## Acceptance criteria mapping

- [x] Status section shows generated timestamp + 24h Email health (counts + failure rate) + per-provider Calendar Connection summary (pending/connected/needs_reconnect/disconnected) + Tokens-needing-refresh table — `app/(product)/admin/_components/AdminStatusSection.tsx`, `src/admin/operational-status.workflow.ts`, `src/admin/operational-status.repository.ts`.
- [x] Status thresholds (Email failure rate <5% green / 5-10% amber / >10% red; needs_reconnect 0 green / 1 amber / >1 red; tokens 0 green / 1-3 amber / >3 red) — `deriveStatusTone` in `src/admin/operational-status.workflow.ts` plus `src/admin/operational-status.health.test.ts`.
- [x] Warning banners with verbatim copy (Email: "Email delivery is degraded. The latest `emailEvent` rows in the DB are the source of truth; a re-run is automatic on the next retry window." Calendar: "One or more Calendar connections need reconnect. Visit /me/calendar-connections on the affected User's account to reconnect.") — `AdminStatusSection.tsx`.
- [x] Tokens-needing-refresh table has per-row Refresh and Disconnect forms that call the user-page Server Actions via the admin override branch — `app/(product)/me/_actions/calendar-connections.ts` (helpers `refreshRedirectTarget` and `disconnectRedirectTarget`).
- [x] No `Refresh now` button — asserted in `tests/app-admin-status-section.test.tsx` and the e2e spec.
- [x] No `Send critical operational email` button — asserted in the same files.
- [x] `/admin/status` redirects to `/admin#status` — `app/admin/status/route.ts` (unchanged).
- [x] Playwright journey drives the page in all three viewports — `tests/e2e-browser/journeys/admin/status.spec.ts`.
- [x] AGENTS.md Rendered-screen completion gates (WCAG 2.1 AA, three-tier responsive, empty-state CTA, no client-side data fetching, server-rendered first paint) — `AdminStatusSection.tsx`, `app/globals.css`.