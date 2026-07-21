# PRD Amendments — Issue #306

This file documents the in-place amendments made to PRDs #14–#19 per issue #306.

## Changes made

### PRD #14 — SlotMerge MVP PRD
- Appended a new **Closure Evidence** section that mirrors:
  - The [implementation-graph per-ticket Closure Evidence template](docs/implementation-graph.md#8-per-ticket-closure-evidence-template) (lines 270–284)
  - The [AGENTS.md closure gate items](AGENTS.md) (lines 51–66)
  - The [implementation-graph T24 parent-PRD closure ticket](docs/implementation-graph.md#24-top-level-prd-14-closure) criteria

### PRD #15 — Search & Matching
Added 9 new sections to the body:
1. **Canonical URL Ownership** — pages and Server Actions (T11–T15): `/searches`, `POST /searches/run`, `/searches/[id]`, `/searches/history`, `/api/v1/*`
2. **Canonical Workflow Module** — `searchWorkflow.buildForm`, `searchWorkflow.run`, `searchWorkflow.openSnapshot`, `searchWorkflow.listHistory`, `searchWorkflow.rerun`
3. **Browser-Journey Owner** — `tests/e2e-browser/journeys/organizer/*`
4. **Closure Evidence** — the implementation-graph per-ticket template, scoped to T11–T15; references T25 for sub-PRD closure
5. **AGENTS.md Acceptance Bar** — the full AGENTS.md lines 51–66 checklist
6. **Self-Action Protection** — Searcher excluded from their own Search's candidate pool (User Story #45)
7. **SSR-by-Default Rule** — all pages render server-rendered HTML; no client-side data fetching
8. **Snapshot Immutability Rule** — Search snapshots are immutable once created; re-runs create new snapshots
9. **No-Booking Scope** — no invitations, RSVP, calendar event creation, or reservation

### PRD #16 — Auth & Invites
Added 9 new sections (all 9 applicable; Snapshot Immutability Rule is N/A):
1. **Canonical URL Ownership** — `/sign-in`, `/sign-in/sent`, `/sign-in/verify`, magic-link routes (T3)
2. **Canonical Workflow Module** — `authWorkflow.*`
3. **Browser-Journey Owner** — `tests/e2e-browser/journeys/user/magic-link.spec.ts`
4. **Closure Evidence** — template scoped to T3; references T25
5. **AGENTS.md Acceptance Bar**
6. **Self-Action Protection** — no user can authenticate or be invited as themselves
7. **SSR-by-Default Rule**
8. **Snapshot Immutability Rule** — N/A
9. **No-Booking Scope**

### PRD #17 — Calendar Connections
Added 9 new sections (Snapshot Immutability Rule is N/A):
1. **Canonical URL Ownership** — `/me/calendar-connections`, OAuth callback and management routes (T8)
2. **Canonical Workflow Module** — `calendarConnectionWorkflow.*`
3. **Browser-Journey Owner** — `tests/e2e-browser/journeys/user/calendar-connection.spec.ts`
4. **Closure Evidence** — template scoped to T8; references T25
5. **AGENTS.md Acceptance Bar**
6. **Self-Action Protection** — users can only manage their own calendar connections
7. **SSR-by-Default Rule**
8. **Snapshot Immutability Rule** — N/A
9. **No-Booking Scope** — free/busy scopes only; no calendar event creation

### PRD #18 — Admin & Notifications
Added 9 new sections (Snapshot Immutability Rule is N/A):
1. **Canonical URL Ownership** — `/admin`, user management, topic curation, status routes (T16–T19)
2. **Canonical Workflow Module** — `adminUsersWorkflow`, `adminTopicsWorkflow`, `adminStatusWorkflow`
3. **Browser-Journey Owner** — `tests/e2e-browser/journeys/admin/*`
4. **Closure Evidence** — template scoped to T16–T19; references T25
5. **AGENTS.md Acceptance Bar**
6. **Self-Action Protection** — Admins cannot suspend/invite/role-change themselves
7. **SSR-by-Default Rule**
8. **Snapshot Immutability Rule** — N/A
9. **No-Booking Scope** — invite emails prompt sign-up; no calendar event creation

### PRD #19 — Profile & Setup
Added 9 new sections (Snapshot Immutability Rule is N/A):
1. **Canonical URL Ownership** — `/me/profile`, `/me/discoverability`, `/me/topics`, `/me/availability`, `/me/delete`, `/` (T4, T5, T6, T7, T9)
2. **Canonical Workflow Module** — `profileWorkflow`, `discoverabilityWorkflow`, `topicWorkflow`, `availabilityWorkflow`, `accountWorkflow`
3. **Browser-Journey Owner** — `tests/e2e-browser/journeys/user/*`
4. **Closure Evidence** — template scoped to T4, T5, T6, T7, T9; references T25
5. **AGENTS.md Acceptance Bar**
6. **Self-Action Protection** — users can only manage their own profile
7. **SSR-by-Default Rule**
8. **Snapshot Immutability Rule** — N/A
9. **No-Booking Scope**

## Verification

Each issue body was updated using `gh issue edit <number> --body-file <file>`. The edit was confirmed successful via the returned issue URL.
