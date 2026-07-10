# SlotMerge

SlotMerge helps authenticated people find meeting times where enough people are available and share selected topics.

## Language

**User**:
An authenticated person who maintains a profile, calendar availability, and topic associations.
_Avoid_: Account, member

**Organizer**:
A user role that can run Searches and manage scheduling workflows; assigned by an Admin.
_Avoid_: Scheduler, host

**Admin**:
A user role that can curate Topics, invite users, assign roles, and suspend users.
_Avoid_: Superuser, owner

**Availability**:
The time ranges when a user can attend meetings, entered directly or imported from calendar integrations.
_Avoid_: Schedule, free time

**Availability Window**:
A user-authored recurring or one-off time range that expresses willingness to meet before Calendar Connection conflicts are subtracted.
_Avoid_: Working hours, open slot

**Calendar Connection**:
A user's linked external calendar provider account used to import free/busy conflicts into Availability.
_Avoid_: Calendar integration, calendar sync

**Topic**:
A controlled catalogue entry that represents a meeting subject users can associate with themselves and use during searches.
_Avoid_: Tag, category

**Topic Proposal**:
A user-submitted candidate Topic that can be associated with the proposing user but does not participate in Search until approved.
_Avoid_: Suggested tag, draft category

**Slot**:
A candidate time interval returned by a search because enough matching users are available then.
_Avoid_: Time, event

**Search**:
A request to find slots for a selected topic set and a minimum matching-user count.
_Avoid_: Query, lookup

**Search Result**:
A persisted snapshot of Slots and Matches produced by a Search at a point in time.
_Avoid_: Booking, invitation

**Match**:
An eligible user who has all selected active Topics and is available for the full requested Slot duration.
_Avoid_: Candidate, attendee

**Discoverability**:
The user's consented state of appearing in other users' searches when their topics and availability match.
_Avoid_: Visibility, public mode
