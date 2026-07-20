# User Onboarding and Availability Journey Prototype

Prototype asset for [Prototype complete User onboarding and Availability journey](https://github.com/rafaelromao/slotmerge/issues/275) under [Wayfinder: Complete SlotMerge MVP web app implementation plan](https://github.com/rafaelromao/slotmerge/issues/271).

This artifact is a prototype, not a contract. It is grounded in the canonical architecture at `docs/research/canonical-next-page-api-architecture.md`, the role-aware shell prototype at `docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md`, the screen-coverage audit at `docs/research/mvp-web-screen-and-tracker-coverage.md`, the MVP prototype wireframe at `docs/prototypes/core-search-workflow.md`, and the locked decisions in `AGENTS.md`. The SlotMerge glossary in `CONTEXT.md` is authoritative for User, Organizer, Admin, Availability, Availability Window, Calendar Connection, Topic, Topic Proposal, Slot, Search, Search Result, Match, and Discoverability.

## 0. Decision summary

1. **Post-verify landing**: every successful magic-link verify lands on the setup checklist Home (`/`). One destination; one behavior; the checklist is universal.
2. **Magic-link error states**: three typed states (`link_expired`, `link_used`, `link_invalid`) with explicit, non-leaking copy. Each offers a "Request a new link" path to `/sign-in` with the email pre-filled and a Server Action that triggers the resend route.
3. **Setup checklist**: per-item cards with status, one-sentence explanation, and a `Continue` button to the canonical page. Pending Topic Proposal satisfies the Topics card; the card states so explicitly.
4. **Profile**: display name, email (read-only), timezone, buffer minutes, avatar URL, short bio. Single Save. Server validation.
5. **Discoverability**: static copy matching the prototype, one consent checkbox, Save. Saved state shows the consent timestamp and a Revoke action.
6. **Topics**: active Topic catalogue with checkboxes, single Save; "Propose a Topic" form below; "My Proposals" list with status badges (pending, active, rejected, retired). Similarity errors render inline next to the propose field.
7. **Availability**: weekly editor (seven days), one-off overrides list, global buffer (read-only link to /me/profile), and a plain-text "effective Availability" preview below the editor. Per-day save.
8. **Calendar Connection**: per-connection status pill, last-sync time, contributing-calendar checkboxes, Refresh, Disconnect. Two Connect CTAs (Google, Microsoft). Server-side 303 OAuth hand-off with three typed outcomes (connected, denied, unsupported).
9. **Sign Out**: no confirmation. Self-Delete: typed-confirm field on `/me/delete`. Both 303 to `/sign-in` after success.
10. **Validation rules**: server-side only. Same schemas as the locked workflow modules. Client components do not duplicate validation; they render server-returned `fieldErrors` inline.
11. **Calendar OAuth state**: same as the canonical architecture — sealed with the session secret, includes connection id, User id, provider, PKCE verifier, nonce, issued time, expiry. Completion verifies every field and is one-shot.
12. **Empty, error, and stale states**: every page lists the visible empty state, every form lists the inline error states, every list page shows a typed empty state with a primary action.

## 1. Why these decisions

The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:240-245` lists eight User-journey flows: invite-login, setup, maintain-availability, topic-proposal-lifecycle, account-lifecycle, and the (Organizer/Admin) search, history, and admin operations. The canonical architecture at `docs/research/canonical-next-page-api-architecture.md:5` commits to RSC pages with Server Actions, narrow `/api/v1` read JSON, and workflow modules with 1–3 entry points. The role-aware shell prototype at `docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md:1-3` commits to a single signed-in `(product)` layout.

The shape chosen here satisfies all three: the journeys use the shell, the workflow modules' typed `Result<T, E>` is the return shape for both the page and the Server Action, and the audit's "no API-only false completion" closure is honored because every step renders in the browser and is covered by a Playwright journey.

Alternatives rejected:

- A step-by-step setup wizard would have hidden the audit's required "the checklist accurately reflects current state after any update" behavior under navigation. Per-item cards with Continue buttons keep the checklist as the canonical source of truth.
- Auto-merging a User's active associations when an Admin approves a Topic Proposal contradicts `docs/mvp-spec.md:68-75` and the audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:180-199` (pending Topic Proposal satisfies setup Topics but does not match in Searches).
- Mirror-the-schema validation on the client and the server doubles the maintenance surface for the same correctness.
- A modal for the Discoverability consent inverts the audit's "no modals as first thought" note at `docs/research/mvp-web-screen-and-tracker-coverage.md` and the prohibition in the canonical architecture at `docs/research/canonical-next-page-api-architecture.md:5` against client-side modal chrome.

## 2. The journey map

The journey has nine sections, each numbered. Each step lists the route, the workflow entry point, the visible state, and the explicit error and empty states. The audit's eight-flow matrix at `docs/research/mvp-web-screen-and-tracker-coverage.md:236-245` is the source of truth; this map adds the additional flows required by `docs/mvp-spec.md:53-66` (setup and topic proposal lifecycle).

1. **Magic-link request and verify**
2. **Setup checklist Home**
3. **Profile**
4. **Discoverability consent**
5. **Topics and Topic Proposals**
6. **Availability**
7. **Calendar Connections**
8. **Maintenance and sign-out**
9. **Self-delete**

Steps 1–7 are the "first-time setup" journey. Step 8 covers ongoing maintenance and sign-out. Step 9 is the irreversible account-lifecycle action.

## 3. Section 1 — Magic-link request and verify

### 3.1 Happy path: Admin invites a User

1. Admin runs the Admin invite journey (issue #281). The User receives an email with `/sign-in/verify?token=…`.
2. User opens the link in a browser. `/sign-in/verify?token=…` GET handler calls `authWorkflow.verifyMagicLink({ token, requestContext })`.
3. On success the handler:
   - Inserts a `sessions` row with a fresh `csrfToken`.
   - Seals the session cookie via `sealSessionCookie({ sessionId })`.
   - 303 redirects to `/` (the setup checklist Home).
4. The Home page reads `setupHomeWorkflow.load(context)` and renders the checklist.

### 3.2 Verify error states

| State | URL query | Visible copy | Next action |
| --- | --- | --- | --- |
| `link_expired` | `?reason=link_expired` | "This link has expired. Request a new one to continue." | `Request a new link` → `/sign-in?email=…&resend=1` |
| `link_used` | `?reason=link_used` | "This link has already been used. Request a new one if you need to sign in again." | Same as above |
| `link_invalid` | `?reason=link_invalid` | "This link is not valid. Request a new one to continue." | Same as above |
| Success | (no query) | Redirect 303 to `/` | — |

The page never reveals whether the email was invited. The copy is identical for an uninvited email and a malformed token.

### 3.3 Re-sign-in for an existing User

1. Existing signed-out User with an accepted invite opens `/sign-in/verify?token=…`.
2. On success, 303 to `/` (the same Home). The checklist re-renders with the User's current state (Profile complete, Topics, Availability, Consent as they stand today).
3. The User sees a "Welcome back" toast (server-rendered, 1-second visible) above the checklist, then the checklist re-renders normally on the next request.

### 3.4 Magic-link request from `/sign-in`

1. `/sign-in` shows an email input, a single `Send magic link` button, and a one-line help text below the form ("We will email you a sign-in link. Calendar access is separate and is connected later.").
2. Submitting calls `authWorkflow.requestMagicLink({ email, requestContext })`.
3. On success, the page re-renders at `/sign-in/sent` with the email masked (`a***@example.com`) and copy: "If an account exists for that email, we just sent a sign-in link."
4. Rate-limited: re-render with `?reason=rate_limited` and copy: "Too many requests. Try again in a few minutes."
5. The page never reveals whether the email was invited.

## 4. Section 2 — Setup checklist Home

### 4.1 The page

`/` is rendered by `app/page.tsx`. The page calls `setupHomeWorkflow.load(context)` and renders `SetupChecklistView` with five cards.

| Card | Done when | Continue target | Card copy when incomplete |
| --- | --- | --- | --- |
| Profile | display name and timezone are set | `/me/profile` | "Set your display name and timezone so Organizers can address you correctly." |
| Discoverability consent | `discoverabilityConsents` row exists | `/me/discoverability` | "Choose whether Organizers can see you when your Topics and Availability match." |
| Topics | at least one active Topic or pending Topic Proposal | `/me/topics` | "Attach at least one Topic, or propose a new one. Pending Topic Proposals count toward setup." |
| Availability | at least one weekly Availability Window or one-off override, and profile timezone is set | `/me/availability` | "Define when you are available. Imported calendar conflicts subtract from these windows." |
| Calendar Connection (optional) | at least one connection | `/me/calendar-connections` | "Connect a calendar to import free/busy conflicts. Optional — you can connect later." |

A single statement under the title: "You will appear in Organizer Searches only after setup is complete." The wording matches the prototype at `docs/prototypes/core-search-workflow.md:50-55`.

### 4.2 Card states

- **Pending (Profile, Consent)**: red dot, "Continue" button. The card title is the only link; the body is one sentence.
- **Done (all required)**: green check, no "Continue" button, the card collapses to a one-line summary.
- **Optional (Calendar)**: muted, collapsed by default, shows "Connect (optional)" CTA.

### 4.3 Setup status pill in the top nav

The top nav renders a small `Setup` chip when the checklist is incomplete. Click navigates to `/`. When the checklist is complete, the chip is hidden. Sourced from `setupHomeWorkflow.loadSummary({ userId })`.

### 4.4 What the User sees when they navigate to a deep link with incomplete setup

If a User with an incomplete checklist types `/me/availability` in the URL bar, the page renders normally (the page is role-gated, not setup-gated). The top nav's Setup chip remains visible. There is no redirect-to-home on incomplete setup. This matches the audit's "the setup checklist accurately reflects current state" requirement at `docs/mvp-spec.md:381-385`.

## 5. Section 3 — Profile

### 5.1 The page

`/me/profile` shows the form below, one Server Action, inline validation.

| Field | Type | Required | Validation |
| --- | --- | --- | --- |
| Display name | text | Yes | 1–80 chars after trim |
| Email | read-only text | n/a | shown for clarity; cannot be changed in MVP |
| Timezone | IANA select | Yes | one of the IANA names returned by `Intl.supportedValuesOf('timeZone')` |
| Buffer minutes | number | No (default 0) | integer 0–60 |
| Avatar URL | text URL | No | must be an `https://` URL when provided |
| Short bio | textarea | No | max 280 chars |

The IANA select's default is the browser-detected timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) when no value is set; the User explicitly chooses. The "Save" button is a single Server Action; the page re-renders with the new state on success.

### 5.2 Field errors

| Error | Where it renders |
| --- | --- |
| `display_name_required` | inline under display name |
| `display_name_too_long` | same |
| `timezone_required` | inline under timezone |
| `timezone_invalid` | same |
| `buffer_out_of_range` | inline under buffer |
| `avatar_url_invalid` | inline under avatar URL |
| `bio_too_long` | inline under bio |

Errors render as small red text under the field. The form preserves the User's input. The page never loses the User's other settings.

### 5.3 Success state

A "Saved" indicator appears above the form for one render (server-rendered, no client state). On the next page load the indicator is gone.

## 6. Section 4 — Discoverability consent

### 6.1 The page

`/me/discoverability` shows two static copy blocks and one checkbox.

> When your Topics and Availability match an Organizer's Search, Organizers may see:
>
> - Display name
> - Avatar and short bio, if provided
> - Full Topic profile
> - Topic-filtered Availability in the Search window
>
> They will not see:
>
> - Raw calendar events
> - Calendar titles, attendees, locations, or descriptions
> - Email address before any future post-MVP booking flow

Below: one checkbox, "I agree to appear in matching Search Results", and a `Save` button.

### 6.2 Saved state

After Save, the page replaces the form with: "Consent granted on `<date>`." and a `Revoke` button. Revoke calls the same Server Action with `granted: false`. On Revoke the page returns to the form view with the checkbox unchecked.

### 6.3 Errors

| Error | Where it renders |
| --- | --- |
| `consent_required` | inline under the checkbox |
| `consent_already_granted` (re-clicking Save after a successful Save) | toaster-style banner above the form |
| `consent_already_revoked` (re-clicking Revoke) | same |

## 7. Section 5 — Topics and Topic Proposals

### 7.1 The page

`/me/topics` has three sections in order: active catalogue, propose form, "My Proposals".

```
My Topics
[Status pill: 3 active | 1 pending]

Active catalogue
☐ Product strategy
☐ AI engineering
☐ Design systems
☐ Sales enablement
[Save]

Propose a Topic
Candidate name: [________________________]
[Propose]

My Proposals
[pending] Community onboarding — submitted Jul 12, 2026
[active]  Local accessibility standards — activated Aug 4, 2026 by an Admin
[rejected] Vendor scorecards — Jul 19, 2026
[retired]  Design systems — retired Aug 22, 2026; still associated as historical
```

The active catalogue is the canonical list at `/topics` filtered to `status: "active"`, sorted alphabetically by name. The "Save" button is a single Server Action that atomically replaces the User's active associations.

### 7.2 Active catalogue rules

- If a Topic is checked, the User is associated with `status: "active"`.
- If a Topic is unchecked, the association is removed (or set to `historical` if it was previously active).
- Submitting an empty selection returns `validation_failed`; the page re-renders with a one-line banner: "Select at least one Topic or propose a new one." This is the only validation error for the catalogue.

### 7.3 Propose form

- One input: `Candidate name` (2–60 chars after trim).
- Submit calls `topicWorkflow.propose({ userId, candidateName })`.
- On success the page re-renders with the new pending row at the top of "My Proposals".
- On similarity match (the `topic_proposal_too_similar` error), the page re-renders with the input preserved and an inline error listing the matching Topic names: "This name is too similar to existing Topics: `<names>`. Pick a more specific name." The names are safe existing Topics only.

### 7.4 "My Proposals" status badges

| Status | Badge | Behavior |
| --- | --- | --- |
| `pending` | gray "Pending" | The Topic Proposal satisfies the setup Topics card but the User is not in any Search. |
| `active` | green "Active — added Aug 4" | Admin approved; the Topic is now in the catalogue but the User has not auto-associated it. The User must re-open the catalogue and check the new Topic. The page re-renders with the new Topic present. |
| `rejected` | red "Rejected — Jul 19" | Admin rejected. The User sees the rejection; there is no further action on this row. |
| `retired` | muted "Retired — Aug 22; historical" | Admin retired an active Topic the User was associated with. The association is historical; the User is no longer in new Searches that require this Topic. |

### 7.5 Empty state

- No active Topics in the catalogue yet (Admin has not curated any): the catalogue section shows the empty state with copy: "No active Topics yet. Propose a Topic and an Admin will review it." The propose form is the primary action.
- No active associations, no pending proposals: the page shows the same empty state with primary action `Browse the Topic catalogue` (anchors the catalogue section).

## 8. Section 6 — Availability

### 8.1 The page

`/me/availability` has five sections: timezone status, weekly editor, overrides, buffer, effective Availability preview.

### 8.2 Timezone status

If the profile timezone is not set, the page renders a banner: "Set your profile timezone before defining Availability." with a `Set timezone` button linking to `/me/profile`.

If the timezone is set, the page renders a one-line summary: "Profile timezone: `America/Sao_Paulo` (change in profile)".

### 8.3 Weekly editor

```
Weekly Availability Windows  (Timezone: America/Sao_Paulo)
Mon  [09:00 - 12:00] [14:00 - 17:00]  [Add window]
Tue  [09:00 - 12:00] [14:00 - 17:00]  [Add window]
Wed  [09:00 - 12:00]                  [Add window]
Thu  [09:00 - 12:00] [14:00 - 17:00]  [Add window]
Fri  [09:00 - 12:00]                  [Add window]
Sat  No windows                       [Add window]
Sun  No windows                       [Add window]
[Save Monday]  [Save Tuesday]  ...
```

- One `Save` per day (the prototype at `docs/prototypes/core-search-workflow.md:118-153` allows a single save, but per-day save is the safer seam and matches the locked `Availability Windows` repository).
- A window is `[start time] - [end time]` in 15-minute increments. `end > start`; windows on the same day do not overlap; a window must be inside `00:00–24:00`.
- `Add window` opens an inline form (one row above the day with two time pickers and `Add` / `Cancel`).
- `Remove` deletes the window.

### 8.4 Overrides

```
One-off overrides
[block] 2026-08-14 09:00–17:00 — Vacation  [Remove]
[add]   2026-08-20 18:00–20:00 — Special availability  [Remove]

[Add override]  (date [YYYY-MM-DD] [type: add/block] [start] [end] [reason optional])
```

- One form for `add` and `block`; the type selector chooses which.
- Block overrides subtract from the effective Availability; add overrides add to it.
- `Remove` deletes the override.

### 8.5 Buffer

One line: "Calendar conflict buffer: 15 minutes (change in profile)". A read-only summary of the buffer; the editable field is on `/me/profile`.

### 8.6 Effective Availability preview

Below the editor, a plain-text preview rendered server-side:

```
Effective Availability (next 7 days)
Mon 2026-07-13  09:00–12:00, 14:00–17:00
Tue 2026-07-14  09:00–12:00, 14:00–17:00
Wed 2026-07-15  09:00–12:00
...
```

The preview is the post-availability composition. The audit calls out that the User should see the post-composition result so they understand what Organizers will see. The preview reads from `computeEffectiveAvailability({ windows, overrides, busyIntervals: [] })` — the busy intervals are empty here because the user is composing Availability, not consuming imports. A note below the preview: "Calendar conflicts from connected calendars will subtract from these times."

### 8.7 Field errors

| Error | Where it renders |
| --- | --- |
| `end_before_start` | inline under the offending window |
| `overlap_existing_window` | same |
| `outside_day` | same |
| `invalid_time` | same |
| `date_required` (overrides) | inline under the date field |
| `end_before_start` (overrides) | inline under the time fields |
| `profile_timezone_required` (whole page) | banner above the editor |
| `invalid_buffer` | inline on the buffer summary, link to `/me/profile` |

## 9. Section 7 — Calendar Connections

### 9.1 The page

`/me/calendar-connections` has four sections: connect CTAs, list, per-connection detail, footer.

### 9.2 Connect CTAs

```
Connect a Calendar
[ Connect Google Calendar ]  [ Connect Microsoft Calendar ]
```

- Each button is a `<form action="/me/calendar-connections/connect/{google,microsoft}" method="post">` with a hidden `_csrf` field.
- The handler calls `calendarConnectionWorkflow.startOAuth({ userId, provider })` and 303-redirects to the provider's `authorizeUrl`.

### 9.3 Provider hand-off outcomes

After the provider redirects back to `/me/calendar-connections/callback`:

| Outcome | URL | Page shows |
| --- | --- | --- |
| `connected` | `?oauth=connected` | "Calendar connected" success state and the new connection in the list |
| `denied` | `?oauth=denied` | "Calendar not connected" with `Try again` linking to the connect CTAs |
| `unsupported` | `?oauth=unsupported` | "Microsoft personal accounts are not supported. Sign in with a work or school account." |
| `failed` | `?oauth=failed&requestId=…` | "Something went wrong. Try again. Reference: `<requestId>`." |

The `failed` state includes the request id for support but no implementation details. The page never logs the OAuth state, code, or provider internals in the URL.

### 9.4 List

```
Your Calendar Connections
[Google]   alex@example.com  connected, last sync 12 minutes ago
  Calendars used for conflicts
  ☑ Primary calendar
  ☐ Family calendar
  ☑ Work holds
  [Save calendars]  [Refresh]  [Disconnect]

[Microsoft]  alex@contoso.com  needs reconnect (token expired)
  [Reconnect]  [Disconnect]
```

- Per-connection: status pill, last sync time, contributing-calendar checkboxes, Refresh, Disconnect.
- `needs_reconnect` shows a warning pill and a single `Reconnect` action (which calls `startOAuth` for that connection).
- `Refresh` calls `POST /me/calendar-connections/{id}/refresh` and re-renders with the latest last sync time.
- `Disconnect` is a typed-confirm form (matches Self-Delete): the User types the connection's email address, then `Disconnect` is enabled.
- `Save calendars` is a per-connection Server Action that atomically replaces the contributing calendar ids.

### 9.5 Status pills and colors

| State | Pill | Color |
| --- | --- | --- |
| `connected` | "Connected" | `--success` |
| `sync_delayed` | "Sync delayed" | `--warning` |
| `needs_reconnect` | "Needs reconnect" | `--danger` |
| `unsupported` | "Personal account not supported" | `--text-subtle` |
| `failed` | "Last sync failed" | `--danger` |

The pills match the top-nav Calendar status badge.

### 9.6 Empty state

- No connections: the page shows the connect CTAs above a "No Calendar Connections yet" copy. Primary action is the two connect CTAs.
- One connection, no contributions selected: the connection appears with the primary calendar checked; the User can Save calendars to lock the choice.

### 9.7 OAuth hand-off state

`CalendarOAuthState` contains:

- `version: 1`
- `provider: "google" | "microsoft"`
- `connectionId: string`
- `sessionId: string`
- `csrfTokenHash: string`
- `codeVerifier: string` (PKCE)
- `issuedAt: string`
- `expiresAt: string`
- `returnTo: "/me/calendar-connections"`

Sealed with the session secret. One-shot: a successful callback invalidates the state. The page never reveals the state contents.

## 10. Section 8 — Maintenance and sign-out

### 10.1 Edit existing Availability

1. User goes to `/me/availability`. The page re-renders with the current state.
2. User changes a window, clicks `Save Monday`. The page re-renders with the new state and a "Saved" indicator.
3. The new effective Availability appears in the preview within the same render.

### 10.2 Add or remove Calendar Connection

1. User goes to `/me/calendar-connections`. The list reflects current connections.
2. `Connect Google Calendar` → 303 to provider → callback → page re-renders with the new connection.
3. `Disconnect` → typed-confirm (User types the email) → 303 to `/me/calendar-connections` with `?disconnected=1`. The page re-renders without the connection.

### 10.3 Sign Out

1. Avatar dropdown → `Sign Out`. The form posts to `/auth/session/delete` with the `_csrf` field.
2. The handler calls `authWorkflow.endSession({ sessionId })`, clears the session cookie, deletes the session row, and 303-redirects to `/sign-in`.
3. The page does not show a confirmation; sign-out is a single click.

### 10.4 Add or remove Topics

1. User goes to `/me/topics`. The page re-renders with the current state.
2. User checks or unchecks Topics, clicks `Save`. The page re-renders with the new state and a "Saved" indicator.
3. The new active associations are visible on the next visit.

### 10.5 Revoke Discoverability

1. User goes to `/me/discoverability`. The page shows the saved state with the timestamp.
2. User clicks `Revoke`. The page re-renders with the form view, checkbox unchecked, and a "Consent revoked on `<date>`" banner.
3. The User is no longer eligible for matching in new Searches.

## 11. Section 9 — Self-delete

### 11.1 The page

`/me/delete` shows:

- Title: "Delete your account"
- Body: "This removes your display name, profile, Topics, Availability, Discoverability, and Calendar Connections. You will not appear in Organizer Searches. Audit records that are not personal are kept. To delete, type `DELETE` below."
- One input: `Type DELETE to confirm`.
- One button: `Delete my account` (disabled until the input matches `DELETE` exactly).
- A `Cancel` link back to `/me`.

### 11.2 The action

Submitting calls `accountWorkflow.selfDelete({ userId })` via a Server Action. On success the handler:

- Deletes the User's profile, Topics, Topic Proposals, Discoverability, Availability, Calendar Connections (and tokens), sessions, and `emailEvents` row references that contain personal data.
- Preserves non-personal audit references (invite id, role change log, suspension log).
- Clears the session cookie and 303-redirects to `/sign-in?reason=deleted` with copy: "Your account has been deleted. The audit log retains your role and invite history."

### 11.3 Field errors

| Error | Where it renders |
| --- | --- |
| `confirm_required` | inline under the input |
| `confirm_mismatch` | same |

### 11.4 Recovery

A deleted User can be re-invited by an Admin. The User's email re-receives a magic-link invite with the role the Admin chooses. The User's prior audit references remain readable by the Admin; the User's profile data is fresh.

## 12. Closure criteria for ticket #275

When ticket #275 closes, the User journey prototype answers "yes" to every one of these:

- [ ] `/sign-in/verify?reason=link_expired` shows the explicit copy and the "Request a new link" path. Same for `link_used` and `link_invalid`.
- [ ] `/` renders the four required cards and one optional card with per-item Continue buttons and the "You will appear in Organizer Searches only after setup is complete" statement.
- [ ] `/me/profile` renders the six fields with server-side validation and inline errors.
- [ ] `/me/discoverability` renders the static copy, the checkbox, and the Revoke state.
- [ ] `/me/topics` renders the catalogue checkboxes, the propose form, and the "My Proposals" list with status badges (pending, active, rejected, retired).
- [ ] `/me/availability` renders the timezone status, weekly editor (per-day Save), overrides, buffer summary, and the plain-text effective Availability preview.
- [ ] `/me/calendar-connections` renders the connect CTAs, the per-connection list with status pill and per-connection Save, Refresh, Disconnect, and the typed-confirm Disconnect flow.
- [ ] Avatar dropdown's `Sign Out` posts to `/auth/session/delete` and 303s to `/sign-in`.
- [ ] `/me/delete` shows the typed-confirm flow and 303s to `/sign-in?reason=deleted`.
- [ ] The journey is covered by a Playwright journey that drives the full path: invite → verify → setup checklist → profile → consent → topics → availability → calendar connection → sign-out. Each step is its own journey block so failures point at the right screen.
- [ ] No screen is closed by a `renderToString` test or a direct-handler call. Every closure requires the Playwright journey to pass.

## 13. Pointers for the next tickets

- **#278 (Organizer Search journey):** consumes `searchWorkflow`; renders `/searches` and `/searches/{id}` and `/searches/history`. The User's onboarding journey is the precondition: the Search journey assumes the User has setup complete (or the page reads `searchEligibility.eligible` and shows a friendly "Finish setup to be matched" empty state).
- **#281 (Admin journey):** consumes `adminUsersWorkflow` and `adminTopicsWorkflow` and `adminStatusWorkflow`. The Admin invites a User; the User's onboarding journey begins from the Admin's invite. The Admin's decisions on Topic Proposals and Topic retirement are the lifecycle that surfaces on the User's `/me/topics` page.
- **#274 (browser acceptance gates):** the User journey is the first end-to-end Playwright journey to land. The install ticket wires Playwright Test, the D4/D5/D6 seams, the per-role `storageState` setup, and the `/` setup checklist journey. The User journey prototype is the template.
- **#279 (completion gates):** every User-journey screen's closure requires the Playwright journey. The Vitest component and `happy-dom` tests remain the lower-level seam but are not sufficient closure evidence.
- **#277 (repair spec):** update `docs/mvp-spec.md` Section 4.1 (Magic-link error states), Section 4.2 (Setup checklist Home), Section 4.3 (Discoverability), Section 4.4 (Topics), Section 4.5 (Availability), Section 4.6 (Calendar Connection), and Section 4.8 (Account lifecycle) to match this prototype. Explicitly state that pending Topic Proposal satisfies setup but does not match in Searches, and that the Discoverability page is the canonical consent surface.
