# SlotMerge MVP Spec

Implementation-ready MVP spec for SlotMerge, composed from the closed Wayfinder planning map ([Wayfinder: Topic-aware group availability MVP spec](https://github.com/rafaelromao/slotmerge/issues/1)) and the new complete-web-app planning map ([Wayfinder: Complete SlotMerge MVP web app implementation plan](https://github.com/rafaelromao/slotmerge/issues/271)).

Linked artifacts:

- [Core Search Workflow Prototype](https://github.com/rafaelromao/slotmerge/blob/main/docs/prototypes/core-search-workflow.md)
- [Role-aware App Shell and Screen Hierarchy Prototype](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md)
- [User Onboarding and Availability Journey Prototype](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/prototypes/user-onboarding-and-availability-journey.md)
- [Organizer Search and History Journey Prototype](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/prototypes/organizer-search-and-history-journey.md)
- [Admin Operations Journey Prototype](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/prototypes/admin-operations-journey.md)
- [Canonical Next.js Page and API Architecture](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/canonical-next-page-api-architecture.md)
- [MVP Web-Screen and Tracker Coverage Audit](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/mvp-web-screen-and-tracker-coverage.md)
- [Browser Acceptance and Mocked Demo Options](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/browser-acceptance-and-mocked-demo-options.md)
- [Implementation Ticket Graph](implementation-graph.md)
- [E2E Test Plan](e2e-plan.md) (companion document; the canonical E2E plan now lives here and at issue #62)
- [Calendar Integration Constraints](https://github.com/rafaelromao/slotmerge/blob/main/docs/research/calendar-integration-constraints.md)
- [`CONTEXT.md`](https://github.com/rafaelromao/slotmerge/blob/main/CONTEXT.md) — glossary used by this spec.

The binding implementation decisions are recorded in `AGENTS.md` under "Implementation decisions" and the "Browser Acceptance" and "Rendered-screen and browser-journey completion gates" subsections. The locked stack, persistence shape, and CI policy are authoritative. The SlotMerge glossary in `CONTEXT.md` is used exactly.

## 1. Product Overview

SlotMerge helps authenticated people find meeting times where enough people are available and share selected topics.

The MVP product surface is a single full-stack web app. Users maintain minimal profiles, connect or enter calendar availability, associate themselves with controlled topics, and (as Organizers/Admins) search for slots where at least the configured minimum number of matching Users are available. The MVP stops at display-only persisted Search Results: there are no in-app invitations, no calendar event creation, no RSVP tracking, no booking reservation, no copy/share/export handoff aids, and no notification inbox.

This spec is the canonical implementation-ready target. Per-screen acceptance is bound to the [Rendered-screen and browser-journey completion gates](https://github.com/rafaelromao/slotmerge/issues/279) recorded in `AGENTS.md`; a JSON handler, a direct-function test, or a `renderToString` test is not sufficient closure evidence for a rendered screen.

## 2. Personas and Roles

Roles are User, Organizer, and Admin. Role is assigned by an Admin at invitation time and defaults to User.

Normal User:

- Owns profile, discoverability consent, Topic associations, manual Availability, and Calendar Connections.
- Cannot run Searches.

Organizer:

- All User capabilities.
- Can run Searches.
- Can review persisted Search Results and Search history.
- Can re-run a Search (creates a new immutable Search Result; never edits an existing one).

Admin:

- All Organizer capabilities.
- Can invite Users, choose role at invite time, grant or change roles, suspend and reinstate Users.
- Can curate Topics: approve/reject Topic Proposals, retire Topics.
- Can see operational status and receive critical operational email.
- Cannot change their own role, cannot suspend themselves, cannot retire a Topic they proposed via a Topic Proposal, and cannot revoke their own session via the Admin nav. These self-action guards are enforced at the workflow module level.

Setup completion requires display name, discoverability consent, at least one Topic or pending Topic Proposal, and at least one Availability source or manual Availability Window. A pending Topic Proposal satisfies the Topics gate but the User is not in any Search until an active Topic is associated.

## 3. End-to-End Flows

### 3.1 Invite and Login

- Admin invites a User by email with a chosen role, defaulting to User.
- An invitation email is sent via the existing Email delivery service. The email contains a magic-link URL.
- The User opens the magic link, authenticates, and lands on the setup checklist Home (`/`).
- The `/sign-in/verify` page renders three typed error states with explicit, non-leaking copy: `link_expired`, `link_used`, `link_invalid`. Each error state offers a "Request a new link" path back to `/sign-in`.

### 3.2 Setup

- The setup checklist Home (`/`) is the canonical surface for first-time setup and re-visits by signed-out Users. It lists five cards: Profile, Discoverability consent, Topics, Availability, and Calendar Connection (optional).
- Profile: display name (required), email (read-only, from the invite), IANA timezone (required for Availability), buffer minutes (default 0, range 0–60), avatar URL (optional, https only), short bio (optional, 280 chars).
- Discoverability consent: a static copy block describing what Organizers may see and what they will not see, one consent checkbox, and a Save action. Revoke is a single-click action.
- Topics: active Topic catalogue checkboxes, a "Propose a Topic" form, and a "My Proposals" list with status badges (pending, active, rejected, retired). Similar-name blocking renders inline next to the propose field with the matching Topic names.
- Availability: profile timezone status, weekly editor (per-day Save), one-off add/block overrides, and the global buffer. The page shows the effective Availability in plain text below the editor.
- Calendar Connection: optional; connects Google Calendar or Microsoft work/school Calendar. Microsoft personal accounts are out of scope and surface a clear "not supported" message.

### 3.3 Maintain Availability

- The User edits weekly windows, adds or blocks one-off overrides, and edits the buffer.
- Edits apply immediately to future Searches.
- Calendar Connection auto-updates via provider webhooks plus scheduled reconciliation.
- If auto-sync fails, last imported data remains usable. The Calendar status badge in the top nav and the per-connection status pill surface the state. An action-required email may be sent to the User; the Admin never sends operational email from the UI.

### 3.4 Topic Proposal Lifecycle

- The User proposes a Topic from `/me/topics`. Similar-name blocking prevents near-duplicate submissions.
- The Admin approves or rejects from `/admin#topics`. Approve creates a new active Topic and sets the Topic Proposal to `approved` in one transaction. Reject sets the Topic Proposal to `rejected`. Both are single-click; both write an audit record.
- The Admin retires a Topic from `/admin#topics`. Retire is a typed-confirm inline form (the Admin types the Topic's name). Retired Topics are hidden from new associations and new Searches; historical associations remain; the proposing User cannot retire their own Topic.
- Pending Topic Proposals may be attached to the proposing User's profile but do not match in Searches until an active Topic is associated.

### 3.5 Organizer Search

- The Organizer (or Admin) selects active Topics, the minimum matching Users (default 2), meeting duration, date range (default current week + next four weeks), and timezone (default the Organizer's profile timezone). The all-selected matching rule is a non-editable line on the form.
- Search runs synchronously, computes Slots on an hourly grid, and stores an immutable Search Result snapshot with parameters and generation timestamp.
- The Search Result renders in a weekly calendar view showing per-Slot match counts and per-Slot stale-data markers. The Organizer who created the Search is never in the Match list.
- Week navigation uses ordinary `<a>` links to `/searches/{id}?week=YYYY-MM-DD`. The server reads the week and slices the immutable snapshot; no client state.
- Clicking a Slot opens the Slot Details drawer listing matching Users with visible profile, full Topic profile, topic-filtered Availability, and Calendar Connection freshness. The drawer footer is "No booking actions in MVP. No export/share actions in MVP."
- Search Results never exclude a User because of stale imported data; the cell count is the live count, and a stale marker shows inline.

### 3.6 Search History

- Every successful Search creates an immutable Search Result snapshot.
- All Organizers (including the Searcher and others) and all Admins can view Search history and snapshots.
- Re-running a Search creates a new immutable Search Result. The source snapshot stays open at `/searches/{oldId}`.
- Snapshots do not live-update.

### 3.7 Admin Operations

- The Admin invites Users with role selection from `/admin#users` (single form, success banner with masked email).
- The Admin changes a User's role (inline dropdown per row; current Admin's row is disabled).
- The Admin suspends a User (typed-confirm inline form) and reinstates (single-click). Suspend revokes active sessions; the matching pipeline excludes suspended Users; existing snapshots are immutable and unchanged.
- The Admin curates Topic Proposals (single-click Approve / Reject) and retires Topics (typed-confirm Retire). Self-action protection is enforced at the workflow module level.
- The Admin monitors operational status from `/admin#status` (read-only: generated timestamp, transactional Email health, Calendar Connection summary, Tokens-needing-refresh table). The page sends no email; critical operational email is a separate concern owned by the worker.

### 3.8 Account Lifecycle

- The User can self-delete from `/me/delete` (typed-confirm). Personal profile data, Availability, Discoverability, and Calendar Connections (and tokens) are removed; non-personal audit references are preserved.
- The Admin can suspend and reinstate Users.
- Deletion disables discoverability by removing the User.
- A deleted User can be re-invited by an Admin.

## 4. UI Screens

Wireframes live in [Core Search Workflow Prototype](https://github.com/rafaelromao/slotmerge/blob/main/docs/prototypes/core-search-workflow.md). The canonical page-and-action URL tree, role-aware shell, screen hierarchy, and responsive breakpoints are recorded in the [Role-aware App Shell and Screen Hierarchy Prototype](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md). Per-screen requirements below supplement those wireframes.

### 4.1 Invite and Magic Link

- The User opens `/sign-in` and submits an email. A magic-link email is sent via the existing Email delivery service. The page never reveals whether the email was invited.
- The magic-link landing page is `/sign-in/verify?token=…`. On success the user is redirected to `/` (the setup checklist Home). On failure the page renders one of three typed error states: `link_expired`, `link_used`, `link_invalid`. Each offers a "Request a new link" path back to `/sign-in`.
- Calendar access is described as separate, free/busy-only.

### 4.2 Setup Checklist Home

- `GET /` renders the setup checklist with five cards: Profile, Discoverability consent, Topics, Availability, and Calendar Connection (optional).
- Each card has a status pill, a one-sentence explanation, and a `Continue` button to the canonical page.
- A top-nav `Setup` chip is visible when the checklist is incomplete. Clicking it navigates to `/`.
- A one-line statement under the title reads: "You will appear in Organizer Searches only after setup is complete."
- Pending Topic Proposal satisfies the Topics card; the card says so explicitly. The proposing User must re-visit and select the new Topic after Admin approval.

### 4.3 Discoverability Consent

- `GET /me/discoverability` shows the static copy from the prototype (what Organizers may see / will not see), one consent checkbox, and a Save action.
- The saved state shows the consent timestamp and a Revoke action.
- The page is the canonical consent surface for the MVP.

### 4.4 Topics

- `GET /me/topics` lists the active Topic catalogue (sorted alphabetically) with checkboxes. A single `Save` Server Action atomically replaces the User's active associations.
- A "Propose a Topic" form below the list takes a candidate name and creates a pending Topic Proposal. Similarity errors render inline next to the propose field with the matching Topic names.
- A "My Proposals" section shows pending / active / rejected / retired rows with status badges.

### 4.5 Availability Windows

- `GET /me/availability` shows the profile timezone status, a weekly editor for the seven days, one-off overrides list, the global buffer (read-only link to `/me/profile`), and a plain-text "effective Availability" preview.
- The weekly editor saves per day. The overrides list saves per override. Both are Server Actions.
- Validation errors render inline per field. The form preserves the User's input on error.

### 4.6 Calendar Connection

- `GET /me/calendar-connections` shows the User's Calendar Connections with status pill, last-sync time, contributing-calendar checkbox list, Refresh, and Disconnect. Two connect CTAs (Google, Microsoft) initiate the OAuth hand-off via Server Action.
- The OAuth hand-off is server-side 303: the page navigates to the provider's `authorizeUrl`. The provider redirects back to `/me/calendar-connections/callback` (a collection route; the per-connection callback is an intentional exception to the spec's path shape).
- The callback renders one of three typed outcomes: `connected`, `denied`, `unsupported`. A `failed` outcome includes only the request id. The page never logs the OAuth state, code, or provider internals in the redirect URL.
- Status pills match the top-nav Calendar status badge colors: `connected` (success), `sync_delayed` (warning), `needs_reconnect` (danger), `unsupported` (muted), `failed` (danger).

### 4.7 Organizer Search Form

- `GET /searches` shows the Search form for Organizer and Admin.
- The form pre-fills defaults server-side per Organizer: current week (Monday 00:00 in the Organizer's IANA timezone) + next four weeks, duration 60 minutes, minimum 2 matching Users, the Organizer's profile timezone, and the active Topic catalogue pre-selected with none selected.
- The all-selected matching rule is a non-editable line below the checkboxes: "Users must have all selected active Topics." The rule is not user-selectable in MVP.
- A `Run Search` button submits to `POST /searches/run` (the Server Action entry point). On success the user is redirected to `/searches/{newId}`. On validation failure the form re-renders with `fieldErrors` inline.
- The empty state (no active Topics) shows the empty-state copy and a disabled `Run Search` button.

### 4.8 Weekly Search Result Calendar

- `GET /searches/{id}?week=YYYY-MM-DD` renders the immutable Search Result: header (selected Topics, minimum, duration, date range, Organizer timezone, generated timestamp, search ID), weekly grid (seven columns × hourly rows), and the Slot Details drawer.
- Week navigation uses ordinary `<a>` links. The server reads the week and slices the immutable snapshot; no client state.
- Each cell is a `<button>` with `data-testid="slot-{dayIdx}-{slotIdx}"`, an `aria-label` that includes the day, hour, Match count, and the stale marker (`contains stale calendar data` when relevant), and a `data-stale` attribute.
- Stale data is marked inline; the cell count is the live count. A one-sentence note below the grid explains the marker.

### 4.9 Slot Details Drawer

- The Slot Details drawer is the existing `SlotDetailsDrawer` client island. It opens on Slot click.
- The drawer shows: Slot time (Organizer timezone), Match count, matched Topics, and per-Match rows with display name, avatar, bio, full Topic profile, topic-filtered Availability, and Calendar Connection freshness.
- The drawer footer reads "No booking actions in MVP. No export/share actions in MVP."

### 4.10 Search History

- `GET /searches/history` lists every Search Result the Organizer can see, in `generatedAt` desc order.
- The list is shared by every Organizer and Admin.
- Each row shows the Organizer's display name, generated timestamp, selected Topics, minimum, duration, date range, Organizer timezone, and two actions: `Open snapshot` (link to `/searches/{id}?week=…`) and `Re-run` (Server Action).
- No filters. Pagination via `?before=<searchId>` Load more, 50 rows per page.
- The empty state (no Searches yet) shows the empty-state copy and a primary action to run a Search.

### 4.11 Admin Topic Curation

- `GET /admin#topics` is the second collapsible section of `/admin`. The Pending Topic Proposals list shows the proposed name, the proposing User, the proposal date, and two actions: `Approve` and `Reject`. Both are single-click; both write an audit record.
- The Active Topics list shows each active Topic with a `Retire` action. Retire is a typed-confirm inline form (the Admin types the Topic's name). Self-action protection: the Admin who proposed the Topic cannot retire it.

### 4.12 Admin Invites and Roles

- `GET /admin#users` is the first collapsible section of `/admin`. The Invite form (email + role) submits via Server Action. On success the page re-renders with a success banner showing the masked email.
- The Users table shows each non-self User with: display name, email, role dropdown, status, joined date, and per-row actions (`Suspend` / `Reinstate` / inline role change). The current Admin's row is disabled with a tooltip.
- Recent invites list shows the most recent 20 invites with status (`pending`, `accepted`, `revoked`, `expired`) and a `Resend` / `Re-invite` action per row.

### 4.13 Admin Operational Status

- `GET /admin#status` is the third collapsible section of `/admin`. The page is read-only. The status pill in the section header derives from the worst section.
- The page shows a generated timestamp, transactional Email health (last 24h: sent / failed / pending counts and failure rate), per-provider Calendar Connection summary (pending / connected / needs_reconnect / disconnected), and a Tokens-needing-refresh table (User, Provider, last refresh, Refresh, Disconnect).
- Status thresholds: Email failure rate < 5% green, 5–10% amber, > 10% red. Calendar connections in `needs_reconnect`: 0 green, 1 amber, > 1 red. Tokens needing refresh: empty green, 1–3 amber, > 3 red.
- Warning banners above bad sections. No `Refresh now` button. No `Send critical operational email` button.

## 5. Auth and Permissions Matrix

- All actions require an authenticated session.
- Email magic-link is the only authentication path.
- Calendar OAuth is separate from authentication and only used for Calendar Connections.
- Normal Users cannot run Searches and cannot view the Search / Search history navigation in the top bar.
- Organizers can run Searches and view Search history.
- Admins have all Organizer capabilities plus invite, role management, suspension, Topic curation, and operational status.
- Suspended Users do not match Searches and cannot authenticate.
- Self-delete removes the User account and revokes Calendar Connection tokens.
- Admin role grants are the only path to Organizer or Admin.
- Self-action protection at the workflow module level: every Admin Server Action rejects `actorId === targetUserId` (or `actorId === topic.proposedByUserId` for retire).
- Direct deep links to `/search/*` and `/admin/*` for plain Users still 404 at the page level (`requirePageContext` returns `notFound()` on role failure). The top-nav renders items by role; deep-link safety is the page gate's job.

## 6. Data Model

PostgreSQL is the primary database. Token material is encrypted at rest; non-sensitive status metadata is stored in plain columns. The MVP harness does not introduce a persistence-shape change.

### 6.1 Users and Profiles

- User: id, email, display name, optional avatar URL, optional short bio, role (User/Organizer/Admin), status (active/suspended), profile timezone, buffer duration, created/updated timestamps.
- Discoverability consent record (per User).
- Setup completion state derived from related records.

### 6.2 Invites and Auth

- Invite: id, email, role, status (pending/accepted/revoked/expired), invited-by Admin, expiration.
- Magic-link session: opaque token, expiration, used state.
- Session: id, User id, csrfToken, expiresAt, createdAt. The session is the only authoritative source for `csrfToken`; CSRF comparisons use `timingSafeEqual` and are centralized in one helper.

### 6.3 Topics

- Topic: id, name, status (pending/active/retired), created/updated timestamps, retired-at timestamp, proposedByUserId (set when the Topic was created via a Proposal).
- Topic Proposal: id, proposed-by User, candidate name, status (pending/approved/rejected), similarity-blocking decision log.
- User-Topic association: User, Topic, association status (active/pending-retired/historical).
- Pending Topic Proposal satisfies the setup "at least one Topic or Topic Proposal" gate but does not make the User eligible for matching in Searches.

### 6.4 Availability

- Availability Window: id, User, day-of-week, start time, end time, timezone (profile-level), effective date range if needed.
- One-off Availability Override: id, User, type (add/block), start datetime, end datetime, timezone.
- Availability edits carry created/updated timestamps.

### 6.5 Calendar Connections

- Calendar Connection: id, User, provider (Google/Microsoft work/school), account identifier, encrypted refresh token, encrypted access token, access token expiration, scopes, status, last successful sync timestamp, last error code/message, stale flag.
- Selected calendars: connection, provider calendar id, included flag.
- Imported busy interval: id, User, connection, provider calendar id, provider event reference (no metadata), status (busy/out-of-office/tentative), start datetime with timezone, end datetime with timezone, imported timestamp.

### 6.6 Searches and Results

- Search: id, organizer (User id), selected active Topic ids, minimum matching Users, meeting duration, date range start, date range end, organizer timezone, generated timestamp, snapshot reference.
- Search Result snapshot: immutable JSON containing weekly grid, per-Slot match counts, per-Slot Match details (display name, avatar URL, bio, full Topic profile, topic-filtered Availability indicators, Calendar Connection freshness flag), and stale markers. `SearchResultRepository` has no `update` method; immutability is enforced at the repository layer.

### 6.7 Background Jobs

- Job: id, type (calendar sync/reconciliation/webhook/email/admin-critical), payload, status, attempts, scheduled timestamp, locked-until timestamp, last error.

### 6.8 Email Events

- Email event: id, recipient, type (invite/magic-link/calendar-action-required/admin-critical), payload reference, delivery status, delivery timestamp, error code/message.

### 6.9 Audit

- Audit record: id, actor (User id), action enum (invite / role-change / suspend / reinstate / approve-proposal / reject-proposal / retire-topic / refresh-calendar / disconnect-calendar), target type, target id, metadata jsonb, createdAt. The audit table is non-personal. Self-delete preserves the audit references.

## 7. API Surface

The MVP exposes a single full-stack web app with Server Actions as the primary mutation seam and a narrow `/api/v1` namespace as the public read seam. External seams (OAuth callback, provider webhooks, sign-out, self-delete, magic-link request and resend) are route handlers because the callers are not the browser. Authentication is required on every endpoint except invite acceptance and magic-link verification.

The canonical page-and-action URL tree is recorded in the [Canonical Next.js Page and API Architecture](https://github.com/rafaelromao/slotmerge/blob/wayfinder/271-complete-mvp-web-app-plan/docs/research/canonical-next-page-api-architecture.md) research artifact. This section lists the surviving routes after the canonical migration; the legacy routes in the original spec (e.g. `POST /searches`, `GET /searches/{id}`, `PUT /me/availability/windows`) are replaced by Server Actions on the canonical RSC pages.

### 7.1 Auth, sign-in, sign-out

- `GET /sign-in` (RSC; email form).
- `GET /sign-in/sent` (RSC; "check your email" landing).
- `GET /sign-in/verify?token=…` (RSC; magic-link confirmation).
- `POST /auth/magic-link/request` (route handler; rate-limited email send).
- `POST /auth/magic-link/resend` (route handler; rate-limited resend).
- `GET /auth/magic-link/verify` (route handler; external email-driven confirm; redirects to `/` on success or renders one of three error states).
- `DELETE /auth/session` (route handler; sign-out).

### 7.2 User-owned state

- `GET /me` (RSC; profile + setup overview).
- `GET /me/profile` (RSC; profile form). Server Action: `updateProfileAction`.
- `GET /me/discoverability` (RSC; consent form). Server Action: `setDiscoverabilityAction`.
- `GET /me/topics` (RSC; catalogue + propose + my-proposals). Server Actions: `saveTopicSelectionAction`, `proposeTopicAction`.
- `GET /me/availability` (RSC; weekly editor + overrides + buffer + effective Availability preview). Server Actions: `addAvailabilityWindowAction`, `removeAvailabilityWindowAction`, `addAvailabilityOverrideAction`, `removeAvailabilityOverrideAction`.
- `GET /me/calendar-connections` (RSC; list + health). Server Actions: `setContributingCalendarsAction`, `refreshConnectionAction`, `disconnectConnectionAction`.
- `GET /me/delete` (RSC; confirm). Server Action: `selfDeleteAction`.

### 7.3 Calendar Connections (external seams)

- `POST /me/calendar-connections/connect/google` (route handler; OAuth start).
- `POST /me/calendar-connections/connect/microsoft` (route handler; OAuth start).
- `GET/POST /me/calendar-connections/callback` (route handler; OAuth completion; collection route, intentional exception to per-connection path).

### 7.4 Organizer Search

- `GET /searches` (RSC; Search form).
- `GET /searches/history` (RSC; shared history list).
- `GET /searches/{id}?week=YYYY-MM-DD` (RSC; immutable Search Result + Slot Details drawer).
- `POST /searches/run` (Server Action; create new Search + new Search Result, redirect to `/searches/{newId}`).
- `POST /searches/{id}/rerun` (Server Action; create new Search + new Search Result from the source Search, redirect to `/searches/{newId}`).
- `GET /api/v1/searches/{id}` (read-only adapter; future non-browser clients).
- `GET /api/v1/searches` (read-only adapter; shared history).
- `GET /api/v1/me/setup-status` (read-only adapter; setup checklist payload).

### 7.5 Admin

- `GET /admin` (RSC; three collapsible sections: Users, Topics, Status). `/admin/users`, `/admin/topics`, `/admin/status` redirect to `/admin#users|topics|status`.
- Server Actions on `/admin`: `inviteUserAction`, `changeRoleAction`, `suspendAction`, `reinstateAction`, `approveProposalAction`, `rejectProposalAction`, `retireTopicAction`, `refreshCalendarConnectionAction`, `disconnectCalendarConnectionAction`.

### 7.6 Webhooks (external seams)

- `POST /webhooks/google/calendar` (route handler; provider webhook).
- `GET /webhooks/microsoft/calendar` (route handler; validation challenge echo).
- `POST /webhooks/microsoft/calendar` (route handler; provider webhook).

### 7.7 Operational smoke endpoints (local/test only)

- `GET /api/local/health` (route handler; `APP_ENV in {local,test}` only).
- `POST /api/local/enqueue-smoke` (route handler; `APP_ENV in {local,test}` only).
- The Playwright install ticket may add a `GET /api/local/magic-link?email=…` endpoint (scoped to `APP_ENV in {local,test}` plus `LOCAL_TEST_HELPERS=true`) for the rendered magic-link journey.

### 7.8 Route consolidation and 308 redirects

| Old route | Canonical target | Status |
| --- | --- | --- |
| `GET /searches/{id}/results` | `GET /searches/{id}` | permanent 308 (preserved as alias) |
| `GET /admin/invites` | `GET /admin#users` | permanent 308 (alias) |
| `GET /admin/topic-proposals` | `GET /admin#topics` | permanent 308 (alias) |
| `GET /api/searches/{id}` | `GET /api/v1/searches/{id}` | permanent 308 (alias) |
| `GET /search/{id}/snapshot` | `GET /api/v1/searches/{id}` | permanent 308 (alias) |
| `GET /search/history` | `GET /api/v1/searches` | permanent 308 (alias) |
| `PUT /me/availability/windows` | `POST /me/availability-windows` (collection) + `PATCH /me/availability-windows/{id}` (item) | removed; pages handle mutations via Server Actions |
| `POST /me/calendar-connections/{id}/callback` | `POST /me/calendar-connections/callback` (collection) | intentional exception; spec/PRD declare it canonical |

Compatibility adapters for legacy JSON endpoints return the old shape plus `Deprecation`, `Sunset`, and `Link: <…>; rel="successor-version"` headers for one minor version before removal.

## 8. Provider Integration Boundaries

The MVP supports Google Calendar and Microsoft work/school calendars. Microsoft personal accounts are out of scope for the first Microsoft integration.

OAuth uses the auth code flow with PKCE for public clients. The app uses the narrowest practical scopes:

- Google: `calendar.freebusy` or `calendar.events.freebusy` for free/busy access.
- Microsoft: delegated `Calendars.ReadBasic`.

Stored data is free/busy-derived conflicts and provider calendar identifiers. Event titles, attendees, descriptions, locations, and bodies are not stored or shown.

### 8.1 OAuth state

The sealed `CalendarOAuthState` contains: `version: 1`, `provider`, `connectionId`, `sessionId`, `csrfTokenHash`, `codeVerifier` (PKCE), `issuedAt`, `expiresAt`, `returnTo`. The state is sealed with the session secret, expires quickly, and is one-shot. The callback verifies every field, the connection ownership, the provider match, the expiry, and the one-time pending state before exchanging the code.

The collection callback path is an intentional exception to the per-connection path. The provider console's redirect URI does not change.

### 8.2 Sync Behaviour

- Production uses provider webhooks/change-notifications plus periodic reconciliation.
- Local development may use polling/manual refresh because provider webhooks require reachable public HTTPS callback URLs.
- Quota handling uses exponential backoff, randomized traffic, and `Retry-After` semantics.
- Stale imported data continues to be used in Search; affected results carry stale-data markers.

## 9. Background Jobs

DB-backed job queue.

- Calendar sync/reconciliation per Calendar Connection.
- Provider webhook handlers.
- Transactional email delivery (invites, magic links).
- Action-required email delivery (Calendar Connection reconnect, persistent sync failure).
- Critical Admin operational email delivery.
- Scheduled reconciliation of import window (rolling 90 days).
- Scheduled cleanup of stale snapshot data beyond the rolling 90-day Availability window.

Job lifecycle: enqueue, lock, execute, success/failure, attempts, retry/backoff, error metadata.

## 10. Operational Requirements

- HTTPS endpoint for the web app.
- HTTPS webhook endpoints for Google and Microsoft calendar providers with valid certificates.
- Worker process running DB-backed background jobs.
- Scheduler for reconciliation and rolling window cleanup.
- Outbound transactional email capability with delivery tracking.
- Encrypted storage for Calendar Connection OAuth tokens.
- Audit logging for invite, role change, suspension, self-delete, admin Topic decisions, and provider webhook events. The audit record is non-personal and survives User self-delete.
- Real-browser acceptance: Playwright Test harness with the locked D4/D5/D6 seams (mock Email outbox / transport capture, server-side application-clock injection, local/test provider-mock HTTP sidecar). Browser tests run on `workflow_dispatch` only; PR CI runs Vitest only.
- The locked single global clock at the app boundary is shared across the web, the worker, the Graphile Worker tick, and the Playwright browser context via `page.clock.install`.

## 11. Non-Goals

- Native mobile apps.
- Booking workflow, including in-app invitations, RSVP tracking, calendar event creation, reservation, and copy/share/export handoff aids.
- Notification inbox or per-category notification preferences.
- Match, invitation, RSVP, booking-change, reminder, or Topic Proposal notifications.
- Real-time/websocket updates.
- External search/index infrastructure.
- Microservices for auth, calendar sync, matching, notifications, or admin.
- Microsoft personal accounts.
- Calendar write scopes/event creation.
- Native/in-app scheduling handoff aids.
- Generic auth bypass endpoint. (Playwright uses direct DB session seeding via `sealSessionCookie`, not a request-time bypass endpoint.)

## 12. Acceptance Criteria

Acceptance criteria are written as testable rules per major area. Each rule is observable via the running web app (RSC + Server Action) and requires the [Rendered-screen and browser-journey completion gates](https://github.com/rafaelromao/slotmerge/issues/279) recorded in `AGENTS.md`: a Playwright happy-path spec, a Playwright failure-path spec, a Vitest unit test, a component test, a visual capture run, and a Closure Evidence section in the ticket body that the PR comment reproduces verbatim. A JSON handler or a direct-function test is not sufficient closure evidence for a rendered screen.

### 12.1 Auth

- An invited email can request a magic link and sign in only via that link before expiration.
- A magic-link cannot authenticate after use or expiration.
- A non-invited email cannot authenticate.
- Authentication never asks for or accepts a password.
- Self-delete removes the User's profile, Availability, Calendar Connections, and discoverability; non-personal audit references are preserved.

### 12.2 Setup

- A User cannot become discoverable until display name, discoverability consent, at least one Topic or pending Topic Proposal, and at least one Availability source or manual Availability Window exist.
- A pending Topic Proposal satisfies the "at least one Topic or Topic Proposal" setup requirement but does not make the User match in Searches.
- The setup checklist accurately reflects current state after any update.

### 12.3 Calendar Connections

- A User can connect a Google Calendar and a Microsoft work/school calendar.
- A Microsoft personal account OAuth flow returns a clear "not supported" message.
- Connection status accurately reflects last successful sync, error state, and stale state.
- Imported busy intervals subtract from manual Availability Windows, respecting the buffer.
- Selected calendars determine which calendar conflicts are used.
- Disconnect removes tokens and prevents further sync.
- Stale imported data does not exclude the User from Search and surfaces stale markers in Slot details.

### 12.4 Search

- Only Organizers and Admins can run Searches.
- A Search with one selected Topic matches Users with that active Topic.
- A Search with multiple selected Topics matches only Users with all selected active Topics.
- The searcher never appears in results and never counts toward the minimum matching Users.
- A User is only counted in a Slot if available for the full requested meeting duration from the Slot start.
- The default minimum matching Users is 2 and configurable per Search.
- The default date range is the current week plus next 4 weeks; navigation is weekly within a 90-day window.
- Slot start times align to an hourly grid.
- The weekly Search Result calendar shows per-Slot match counts and stale markers.
- Clicking a Slot opens a drawer listing matching Users and their visible profile / Topic / availability details.

### 12.5 Search History

- Every successful Search creates an immutable Search Result snapshot.
- All Organizers and Admins can view Search history.
- Re-running a Search creates a new snapshot; saved snapshots do not change.
- Snapshots remain accurate even if User data, Topics, or Calendar Connections later change.
- The shared list is chronological; the Organizer who created a Search can rerun it from the Search Result or from the history list.

### 12.6 Admin

- Admin can invite a User with email and chosen role, defaulting to User.
- Admin can change a User's role.
- Admin can suspend and reinstate a User.
- Suspended Users cannot authenticate and cannot match in Searches.
- Admin can approve or reject Topic Proposals.
- Admin can retire active Topics.
- Retired Topics preserve historical User associations but are not selectable for new associations or new Searches.
- Admin cannot change their own role, cannot suspend themselves, cannot retire a Topic they proposed via a Topic Proposal, and cannot revoke their own session via the Admin nav. These self-action guards are enforced at the workflow module level.
- Every Admin action writes an audit record atomically with the operation. The audit record is non-personal.

### 12.7 Privacy and Consent

- Discoverability consent is required before the User appears in matching Search Results.
- Discoverability can be disabled; subsequent Searches do not include the User.
- Search Results do not expose raw calendar events, calendar titles, attendees, locations, descriptions, or email addresses.

### 12.8 Notifications and Status

- Invitation and magic-link transactional emails send successfully for valid recipients.
- Action-required Calendar Connection failures send email to the affected User.
- Critical operational issues send email to Admins.
- No notification inbox exists.
- No notifications fire for matches, invitations, RSVPs, booking changes, reminders, or Topic Proposals.
- The Admin Operational Status surface is read-only; it does not send email or trigger work.

### 12.9 Architecture and Operations

- Production runs as one full-stack web app plus a worker process with HTTPS endpoints.
- Calendar Connection OAuth tokens are encrypted at rest.
- Background jobs retry with backoff on transient failure.
- Webhook handlers validate provider signatures and update Connection state idempotently.
- Every screen is rendered in HTML on the first paint; no client-side data fetching for primary screen data.
- The browser acceptance harness runs Playwright Test against the running web app and the locked D4/D5/D6 seams. PR CI runs Vitest only; the locked "E2E tests are not executed in CI" decision is preserved.
- Every screen-level implementation ticket closes only with the full closure-evidence set recorded in `AGENTS.md` under the "Rendered-screen and browser-journey completion gates" subsection.

## 13. Unresolved Risks

- Google Calendar sensitive/restricted scope review may be required if scopes expand beyond the narrowest free/busy scopes.
- Microsoft Graph per-user subscription limits and per-mailbox subscription limits may constrain the sync model at scale; webhook and reconciliation design must tolerate these constraints.
- Auto-sync failures may produce silently stale imported data; User behaviour to reconnect is not guaranteed.
- Provider personal-account support remains unresolved; future demand may force a separate code path.
- Organizer-only Search may create trust friction between Organizers and Users; future UX adjustments may be needed.
- Background jobs and worker processes are not load-tested in MVP; production throughput assumptions need validation.
- The "Closed by sandman — issue already completed" auto-closure comment is not a substitute for the closure-evidence set; the Sandman PR review is the binding review mechanism but does not replace the closure-evidence set.
