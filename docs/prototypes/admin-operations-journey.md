# Admin Operations Journey Prototype

Prototype asset for [Prototype complete Admin operations journey](https://github.com/rafaelromao/slotmerge/issues/281) under [Wayfinder: Complete SlotMerge MVP web app implementation plan](https://github.com/rafaelromao/slotmerge/issues/271).

This artifact is a prototype, not a contract. It is grounded in the canonical architecture at `docs/research/canonical-next-page-api-architecture.md`, the role-aware shell prototype at `docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md`, the User onboarding journey at `docs/prototypes/user-onboarding-and-availability-journey.md`, the Organizer Search journey at `docs/prototypes/organizer-search-and-history-journey.md`, the screen-coverage audit at `docs/research/mvp-web-screen-and-tracker-coverage.md`, the MVP prototype wireframe at `docs/prototypes/core-search-workflow.md`, and the locked decisions in `AGENTS.md`. The SlotMerge glossary in `CONTEXT.md` is authoritative for User, Organizer, Admin, Availability, Availability Window, Calendar Connection, Topic, Topic Proposal, Slot, Search, Search Result, Match, and Discoverability.

## 0. Decision summary

1. **Page shape**: one `/admin` page with three collapsible sections (Users, Topics, Status). The Admin lands on `/admin` and sees Users expanded; Topics and Status collapse by default. `/admin/users`, `/admin/topics`, `/admin/status` redirect to `/admin#users|topics|status`.
2. **Admin nav**: one top-nav `Admin` item with a dropdown of the three sub-surfaces. Clicking lands on `/admin` (the default-expanded Users section). Deep links use `/admin#users|topics|status`.
3. **Invite flow**: a single invite form (email + role). On success the page re-renders with a banner showing the masked email and copy: "We just sent a sign-in link. The User's setup checklist will guide them." Re-invite is the same form; the existing invite is revoked and a new one is created.
4. **Role change**: inline dropdown per User row, plus a `Save` button per row. The current Admin's row is disabled with a tooltip: "You cannot change your own role." Re-renders after a successful Save.
5. **Suspend / reinstate**: Suspend is a typed-confirm inline form (Admin types the User's email to enable the button). Reinstate is a single-click action. Suspending revokes the User's active sessions; the matching pipeline excludes suspended Users; existing snapshots are immutable and unchanged.
6. **Topic Proposal decisions**: single-click `Approve` and `Reject`. Approve creates a new active Topic and sets the Topic Proposal to `approved` in one transaction. Reject sets the Topic Proposal to `rejected`.
7. **Topic retirement**: typed-confirm inline form (Admin types the Topic's name to enable the button). Retired Topics are hidden from new associations and new Searches; historical associations remain; the User's `/me/topics` catalogue updates on next visit.
8. **Status sub-surface**: read-only. Generated timestamp, 24h transactional Email health (sent / failed / pending counts), per-provider Calendar Connection summary (pending / connected / needs-reconnect / disconnected), and a "Tokens needing refresh" table. Read-only alert banners above bad sections. No actions; no email sent from the page.
9. **Self-action protection**: the current Admin cannot change their own role, cannot suspend themselves, cannot retire a Topic they created, and cannot revoke their own session via the Admin nav. The inline controls are disabled with tooltips.
10. **Empty and error states**: every list has an empty state with copy and a primary action. Errors render inline at the row that caused them, never as a page-level error banner.
11. **Audit preservation**: every Admin action writes an audit record atomically with the operation. The audit table is non-personal (it stores the actor, the target, the action, the timestamp, and the relevant non-PII values). Self-delete preserves the audit references.
12. **No notification inbox, no critical operational email from the UI, no booking, no RSVP, no calendar event creation**. Critical operational email is a separate concern owned by the worker (`docs/mvp-spec.md:185-189`).

## 1. Why these decisions

The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:240-245` lists the Admin journey's three flows: Admin Operations (invites, role, status, Topic decisions), and the Admin's portion of Topic Proposal Lifecycle. The canonical architecture at `docs/research/canonical-next-page-api-architecture.md:6` commits to absorbing `/admin/invites` and `/admin/topic-proposals` into `/admin/users` and `/admin/topics`. The role-aware shell prototype at `docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md:10` lists three Admin sub-surfaces (Users, Topics, Status) and binds the Admin nav to one top-nav item.

The shape chosen here satisfies all three: one Admin page with three collapsible sections, each section routed from a top-nav dropdown, each action a Server Action that re-renders the same page after PRG 303.

Alternatives rejected:

- Separate pages for each sub-surface (`/admin/users`, `/admin/topics`, `/admin/status`) would have given each section its own URL but would have multiplied the test surface and the page gate. The Admin is the only role that uses all three; collapse-when-inactive is the right density.
- A typed-confirm for Approve/Reject would have slowed down the most common Admin action. Approve is transactional; the cost of a misclick is the Admin's time, not the User's data. The audit references are preserved either way.
- Refresh-now buttons on Status would have implied a synchronous reconciliation path; the worker already reconciles on its scheduler tick (`docs/local-stack.md:14-23`).
- Allowing the Admin to suspend themselves would create a recovery problem the spec does not address.

## 2. The journey map

The Admin journey has six sections, each numbered. Each step lists the route, the workflow entry point, the visible state, and the explicit error and empty states.

1. **Invites and Users**
2. **Role change**
3. **Suspend and reinstate**
4. **Topic Proposal decisions**
5. **Topic retirement**
6. **Operational status**

Sections 1–3 share the Users section. Sections 4–5 share the Topics section. Section 6 is the Status section.

## 3. Section 1 — Invites and Users

### 3.1 The page

`/admin` is rendered by `app/(product)/admin/page.tsx`. The page calls `adminUsersWorkflow.load()` and `adminTopicsWorkflow.load()` and `adminStatusWorkflow.load()` in parallel, then renders three collapsible sections. The Users section is open by default; the others collapse to a one-line summary.

```
Admin  (You are signed in as Mariana P.)

▾ Users                                  (5 active, 1 suspended)
Invite a User
[Email          ] [Role: User ▾]  [Send invite]

Recent invites
2026-07-12  alex@example.com      User       sent   [Resend]
2026-07-12  rafa@example.com     Organizer  accepted  —
2026-07-10  ops@example.com      User       revoked   —

Users
Display name         Email                    Role        Status     Joined       Actions
Mariana P.           mariana@example.com       Admin       active     2026-07-01   —
Bea Silva            bea@example.com          User        active     2026-07-02   [Role: User ▾] [Suspend]
Carla Mendes         carla@example.com        Organizer   active     2026-07-04   [Role: Organizer ▾] [Suspend]
Diego Rocha          diego@example.com        User        active     2026-07-08   [Role: User ▾] [Suspend]
Erika Patel          erika@example.com        User        active     2026-07-10   [Role: User ▾] [Suspend]
Frank Lee            frank@example.com        User        suspended  2026-07-11   [Reinstate]
```

The current Admin's row is rendered with the role and status controls disabled.

### 3.2 Invite form

```
Invite a User
[Email          ] [Role: User ▾]  [Send invite]
```

- Email: 1–254 chars; must be a valid email; the `Email` is unique per active User (the Server Action checks for an existing active User with the same email and returns `email_already_invited` if so).
- Role: User (default), Organizer, Admin. Choosing Admin sends a warning tooltip: "This will give the new User full Admin capabilities. Only invite a User you trust."
- The Server Action calls `adminUsersWorkflow.inviteUser({ actorId, email, role })`.
- The page re-renders with a success banner: "We just sent a sign-in link to `a***@example.com`. The User's setup checklist will guide them."

### 3.3 Recent invites

The Recent invites list shows the most recent 20 invites with: sent date, masked email, role, status (`pending`, `accepted`, `revoked`, `expired`), and an action button.

| Status | Action | Meaning |
| --- | --- | --- |
| `pending` | `Resend` | Admin can resend; the original invite is revoked and a new one is created. |
| `accepted` | — | The User has signed in. No action. |
| `revoked` | `Re-invite` | The Admin explicitly revoked or resent. The Admin can re-invite with a new email. |
| `expired` | `Re-invite` | The magic link expired (15-minute default). The Admin can re-invite. |

### 3.4 Field errors

| Error | Where it renders |
| --- | --- |
| `email_required` | inline under the email field |
| `email_invalid` | same |
| `email_already_invited` | same, with copy: "An active invite or User exists for this email." |
| `rate_limited` (magic-link resend) | banner above the form: "Too many invites. Try again in a few minutes." |
| `email_send_failed` | banner above the form: "We could not send the email. Try again; if it keeps failing, the Status page will tell you more." |

### 3.5 Empty state

No Users yet: the page shows the empty state with copy: "No Users yet. Invite your first User to get started." Primary action: the invite form's `Send invite` button.

No invites: the Recent invites list is hidden; only the form and the Users table (empty) are shown.

## 4. Section 2 — Role change

### 4.1 The action

Each User row has an inline `<form action="/admin/users/{id}/role" method="post">` with a `role` dropdown and a `Save` button. The Server Action calls `adminUsersWorkflow.setUser({ actorId, targetUserId, role })`.

The action is atomic: the role change and the audit record are written in the same transaction. The action returns a `Result<UserRecord, AdminError>`:

| `AdminError` | Visible state |
| --- | --- |
| `user_not_found` | row disappears from the table on next render |
| `self_role_change` | banner above the Users table: "You cannot change your own role." |
| `role_invalid` | inline under the dropdown |
| `internal_error` | page-level error boundary: "Something went wrong. Try again." |

### 4.2 The current Admin's row

The current Admin's row shows the role dropdown disabled with a tooltip: "You cannot change your own role." The tooltip also says: "Another Admin can change your role." The form does not submit even if the dropdown value is changed via dev tools; the Server Action rejects `actorId === targetUserId` with `self_role_change`.

### 4.3 Success state

The page re-renders with a one-render "Saved" indicator above the row, then the indicator disappears on the next render.

## 5. Section 3 — Suspend and reinstate

### 5.1 The Suspend action

Each non-self User row has a `Suspend` button next to the role dropdown. The button opens an inline typed-confirm form:

```
Suspend bea@example.com?
This revokes the User's active sessions. The User will not appear in Organizer Searches.
[Type the email: bea@example.com]   [Cancel]  [Suspend]
```

The button is disabled until the input matches the email. The Server Action calls `adminUsersWorkflow.setUser({ actorId, targetUserId, status: 'suspended' })`. The action is atomic: the status change, the session-revocation, and the audit record are written in the same transaction.

### 5.2 The Reinstate action

The Suspended Users section (or a `Show suspended` toggle) shows each suspended User with a single `Reinstate` button. The button is a one-click inline form. The Server Action calls `adminUsersWorkflow.setUser({ actorId, targetUserId, status: 'active' })`. The User's next sign-in is a fresh magic-link invite; the existing invite, if any, is not reused.

### 5.3 Self-action protection

The current Admin's row does not have a `Suspend` button at all. The tooltip on the disabled role dropdown explains: "You cannot change your own role or suspend yourself."

### 5.4 Field errors

| Error | Visible state |
| --- | --- |
| `confirm_required` | inline under the email input |
| `confirm_mismatch` | same |
| `self_suspend` | banner above the Users table: "You cannot suspend yourself." (Server-side check; should not be reachable through the UI.) |
| `user_already_suspended` | inline: "This User is already suspended." |
| `user_already_active` | inline on Reinstate: "This User is already active." |

### 5.5 Search impact

A suspended User is excluded from new Searches starting the next request. Existing Search Result snapshots are immutable and unchanged — the audit's "honest staleness" rule means the Organizer may see the suspended User in an old snapshot. The Slot Details drawer for a snapshot from before suspension still includes the User; the Organizer can interpret the stale data through the search-impact note on the Search Result page.

## 6. Section 4 — Topic Proposal decisions

### 6.1 The page

`/admin#topics` is the second collapsible section. The section is open by default after the Admin clicks the `Topics` sub-nav item, but the Admin can collapse it. When collapsed, the section header shows the count of pending Topic Proposals: "Topics (3 pending, 27 active)".

```
▾ Topics                                  (3 pending, 27 active)
Pending Topic Proposals
[pending]  Community onboarding
           Proposed by Alex R. on 2026-07-10
           [Approve]  [Reject]

[pending]  Vendor scorecards
           Proposed by Diego R. on 2026-07-08
           [Approve]  [Reject]

[pending]  Local accessibility standards
           Proposed by Bea S. on 2026-07-04
           [Approve]  [Reject]

Active Topics
Display name              Status     Proposed by   Approved on   Actions
Product strategy          active     —             2026-01-01    [Retire]
AI engineering            active     —             2026-01-01    [Retire]
Design systems            active     —             2026-01-01    [Retire]
Sales enablement          active     —             2026-01-01    [Retire]
…
```

### 6.2 Approve

`Approve` is a single-click inline form. The Server Action calls `adminTopicsWorkflow.decideProposal({ actorId, proposalId, status: 'approved' })`. The action is atomic: a new active Topic is created, the Topic Proposal is set to `approved`, and the audit record is written in the same transaction. The proposing User's `/me/topics` page re-renders on next visit with the new Topic in the catalogue (status badge `active`; the proposing User must re-visit and select the new Topic — see the User journey prototype at `docs/prototypes/user-onboarding-and-availability-journey.md:7.4`).

### 6.3 Reject

`Reject` is a single-click inline form. The Server Action calls `adminTopicsWorkflow.decideProposal({ actorId, proposalId, status: 'rejected' })`. The Topic Proposal is set to `rejected`. The proposing User's `/me/topics` page re-renders with the row in the `rejected` badge state.

### 6.4 Field errors

| Error | Visible state |
| --- | --- |
| `proposal_not_found` | row disappears on next render |
| `proposal_already_decided` | inline: "This proposal has already been decided." |
| `duplicate_topic_name` (the Approve action detects a collision) | banner above the section: "An active Topic with that name already exists." |

The Admin can also `Reject` a Proposal that is a near-duplicate of an existing Topic, in which case the proposing User sees the same similarity error they would have seen at submit time.

### 6.5 Empty state

No pending Topic Proposals: the Pending section is hidden; only the Active Topics list is shown.

## 7. Section 5 — Topic retirement

### 7.1 The action

Each active Topic row has a `Retire` button. The button opens an inline typed-confirm form:

```
Retire "Product strategy"?
Active associations on existing Users will become historical. The Topic will not appear in new associations or new Searches.
[Type the Topic name: Product strategy]   [Cancel]  [Retire]
```

The button is disabled until the input matches the Topic name (case-insensitive). The Server Action calls `adminTopicsWorkflow.retireTopic({ actorId, topicId })`. The action is atomic: the Topic is set to `retired`, the active associations are set to `historical`, and the audit record is written in the same transaction.

### 7.2 Self-action protection

If the Topic was created by a Topic Proposal (i.e. the Topic has a `proposedByUserId`), the Admin who is the original proposer cannot retire it. The button is disabled with a tooltip: "You proposed this Topic. Another Admin must retire it." The Server Action rejects `actorId === topic.proposedByUserId` with `cannot_retire_own_proposal`.

### 7.3 Search impact

A retired Topic is hidden from new associations and new Searches starting the next request. Existing Search Result snapshots are immutable; the Organizer can see the retired Topic in old snapshots. The Search Result page for a snapshot from before retirement still includes Matches with the Topic in their full Topic profile.

### 7.4 Field errors

| Error | Visible state |
| --- | --- |
| `confirm_required` | inline under the input |
| `confirm_mismatch` | same |
| `topic_not_active` | row disappears on next render |
| `cannot_retire_own_proposal` | banner: "You cannot retire a Topic you proposed." |
| `internal_error` | page-level error boundary |

## 8. Section 6 — Operational status

### 8.1 The page

`/admin#status` is the third collapsible section. The section is open by default after the Admin clicks the `Status` sub-nav item, but the Admin can collapse it. When collapsed, the section header shows a status pill derived from the worst section:

- "Operational" — Email and Calendar both green.
- "Degraded" — one or both amber.
- "Outage" — one or both red.

```
▸ Status                                  Operational

Status
Generated 2026-07-13 09:00 (America/Sao_Paulo)

Transactional Email (last 24h)
Sent     128      [progress bar]
Failed   2        [progress bar]
Pending  0        [progress bar]
Failure rate: 1.5% (target < 5%)

Calendar Connections
Google
  pending       0
  connected     12
  needs_reconnect   1
  disconnected  0

Microsoft work/school
  pending       0
  connected     8
  needs_reconnect   0
  disconnected  0

Tokens needing refresh (within 7 days)
User                     Provider        last refresh    actions
bea@example.com          Google          2026-07-12      [Refresh]  [Disconnect]
```

The page is read-only. There is no `Refresh now` button and no `Send critical operational email` button.

### 8.2 Status thresholds

- Email failure rate (last 24h): < 5% green, 5–10% amber, > 10% red. A red section adds the warning banner above the section.
- Calendar connections in `needs_reconnect`: 0 green, 1 amber, > 1 red. A red section adds the warning banner.
- Tokens needing refresh: empty list is green, 1–3 amber, > 3 red.

### 8.3 Warning banners

A warning banner above a section has copy:

- "Email delivery is degraded. The latest `emailEvent` rows in the DB are the source of truth; a re-run is automatic on the next retry window." (for the Email section)
- "One or more Calendar connections need reconnect. Visit /me/calendar-connections on the affected User''s account to reconnect." (for the Calendar section; no PII is shown in the Admin view)

The page does not name the affected User unless the Admin clicks a per-row action.

### 8.4 Per-row actions

Each Tokens-needing-refresh row has two actions: `Refresh` (calls `POST /me/calendar-connections/{id}/refresh` on the User's account via the same Server Action) and `Disconnect` (calls the disconnect Server Action with a typed confirm). The Admin acts on the User's behalf; the audit record includes the Admin's `actorId`.

### 8.5 Empty state

All sections green: the page shows no warning banners. The Tokens-needing-refresh table is empty.

## 9. Self-action protection

The current Admin cannot:

- Change their own role (role dropdown is disabled with tooltip).
- Suspend themselves (no `Suspend` button; the disabled role dropdown tooltip explains).
- Retire a Topic they proposed via a Topic Proposal (`Retire` button is disabled with tooltip).
- Revoke their own session via the Admin nav (the avatar dropdown's `Sign Out` is the only path).

Each protection is enforced at the workflow module level, not just at the UI, so a direct call to the Server Action with `actorId === targetUserId` returns the typed error.

## 10. Audit and tracker ownership

Every Admin action writes an audit record. The audit record is non-personal:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | uuid | primary key |
| `actorId` | string | the Admin's id |
| `action` | enum | `invite`, `role-change`, `suspend`, `reinstate`, `approve-proposal`, `reject-proposal`, `retire-topic`, `refresh-calendar`, `disconnect-calendar` |
| `targetType` | enum | `user`, `topic`, `topic-proposal`, `calendar-connection` |
| `targetId` | string | the target's id (not the User's email or display name) |
| `metadata` | jsonb | role transitions, status transitions, Topic name, etc. (no PII) |
| `createdAt` | timestamp | the action time |

The audit table is preserved on User self-delete (`docs/mvp-spec.md:101-104`). It is not exposed in the MVP Admin UI (a future audit-view ticket can add a filtered table).

## 11. Field errors summary

| Error | Where it renders |
| --- | --- |
| `email_required` | inline under the email field |
| `email_invalid` | same |
| `email_already_invited` | same |
| `rate_limited` | banner above the invite form |
| `email_send_failed` | same |
| `role_invalid` | inline under the role dropdown |
| `self_role_change` | banner above the Users table |
| `confirm_required` | inline under the typed-confirm input |
| `confirm_mismatch` | same |
| `self_suspend` | banner above the Users table |
| `user_already_suspended` | inline under the suspend form |
| `user_already_active` | inline on Reinstate |
| `proposal_not_found` | row disappears on next render |
| `proposal_already_decided` | inline next to Approve / Reject |
| `duplicate_topic_name` | banner above the Topics section |
| `topic_not_active` | row disappears on next render |
| `cannot_retire_own_proposal` | inline next to Retire |
| `user_not_found` | row disappears on next render |
| `internal_error` | page-level error boundary (per-segment `error.tsx`) |

## 12. The five-section journey closure list

| Section | Closure evidence |
| --- | --- |
| 1 — Invites and Users | Playwright journey: signed-in Admin → /admin → Users expanded → type email + choose role → Send invite → page re-renders with masked-email banner → Recent invites row appears. Failure paths: email_already_invited → inline; rate_limited → banner. |
| 2 — Role change | Playwright journey: signed-in Admin → /admin → Users → change a non-self User''s role to Organizer → Save → page re-renders with "Saved" indicator → next request shows the new role. Failure: change own role → controls disabled. |
| 3 — Suspend and reinstate | Playwright journey: signed-in Admin → /admin → Users → Suspend on a non-self User → type email → Suspend enabled → click → page re-renders, User moves to the suspended section. Reinstate → single click → page re-renders. |
| 4 — Topic Proposal decisions | Playwright journey: signed-in Admin → /admin#topics → Approve a pending Proposal → page re-renders, Topic moves to Active list. Reject → page re-renders, Proposal disappears from Pending. |
| 5 — Topic retirement | Playwright journey: signed-in Admin → /admin#topics → Retire on an active Topic → type Topic name → Retire enabled → click → page re-renders, Topic disappears from Active list. |
| 6 — Operational status | Playwright journey: signed-in Admin → /admin#status → page renders generated timestamp + Email health + Calendar summary + Tokens table. No actions. |

Each closure requires the Playwright journey to pass. The Vitest component tests on Admin pages are the lower-level seam, not the closure evidence.

## 13. Closure criteria for ticket #281

When ticket #281 closes, the Admin journey prototype answers "yes" to every one of these:

- [ ] `/admin` renders three collapsible sections; Users is open by default; Topics and Status are collapsed.
- [ ] `/admin/users`, `/admin/topics`, `/admin/status` redirect to `/admin#users|topics|status`.
- [ ] The Admin nav is one top-nav item with a dropdown of the three sub-surfaces.
- [ ] Invite: single form, success banner with masked email, atomic invite creation + email send.
- [ ] Role change: inline dropdown per row; self-role-change disabled with tooltip; atomic role change + audit record.
- [ ] Suspend: typed-confirm inline form; self-suspend disabled; atomic status change + session revocation + audit record.
- [ ] Reinstate: single-click inline form; atomic status change + audit record.
- [ ] Topic Proposal Approve: single-click; atomic Topic creation + Proposal status change + audit record.
- [ ] Topic Proposal Reject: single-click; atomic Proposal status change + audit record.
- [ ] Topic Retire: typed-confirm; own-proposal retire disabled; atomic Topic status change + active-association to historical + audit record.
- [ ] Status: read-only generated timestamp + Email health + Calendar summary + Tokens table; warning banners above bad sections; no `Refresh now` or `Send critical email` actions.
- [ ] Self-action protection at the workflow module level: every Admin action rejects `actorId === targetUserId` (or `actorId === topic.proposedByUserId` for retire).
- [ ] Audit record atomic with every Admin action; non-personal metadata; preserved on User self-delete.
- [ ] The journey is covered by a Playwright journey that drives: invite → role change → suspend → reinstate → approve proposal → reject proposal → retire topic → status page, with each step a distinct block so failures point at the right surface.

## 14. Pointers for the next tickets

- **#274 (browser acceptance gates):** the Admin journey is the third end-to-end Playwright journey. The install ticket wires Playwright Test + D4/D5/D6 seams + per-role `storageState`; the User journey is the first; the Organizer journey is the second; the Admin journey is the third.
- **#279 (completion gates):** every Admin-related ticket's closure requires a Playwright journey block. The Vitest component tests on Admin pages remain the lower-level seam but are not sufficient closure evidence.
- **#277 (repair spec):** update `docs/mvp-spec.md` Section 4.11 (Admin Topic Curation), Section 4.12 (Admin Invites and Roles), and Section 4.13 (Admin Operational Status) to match this prototype. Explicitly state that the Admin nav is one top-nav item, the three sub-surfaces are collapsible on `/admin`, the Status sub-surface is read-only, and self-action protection is enforced at the workflow module level.
