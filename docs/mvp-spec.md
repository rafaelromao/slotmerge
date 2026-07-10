# SlotMerge MVP Spec

Implementation-ready MVP spec for SlotMerge, composed from the Wayfinder planning map and its linked research/prototype artifacts.

Linked Wayfinder map: [Wayfinder: Topic-aware group availability MVP spec](https://github.com/rafaelromao/slotmerge/issues/1).

Linked artifacts:

- [Core Search Workflow Prototype](https://github.com/rafaelromao/slotmerge/blob/main/docs/prototypes/core-search-workflow.md)
- [Calendar Integration Constraints](https://github.com/rafaelromao/slotmerge/blob/main/docs/research/calendar-integration-constraints.md)
- [`CONTEXT.md`](https://github.com/rafaelromao/slotmerge/blob/main/CONTEXT.md) — glossary used by this spec.

## 1. Product Overview

SlotMerge helps authenticated people find meeting times where enough people are available and share selected topics.

The MVP product surface is a web app. Users maintain minimal profiles, connect or enter calendar availability, associate themselves with controlled topics, and (as Organizers/Admins) search for slots where at least the configured minimum number of matching Users are available.

The MVP stops at display-only persisted Search Results: there are no in-app invitations, no calendar event creation, no RSVP tracking, no booking reservation, no copy/share/export handoff aids, and no notification inbox.

## 2. Personas and Roles

Roles are User, Organizer, and Admin. Role is assigned by an Admin at invitation time and defaults to User.

Normal User:

- Owns profile, discoverability consent, Topic associations, manual Availability, and Calendar Connections.
- Cannot run Searches.

Organizer:

- All User capabilities.
- Can run Searches.
- Can review persisted Search Results and Search history.

Admin:

- All Organizer capabilities.
- Can invite users, choose role at invite time, grant or change roles, suspend users.
- Can curate Topics: approve/reject Topic Proposals, retire Topics.
- Can see operational status and receive critical operational email.

Setup completion requires display name, discoverability consent, at least one Topic or Topic Proposal, and at least one Availability source or manual Availability Window.

## 3. End-to-End Flows

### 3.1 Invite and Login

- Admin invites user by email with chosen role, defaulting to User.
- Invitation email contains a magic-link URL.
- User opens the magic link, authenticates, lands on the setup checklist.

### 3.2 Setup

- Profile: email (from invite) and display name; avatar and short bio optional.
- Discoverability consent.
- Topics: select from active catalogue or propose a new Topic.
- Availability: configure timezone, weekly Availability Windows, one-off overrides, and global buffer.
- Calendar Connection: optional, separate from login.

### 3.3 Maintain Availability

- User edits weekly windows, adds or blocks one-off overrides, and edits buffer.
- Edits apply immediately to future Searches.
- Calendar Connection auto-updates via webhook/change-notification plus reconciliation.
- If auto-sync fails, last imported data remains usable; status surfaces in app and may email the user if action is required.

### 3.4 Topic Proposal Lifecycle

- User proposes a Topic.
- Similar name blocking should prevent near-duplicate submissions.
- Admin approves or rejects.
- Approved Topics become active and eligible for Search.
- Pending Topic Proposals may be attached to the proposing user’s profile but do not match Search.
- Retired Topics preserve historical associations but are hidden from new profile selection and cannot be used in new Searches.

### 3.5 Organizer Search

- Organizer selects active Topics, minimum matching Users (default 2), meeting duration, date range (default current week + next 4 weeks), and timezone.
- Search runs synchronously, computes Slots on an hourly grid, and stores an immutable Search Result snapshot with parameters and generation timestamp.
- Results render in a weekly calendar view showing per-Slot match counts.
- Clicking a Slot opens a drawer listing matching Users with visible profile/topic/availability details and stale-data markers when relevant.
- Search Results never exclude a User because of stale imported data; stale data is surfaced in result details.

### 3.6 Search History

- Every Search generates an immutable Search Result snapshot.
- All Organizers (including the Searcher and others) can view Search history and snapshots.
- Re-running a Search creates a new snapshot.
- Snapshots do not live-update.

### 3.7 Admin Operations

- Admin invites users with role selection.
- Admin grants or changes roles.
- Admin suspends users.
- Admin curates Topic Proposals (approve/reject) and retires Topics.
- Admin monitors operational status (broad provider sync failures, transactional email delivery failures) and receives critical operational email.

### 3.8 Account Lifecycle

- Users self-delete accounts; personal profile data, availability, and calendar tokens are removed, and non-personal audit references are preserved.
- Admins can suspend users.
- Deletion disables discoverability by removing the user.

## 4. UI Screens

Wireframes live in [Core Search Workflow Prototype](https://github.com/rafaelromao/slotmerge/blob/main/docs/prototypes/core-search-workflow.md). Per-screen requirements below supplement those wireframes.

### 4.1 Invite and Magic Link

- Email-only login flow.
- Magic-link emails are mandatory transactional email.
- Calendar access is described as separate, free/busy-only.

### 4.2 Setup Checklist Home

- Lists setup progress: Profile, Discoverability consent, Topics, Availability, Calendar Connection (optional).
- Continues setup until all required items are complete.

### 4.3 Discoverability Consent

- Shows what Organizers see and what they do not see.
- Requires explicit consent before discoverability is active.

### 4.4 Topics

- Active Topics multiselect from controlled catalogue.
- Topic Proposal form with similarity blocking at submission.
- Pending Topic Proposals list.

### 4.5 Availability Windows

- Profile timezone selector.
- Weekly window editor per day-of-week.
- One-off add/block overrides.
- Global buffer setting applied before/after imported busy intervals.

### 4.6 Calendar Connection

- Connect/disconnect per supported provider.
- Selected calendars list, defaulting to provider primary calendar.
- Status (connected, sync delayed, needs reconnect, unsupported provider/account type).
- Reconnect and Disconnect actions.
- Failure banners and action-required email triggers.

### 4.7 Organizer Search Form

- Active Topics multiselect.
- All-selected matching rule (display only, not user-selectable).
- Minimum matching Users (default 2).
- Meeting duration selector.
- Date range display (current week + next 4 weeks; week navigation inside 90-day window).
- Timezone selector.
- Run Search action.

### 4.8 Weekly Search Result Calendar

- Week navigation inside the 90-day window.
- Hourly grid; per-cell match count or empty.
- Stale-data markers in cell counts.
- Click-count-to-open interaction.

### 4.9 Slot Details Drawer

- Slot time, match count, matched Topics.
- Per-match list with display name, matched/full Topic profile, topic-filtered Availability in the Search window, and Calendar Connection freshness.

### 4.10 Search History

- List of persisted Search Results with parameters and generation timestamps.
- All Organizers/Admins can view.

### 4.11 Admin Topic Curation

- Pending Topic Proposals queue.
- Active Topics list with retire action.
- Approve/reject/retire controls.

### 4.12 Admin Invites and Roles

- Invite form (email + role).
- Users table with role, status, change-role, suspend actions.

### 4.13 Admin Operational Status

- Provider sync health.
- Transactional email delivery health.
- No proactive user notifications; Admin sees status here.

## 5. Auth and Permissions Matrix

- All actions require an authenticated session.
- Email magic-link is the only authentication path.
- Calendar OAuth is separate from authentication and only used for Calendar Connections.
- Normal Users cannot run Searches and cannot view Search/Search history navigation.
- Organizers can run Searches and view Search history.
- Admins have all Organizer capabilities plus invite, role management, suspension, Topic curation, and operational status.
- Suspended users do not match Searches and cannot authenticate.
- Self-delete removes the user account and revokes calendar tokens.
- Admin role grants are the only path to Organizer or Admin.

## 6. Data Model

PostgreSQL is the primary database. Token material is encrypted at rest; non-sensitive status metadata is stored in plain columns.

### 6.1 Users and Profiles

- User: id, email, display name, optional avatar URL, optional short bio, role (User/Organizer/Admin), status (active/suspended), profile timezone, buffer duration, created/updated timestamps.
- Discoverability consent record (per user).
- Setup completion state derived from related records.

### 6.2 Invites and Auth

- Invite: id, email, role, status (pending/accepted/revoked), invited-by admin, expiration.
- Magic-link session: opaque token, expiration, used state.

### 6.3 Topics

- Topic: id, name, status (pending/active/retired), created/updated timestamps, retired-at timestamp.
- Topic Proposal: id, proposed-by user, candidate name, status (pending/approved/rejected), similarity-blocking decision log.
- User-Topic association: user, topic, association status (active/pending-retired/historical).
- Topic Proposal association: user, topic proposal, attached status.

### 6.4 Availability

- Availability Window: id, user, day-of-week, start time, end time, timezone (profile-level), effective date range if needed.
- One-off Availability Override: id, user, type (add/block), start datetime, end datetime, timezone.
- Availability edits carry created/updated timestamps.

### 6.5 Calendar Connections

- Calendar Connection: id, user, provider (Google/Microsoft work/school), account identifier, encrypted refresh token, encrypted access token, access token expiration, scopes, status, last successful sync timestamp, last error code/message, stale flag.
- Selected calendars: connection, provider calendar id, included flag.
- Imported busy interval: id, user, connection, provider calendar id, provider event reference (no metadata), status (busy/out-of-office/tentative), start datetime with timezone, end datetime with timezone, imported timestamp.

### 6.6 Searches and Results

- Search: id, organizer (User id), selected active Topic ids, minimum matching Users, meeting duration, date range start, date range end, organizer timezone, generated timestamp, snapshot reference.
- Search Result snapshot: immutable JSON containing weekly grid, per-Slot match counts, per-Slot Match details (display name, avatar URL, bio, full Topic profile, topic-filtered Availability indicators, Calendar Connection freshness flag), and stale markers.

### 6.7 Background Jobs

- Job: id, type (calendar sync/reconciliation/webhook/email/admin-critical), payload, status, attempts, scheduled timestamp, locked-until timestamp, last error.

### 6.8 Email Events

- Email event: id, recipient, type (invite/magic-link/calendar-action-required/admin-critical), payload reference, delivery status, delivery timestamp, error code/message.

## 7. API Surface

The MVP exposes a single full-stack web app API surface. Public endpoints are listed by area. Authentication is required on every endpoint except invite acceptance and magic-link verification.

### 7.1 Auth and Setup

- POST `/auth/magic-link/request`
- POST `/auth/magic-link/verify`
- GET `/me`
- PATCH `/me` (display name, avatar, bio, timezone, buffer)
- GET `/me/setup-status`
- POST `/me/discoverability-consent`
- DELETE `/me` (self-delete)

### 7.2 Topics

- GET `/topics` (active catalogue)
- POST `/topic-proposals` (user submits a proposal)
- GET `/me/topics`
- PUT `/me/topics` (active associations)
- GET `/me/topic-proposals`

### 7.3 Availability

- GET `/me/availability/windows`
- PUT `/me/availability/windows`
- GET `/me/availability/overrides`
- POST `/me/availability/overrides`
- DELETE `/me/availability/overrides/{id}`

### 7.4 Calendar Connections

- GET `/me/calendar-connections`
- POST `/me/calendar-connections/google/connect` (returns OAuth URL)
- POST `/me/calendar-connections/microsoft/connect`
- POST `/me/calendar-connections/{id}/callback`
- PATCH `/me/calendar-connections/{id}` (selected calendars, disconnect)
- POST `/me/calendar-connections/{id}/refresh` (manual refresh)

### 7.5 Searches

- POST `/searches` (Organizer/Admin)
- GET `/searches` (Organizer/Admin; shared history)
- GET `/searches/{id}`

### 7.6 Admin

- POST `/admin/invites` (Admin)
- GET `/admin/invites` (Admin)
- POST `/admin/users/{id}/role` (Admin)
- POST `/admin/users/{id}/suspend` (Admin)
- POST `/admin/users/{id}/reinstate` (Admin)
- GET `/admin/topic-proposals` (Admin)
- POST `/admin/topic-proposals/{id}/approve` (Admin)
- POST `/admin/topic-proposals/{id}/reject` (Admin)
- POST `/admin/topics/{id}/retire` (Admin)
- GET `/admin/status` (Admin)

### 7.7 Webhooks

- POST `/webhooks/google/calendar`
- POST `/webhooks/microsoft/calendar`

## 8. Provider Integration Boundaries

The MVP supports Google Calendar and Microsoft work/school calendars. Microsoft personal accounts are out of scope for the first Microsoft integration.

OAuth uses the auth code flow with PKCE for public clients. The app uses the narrowest practical scopes:

- Google: `calendar.freebusy` or `calendar.events.freebusy` for free/busy access; do not request broader scopes until `Define booking and invitation outcome` would later approve event creation.
- Microsoft: delegated `Calendars.ReadBasic`.

Stored data is free/busy-derived conflicts and provider calendar identifiers. Event titles, attendees, descriptions, locations, and bodies are not stored or shown.

### 8.1 Sync Behaviour

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
- Audit logging for invite, role change, suspension, self-delete, admin Topic decisions, and provider webhook events.

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

## 12. Acceptance Criteria

Acceptance criteria are written as testable rules per major area. Each rule is observable via UI or API and ideally backed by an automated test.

### 12.1 Auth

- An invited email can request a magic link and sign in only via that link before expiration.
- A magic-link cannot authenticate after use or expiration.
- A non-invited email cannot authenticate.
- Authentication never asks for or accepts a password.
- Self-delete removes the user’s profile, Availability, Calendar Connections, and discoverability; non-personal audit references are preserved.

### 12.2 Setup

- A user cannot become discoverable until display name, discoverability consent, at least one Topic or Topic Proposal, and at least one Availability source or manual Availability Window exist.
- Topic Proposal attachments for a user satisfy the “at least one Topic or Topic Proposal” setup requirement but do not make the user match Searches.
- The setup checklist accurately reflects current state after any update.

### 12.3 Calendar Connections

- A user can connect a Google Calendar and a Microsoft work/school calendar.
- A Microsoft personal account OAuth flow returns a clear unsupported-provider message.
- Connection status accurately reflects last successful sync, error state, and stale state.
- Imported busy intervals subtract from manual Availability Windows, respecting buffer.
- Selected calendars determine which calendar conflicts are used.
- Disconnect removes tokens and prevents further sync.
- Stale imported data does not exclude the user from Search and surfaces stale markers in Slot details.

### 12.4 Search

- Only Organizers and Admins can run Searches.
- A Search with one selected Topic matches users with that active Topic.
- A Search with multiple selected Topics matches only users with all selected active Topics.
- The searcher never appears in results and never counts toward the minimum matching Users.
- A User is only counted in a Slot if available for the full requested meeting duration from the Slot start.
- The default minimum matching Users is 2 and configurable per Search.
- The default date range is the current week plus next 4 weeks; navigation is weekly within a 90-day window.
- Slot start times align to an hourly grid.
- The weekly Search Result calendar shows per-Slot match counts and stale markers.
- Clicking a Slot opens a drawer listing matching Users and their visible profile/topic/availability details.

### 12.5 Search History

- Every successful Search creates an immutable Search Result snapshot.
- All Organizers and Admins can view Search history.
- Re-running a Search creates a new snapshot; saved snapshots do not change.
- Snapshots remain accurate even if user data, Topics, or Calendar Connections later change.

### 12.6 Admin

- Admin can invite a user with email and chosen role, defaulting to User.
- Admin can change a user’s role.
- Admin can suspend and reinstate a user.
- Suspended users cannot authenticate and cannot match Searches.
- Admin can approve or reject Topic Proposals.
- Admin can retire active Topics.
- Retired Topics preserve historical user associations but are not selectable for new associations or new Searches.

### 12.7 Privacy and Consent

- Discoverability consent is required before the user appears in matching Search Results.
- Discoverability can be disabled; subsequent Searches do not include the user.
- Search Results do not expose raw calendar events, calendar titles, attendees, locations, descriptions, or email addresses.

### 12.8 Notifications and Status

- Invitation and magic-link transactional emails send successfully for valid recipients.
- Action-required Calendar Connection failures send email to the affected user.
- Critical operational issues send email to Admins.
- No notification inbox exists.
- No notifications fire for matches, invitations, RSVPs, booking changes, reminders, or Topic Proposals.

### 12.9 Architecture and Operations

- Production runs as one full-stack web app plus a worker process with HTTPS endpoints.
- Calendar Connection OAuth tokens are encrypted at rest.
- Background jobs retry with backoff on transient failure.
- Webhook handlers validate provider signatures and update Connection state idempotently.

## 13. Unresolved Risks

- Google Calendar sensitive/restricted scope review may be required if scopes expand beyond the narrowest free/busy scopes.
- Microsoft Graph per-user subscription limits and per-mailbox subscription limits may constrain the sync model at scale; webhook and reconciliation design must tolerate these constraints.
- Auto-sync failures may produce silently stale imported data; user behaviour to reconnect is not guaranteed.
- Provider personal-account support remains unresolved; future demand may force a separate code path.
- Organizer-only Search may create trust friction between Organizers and Users; future UX adjustments may be needed.
- Background jobs and worker processes are not load-tested in MVP; production throughput assumptions need validation.