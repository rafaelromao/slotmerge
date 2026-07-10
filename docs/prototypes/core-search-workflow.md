# Core Search Workflow Prototype

Throwaway low-fidelity prototype for [Prototype core search workflow](https://github.com/rafaelromao/slotmerge/issues/10).

This prototype answers: what rough web UX best supports the MVP flow from invite/login through setup, availability/topics, Organizer Search, weekly Slot review, and persisted Search Results?

## UX Direction

Use a role-aware web app with one primary shell:

- `Home`: setup status and next action.
- `My availability`: profile, discoverability, Topics, Availability Windows, Calendar Connections.
- `Search`: Organizer/Admin-only Search creation and weekly Search Result view.
- `Search history`: persisted immutable Search Result snapshots visible to all Organizers/Admins.
- `Admin`: Admin-only invites, role grants, Topic curation, operational status.

Normal Users never see Search navigation. Organizers see Search and Search history. Admins see all Organizer surfaces plus Admin.

## Screen 1: Invite And Magic Link

```
SlotMerge

You've been invited to SlotMerge

Email: alex@example.com
Role: User

[Send magic link]

Small print: SlotMerge uses email login. Calendar access is connected later and only imports free/busy conflicts.
```

Notes:

- Invitation email starts the flow.
- Magic-link login is the only authentication path in the MVP.
- Calendar OAuth is not part of login.

## Screen 2: Setup Checklist Home

```
SlotMerge                                      Alex R.

Setup checklist

[done] Profile: Alex R. / alex@example.com
[todo] Discoverability consent
[todo] Topics
[todo] Availability
[optional] Calendar Connection

You will appear in Organizer searches only after setup is complete.

[Continue setup]
```

Notes:

- Setup completion is explicit.
- Pending Topic Proposals can satisfy setup, but the user will not match Search until an active Topic is associated.
- Calendar Connection is valuable but manual Availability is always enough to participate.

## Screen 3: Discoverability Consent

```
Discoverability

When your Topics and Availability match an Organizer's Search, Organizers may see:

- Display name
- Avatar and short bio, if provided
- Full Topic profile
- Topic-filtered Availability in the Search window

They will not see:

- Raw calendar events
- Calendar titles, attendees, locations, or descriptions
- Email address before any future post-MVP booking flow

[ ] I agree to appear in matching Search Results

[Save]
```

Notes:

- This is the privacy boundary from the map.
- Consent can later be disabled from `My availability`.

## Screen 4: Topics

```
My Topics

Active Topics
[x] Product strategy
[x] AI engineering
[ ] Design systems
[ ] Sales enablement

Can't find a Topic?
[Propose a Topic]

Pending proposals attached to your profile
- Community onboarding      pending review

[Save]
```

Notes:

- Only active Topics participate in Search.
- Topic Proposals can appear on the user's profile/setup but do not match until approved.
- No Topic Proposal notifications; state is checked here.

## Screen 5: Availability Windows

```
My Availability

Timezone: America/Sao_Paulo  [Change]

Weekly Availability Windows

Mon  [09:00 - 12:00] [14:00 - 17:00]
Tue  [09:00 - 12:00] [14:00 - 17:00]
Wed  [09:00 - 12:00]
Thu  [09:00 - 12:00] [14:00 - 17:00]
Fri  [09:00 - 12:00]

[Add weekly window]

One-off overrides

- Block: 2026-08-14 09:00-17:00 Vacation
- Add:   2026-08-20 18:00-20:00 Special availability

[Add override]

Calendar conflict buffer
[ 15 minutes ] before and after imported busy events

[Save]
```

Notes:

- Weekly windows express willingness to meet.
- Overrides add or block date-specific time.
- Imported busy/OOO/tentative conflicts subtract from these windows.
- Timezone is profile-level, not per window.

## Screen 6: Calendar Connection

```
Calendar Connection

Connected provider: Google Calendar
Status: Connected, last synced 22 minutes ago
Data used: free/busy only

Calendars used for conflicts
[x] Primary calendar
[ ] Family calendar
[x] Work holds

[Reconnect]
[Disconnect]

Contextual warning state:
Status: Needs reconnect
Your calendar token expired. Search Results may use stale imported conflicts until reconnected.
[Reconnect Google Calendar]
```

Notes:

- Users select contributing calendars, defaulting to primary.
- Stale imported data remains usable, but is marked.
- Action-required failures may also send email.

## Screen 7: Organizer Search Form

Only Organizers/Admins can access this screen.

```
Search

Topics
[x] Product strategy
[x] AI engineering

Matching rule
Users must have all selected active Topics

Minimum matching Users
[ 2 ]

Meeting duration
[ 60 minutes v ]

Date range
Current week + next 4 weeks

Timezone
America/Sao_Paulo

[Run Search]
```

Notes:

- Searcher is excluded from results and does not count.
- Minimum defaults to 2 but is configurable.
- Start times align to hourly grid.

## Screen 8: Weekly Search Result Calendar

```
Search Result: Product strategy + AI engineering
Generated: 2026-07-10 15:42 BRT
Range: Current week + next 4 weeks
Minimum: 2 matching Users

[< Previous week]  Jul 13 - Jul 19, 2026  [Next week >]

       Mon       Tue       Wed       Thu       Fri
09:00  [3]       [2]       [-]       [4]       [2*]
10:00  [2]       [-]       [3]       [3]       [-]
11:00  [-]       [2*]      [2]       [-]       [5]
12:00  [-]       [-]       [-]       [-]       [-]
13:00  [4]       [3]       [2]       [2]       [3]

* includes stale calendar data

Click a count to open Slot details.
```

Notes:

- Dense calendar view leads with match counts.
- Stale data is visible but does not exclude the Slot.
- Empty cells are below threshold or unavailable.

## Screen 9: Slot Details Drawer

```
Thu Jul 16, 2026, 09:00-10:00 BRT
4 matching Users

Matched Topics: Product strategy, AI engineering

Participants

1. Bea Silva
   Topics: Product strategy, AI engineering, Growth
   Availability: topic-filtered available in this Search window
   Calendar: fresh, synced 18 minutes ago

2. Carla Mendes
   Topics: Product strategy, AI engineering
   Availability: topic-filtered available in this Search window
   Calendar: stale, last sync 3 days ago

3. Diego Rocha
   Topics: Product strategy, AI engineering, Design systems
   Availability: manual only

4. Fernanda Lima
   Topics: Product strategy, AI engineering
   Availability: topic-filtered available in this Search window
   Calendar: fresh, synced 9 minutes ago

No booking actions in MVP.
No export/share actions in MVP.
```

Notes:

- Shows identities and profile/topic context only after clicking a Slot.
- No booking, invitation, RSVP, reserve, export, or calendar-write action exists.

## Screen 10: Search History

```
Search history

Visible to all Organizers and Admins

Product strategy + AI engineering
Generated by Mariana, 2026-07-10 15:42
Minimum 2, duration 60 minutes, current + next 4 weeks
[Open snapshot]

Design systems
Generated by Rafael, 2026-07-09 10:13
Minimum 3, duration 90 minutes, current + next 4 weeks
[Open snapshot]
```

Notes:

- Search Results are immutable snapshots.
- Re-running creates a new Search Result.
- All Organizers can inspect shared Search history.

## Screen 11: Admin Topic Curation

```
Admin / Topics

Pending Topic Proposals

Community onboarding
Proposed by Alex R.
Similar existing Topics: Customer onboarding, Community building

[Approve] [Reject]

Active Topics
Product strategy       [Retire]
AI engineering         [Retire]
Design systems         [Retire]
```

Notes:

- Admin UI is required because users can propose Topics.
- Similar name blocking should happen before proposal, but Admin still sees close matches.
- No notifications; users check proposal state in `My Topics`.

## Screen 12: Admin Invites And Roles

```
Admin / Users

[Invite user]

Email: [ alex@example.com ]
Role:  [ User v ]

[Send invite]

Users
Alex R.      User       active      [Change role] [Suspend]
Mariana P.   Organizer  active      [Change role] [Suspend]
Rafael R.    Admin      active      [Change role] [Suspend]
```

Notes:

- Invite-only registration.
- Admin chooses role at invite time, defaulting to User.
- Organizer role is required for Search access.

## Validated UX Shape

The workflow should be specified as:

- Setup-first onboarding with an explicit checklist.
- Role-aware navigation that hides Search from normal Users.
- `My availability` as the home for profile readiness, Topics, Availability Windows, Calendar Connections, consent, and contextual status.
- Organizer Search as a form followed by a weekly calendar result view.
- Slot details as a click-open drawer listing Matches and stale-calendar markers.
- Search history as shared immutable snapshots for all Organizers/Admins.
- Admin surfaces for invites/roles, Topic curation, and critical operational status.

## Non-Goals Confirmed By Prototype

- No booking flow.
- No invitations.
- No RSVP tracking.
- No calendar event creation.
- No notification center.
- No copy/share/export handoff aids.
- No native mobile app-specific workflow.
