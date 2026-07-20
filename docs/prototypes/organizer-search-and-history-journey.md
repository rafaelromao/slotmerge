# Organizer Search and History Journey Prototype

Prototype asset for [Prototype complete Organizer Search and history journey](https://github.com/rafaelromao/slotmerge/issues/278) under [Wayfinder: Complete SlotMerge MVP web app implementation plan](https://github.com/rafaelromao/slotmerge/issues/271).

This artifact is a prototype, not a contract. It is grounded in the canonical architecture at `docs/research/canonical-next-page-api-architecture.md`, the role-aware shell prototype at `docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md`, the User onboarding journey at `docs/prototypes/user-onboarding-and-availability-journey.md`, the screen-coverage audit at `docs/research/mvp-web-screen-and-tracker-coverage.md`, the MVP prototype wireframe at `docs/prototypes/core-search-workflow.md`, and the locked decisions in `AGENTS.md`. The SlotMerge glossary in `CONTEXT.md` is authoritative for User, Organizer, Admin, Availability, Availability Window, Calendar Connection, Topic, Topic Proposal, Slot, Search, Search Result, Match, and Discoverability.

## 0. Decision summary

1. **Search defaults**: server-computed per Organizer. Current week (Monday 00:00 in the Organizer's IANA timezone) + four weeks. Duration 60 minutes. Minimum 2 matching Users. Organizer's profile timezone. Active Topic catalogue pre-selected with none selected by default.
2. **Matching rule copy**: one non-editable line: "Users must have all selected active Topics." The rule is not user-selectable in MVP per `docs/mvp-spec.md:147-155`.
3. **Search Result page**: header (selected Topics, minimum, duration, date range, Organizer timezone, generated timestamp, search ID) + weekly grid (seven columns × hourly rows) + Slot Details drawer (the existing `SlotDetailsDrawer` client island). The Organizer's exclusion from results is silent — no inline note.
4. **Week navigation**: ordinary `<a>` links to `/searches/{id}?week=YYYY-MM-DD`. The server reads the week, slices the immutable snapshot, and renders it. No client state. Works without JavaScript.
5. **Slot Details drawer**: Slot time (Organizer timezone), Match count, matched Topics, per-Match rows (display name, avatar, bio, full Topic profile, topic-filtered Availability, Calendar Connection freshness), and the no-booking/no-export footer.
6. **Stale data**: inline stale marker on the Slot cell and in the drawer. Users are never silently dropped from the result. The cell count is the live count.
7. **Snapshot immutability**: every Search Result is immutable. Re-running a Search creates a new Search row + a new immutable Search Result; the previous snapshot remains open at `/searches/{oldId}`.
8. **Re-running a Search**: a single Server Action call from either the Search Result page or the history page. The new Search is opened immediately.
9. **Search history page**: chronological list (newest first), shared by every Organizer and Admin, with a `Re-run` button per row. No filters.
10. **Snapshot reopening**: the same `/searches/{id}?week=YYYY-MM-DD` page reads the immutable snapshot from the Search Result repository; no recomputation; no separate read-only page.
11. **Searcher exclusion**: the Organizer who created the Search is never in the Match list. The page does not surface this; the audit's primary closure is "the user is excluded" per the spec, and a note is omitted to keep the result page uniform across all Organizers.

## 1. Why these decisions

The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:240-245` lists the Organizer journey's two flows: Search execution and Search history. The canonical architecture at `docs/research/canonical-next-page-api-architecture.md:3` commits to RSC pages with Server Actions. The role-aware shell prototype at `docs/prototypes/role-aware-app-shell-and-screen-hierarchy.md:3` commits to Search in the top-nav for Organizer/Admin. The User onboarding journey at `docs/prototypes/user-onboarding-and-availability-journey.md:3` commits to setup completion as the precondition for matching eligibility.

The shape chosen here satisfies all three: the Search Result page is the canonical surface for the audit's strongest existing rendered evidence (the existing `app/searches/[id]/results/page.tsx` and `SearchResultClient`); the history page is the shared list per the spec; and the rerun action uses Server Action + PRG 303, matching the canonical architecture.

Alternatives rejected:

- Client-side week navigation would have required a client state and would have broken the no-JS fallback. The canonical architecture's progressive-enhancement contract rejects it.
- Including the Organizer in the Match list would contradict `docs/mvp-spec.md:78-83`. Showing an inline note is consistent but adds visual noise; the design choice is silent exclusion.
- A separate read-only snapshot page would double the test surface and diverge from the spec's "saved Search Result is the same Search Result" model.
- Filter chrome on the history page would assume usage volume that the audit does not support. The list is small per the audit.

## 2. The journey map

The Organizer journey has five sections, each numbered. Each step lists the route, the workflow entry point, the visible state, and the explicit error and empty states.

1. **Search form**
2. **Search Result**
3. **Slot Details**
4. **Re-running a Search**
5. **Search history**

Section 1 is the entry. Sections 2–3 are the result review. Section 4 is the rerun path. Section 5 is the shared history.

## 3. Section 1 — Search form

### 3.1 The page

`/searches` is rendered by `app/(product)/searches/page.tsx`. The page calls `searchWorkflow.buildForm({ userId })` and `topicWorkflow.listActive()` in parallel, then renders `SearchForm`.

```
Run Search
[Snapshot: 2026-07-13 00:00 → 2026-08-10 23:59 (America/Sao_Paulo)]

Topics
[ ] Product strategy
[ ] AI engineering
[ ] Design systems
[ ] Sales enablement
Users must have all selected active Topics.

Minimum matching Users  [ 2 ]  (default 2)
Meeting duration         [ 60 minutes ]  (default 60)
Date range               [Mon 2026-07-13] → [Sun 2026-08-10]  (current week + 4 weeks)
Timezone                 [America/Sao_Paulo]  (your profile timezone)

[ Run Search ]
```

The form is server-rendered. The `Run Search` button submits to `POST /searches/run` (the Server Action entry point per the canonical architecture at `docs/research/canonical-next-page-api-architecture.md:6`).

### 3.2 Default values

`searchWorkflow.buildForm({ userId })` returns:

- `selectedTopicIds`: `[]` (none pre-selected; the Organizer must choose).
- `minimumMatchingUsers`: `2`.
- `durationMinutes`: `60`.
- `dateRangeStart`: Monday 00:00 in the Organizer's profile timezone for the current ISO week.
- `dateRangeEnd`: Sunday 23:59 four weeks later.
- `organizerTimezone`: the Organizer's profile timezone.

The defaults match the spec at `docs/mvp-spec.md:79-83` and the prototype at `docs/prototypes/core-search-workflow.md:203-211`. The server computes them; the client never computes them.

### 3.3 Topic selection

The active Topic catalogue is rendered from `topicWorkflow.listActive()`, sorted alphabetically by name. Each Topic is a checkbox. The matching rule is one non-editable line below the checkboxes: "Users must have all selected active Topics."

### 3.4 Run Search action

The form posts to `POST /searches/run` via a Server Action. The handler:

1. Calls `requirePageContext({ roles: ["organizer", "admin"] })`.
2. Calls `assertCsrfOrThrow(request, session)`.
3. Parses the form via `parseFormSubmission(formData)`.
4. Calls `searchWorkflow.run({ userId, raw: parsed })`.
5. On success, 303-redirects to `/searches/{newId}`.
6. On validation failure, 303-redirects to `/searches?feedback=<sealed>` with the structured `fieldErrors` so the form re-renders with errors.

The action is one Server Action. The Search form does not use a client component.

### 3.5 Field errors

| Error | Where it renders |
| --- | --- |
| `selected_topics_required` (zero Topics) | inline above the matching rule line |
| `minimum_out_of_range` (must be ≥ 2; the prototype default 2 is the MVP floor) | inline under the minimum field |
| `duration_out_of_range` (15–240 min) | inline under duration |
| `date_range_invalid` (start < end, ≤ 90 days) | inline under date range |
| `organizer_timezone_required` (no profile timezone) | banner above the form, with `Set timezone` button linking to `/me/profile` |
| `topic_retired` (an active Topic was retired mid-form-fill) | inline next to the matching Topics list |

The form preserves the Organizer's input on error.

### 3.6 Empty state

No active Topics in the catalogue (Admin has not curated any): the form shows the empty state with copy: "No active Topics yet. An Admin must curate Topics before a Search can run." The `Run Search` button is disabled with a tooltip.

## 4. Section 2 — Search Result

### 4.1 The page

`/searches/{id}?week=YYYY-MM-DD` is rendered by `app/(product)/searches/[id]/page.tsx`. The page calls `searchWorkflow.openSnapshot({ userId, searchId })` and renders the Search Result header, the weekly grid, and the `SlotDetailsDrawer` client island.

```
Search Result
Generated 2026-07-13 09:00 (America/Sao_Paulo)
Topics: Product strategy, AI engineering
Minimum: 2 matching Users   Duration: 60 minutes
Range: 2026-07-13 → 2026-08-10
Timezone: America/Sao_Paulo
Search ID: <id>

[← Previous week]  Week of 2026-07-13  [Next week →]

         Mon 13    Tue 14    Wed 15    Thu 16    Fri 17    Sat 18    Sun 19
09:00   [  2  ]   [  3  ]   [  -  ]   [  4  ]   [  2⚠]   [  -  ]   [  -  ]
10:00   [  2  ]   [  -  ]   [  3  ]   [  3  ]   [  -  ]   [  -  ]   [  -  ]
11:00   [  -  ]   [  2⚠]   [  2  ]   [  -  ]   [  5  ]   [  -  ]   [  -  ]
12:00   [  -  ]   [  -  ]   [  -  ]   [  -  ]   [  -  ]   [  -  ]   [  -  ]
13:00   [  4  ]   [  3  ]   [  2  ]   [  2  ]   [  3  ]   [  -  ]   [  -  ]
14:00   [  3  ]   [  2  ]   [  2  ]   [  3  ]   [  4  ]   [  -  ]   [  -  ]
15:00   [  2  ]   [  2  ]   [  2  ]   [  2  ]   [  3  ]   [  -  ]   [  -  ]
16:00   [  2  ]   [  2  ]   [  2  ]   [  2  ]   [  2  ]   [  -  ]   [  -  ]
17:00   [  -  ]   [  1  ]   [  -  ]   [  1  ]   [  -  ]   [  -  ]   [  -  ]
[ Re-run Search ]  [ Open in history ]

Cells marked ⚠ include stale Calendar data.
```

The grid is server-rendered. Each cell is a `<button>` with `data-testid="slot-{dayIdx}-{slotIdx}"` and an `aria-label` that includes the day, hour, Match count, and stale marker (per the existing `SearchResultClient` at `app/searches/[id]/results/SearchResultClient.tsx:222-228`).

### 4.2 Week navigation

`?week=YYYY-MM-DD` selects the seven-day slice starting at the Monday of the ISO week containing the date. `?week` is optional; the default is the first week of the snapshot's date range. The page renders `Previous week` and `Next week` links as ordinary `<a>` elements. The links point to `/searches/{id}?week=YYYY-MM-DD` for the previous and next week. At the date-range boundary, one of the links is disabled.

### 4.3 Stale markers

A Slot is marked stale when any user in its Match list has `connectionState == 'needs_reconnect'` or `connectionState == 'sync_delayed'`. The cell shows:

- A small glyph (`⚠`) next to the count.
- A warning color (the existing `--warning` token).
- The `data-stale="true"` attribute (matching the existing implementation).
- A `aria-label` that ends with "contains stale calendar data" (matching the existing `aria-label` shape at `app/searches/[id]/results/SearchResultClient.tsx:42-56`).

The cell count is the live count, not the snapshot count. The Organizer never sees a Match silently dropped because of stale data.

### 4.4 Stale data explanation

A one-sentence note below the grid: "Cells marked ⚠ include stale Calendar data. The Match list may be smaller than the count suggests." This is the only honest-staleness disclosure. The page never offers a "Recompute" action (the Search is by definition immutable; a recompute is a re-run, which is a different action).

### 4.5 Re-run button

A `Re-run Search` button next to `Open in history` opens a confirm dialog (server-rendered, no client): the Organizer clicks `Re-run`, the page POSTs to `POST /searches/{id}/rerun`, the handler creates a new Search + new Search Result, and 303-redirects to `/searches/{newId}`. The old Search Result stays at `/searches/{oldId}`.

## 5. Section 3 — Slot Details

### 5.1 The drawer

The `SlotDetailsDrawer` client island opens when the Organizer clicks a Slot cell. It is the existing component at `app/components/SlotDetailsDrawer.tsx` and `app/searches/[id]/results/SearchResultClient.tsx:120-126`.

```
Wed 2026-07-15, 09:00–10:00 (America/Sao_Paulo)
3 matching Users  ⚠ 1 user has stale Calendar data

Matched Topics: Product strategy, AI engineering

Participants
1. Bea Silva
   Topics: Product strategy, AI engineering, Growth
   Availability: topic-filtered available in this Search window
   Calendar: fresh, synced 18 minutes ago

2. Carla Mendes
   Topics: Product strategy, AI engineering
   Availability: topic-filtered available in this Search window
   Calendar: stale, last sync 3 days ago  ⚠

3. Diego Rocha
   Topics: Product strategy, AI engineering, Design systems
   Availability: manual only
   Calendar: fresh, synced 9 minutes ago

No booking actions in MVP.
No export/share actions in MVP.
```

### 5.2 Per-Match row content

| Field | Source | Visible to Organizer |
| --- | --- | --- |
| Display name | User profile | yes |
| Avatar (URL or initials) | User profile | yes |
| Bio | User profile | yes |
| Full Topic profile | `topicAssociations` projection in the snapshot | yes |
| Topic-filtered Availability | computed at snapshot time from the User's windows, overrides, and busy intervals | yes |
| Calendar Connection freshness | connectionState + lastSyncAt at snapshot time | yes |

Email, raw calendar events, calendar titles, attendees, locations, and descriptions are not shown (`docs/mvp-spec.md:426-430`). The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:165-168` confirms the existing `MatchCard` shows display name, avatar, bio, full Topic profile, Availability, and Calendar freshness.

### 5.3 Drawer states

| State | Visible difference |
| --- | --- |
| Zero Matches (below threshold) | The cell is `-` (empty) and the drawer is not reachable from it. |
| One Match | Same as multi-Match; numbering still starts at 1. |
| Stale | The Match row shows `Calendar: stale, last sync <duration> ⚠`. The cell is marked stale. The header shows `⚠ N users have stale Calendar data`. |
| Needs reconnect | The Match row shows `Calendar: needs reconnect ⚠`. The cell is marked stale. The drawer header includes the same marker. |
| Unsupported account | The Match row shows `Calendar: personal account not supported`. The cell is **not** marked stale (the user has no calendar to import, not stale data). |

### 5.4 Footer copy

`No booking actions in MVP.` and `No export/share actions in MVP.` are the unchanged existing footer. The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:172-174` calls this out as the spec's MVP honesty contract.

## 6. Section 4 — Re-running a Search

### 6.1 Entry points

The Organizer re-runs a Search from:

- The Search Result page (`Re-run Search` button).
- The Search history page (`Re-run` button per row).

Both call the same Server Action: `POST /searches/{id}/rerun` (or its `/searches/history/{id}/rerun` sibling per the canonical architecture).

### 6.2 The action

The handler:

1. Calls `requirePageContext({ roles: ["organizer", "admin"] })`.
2. Calls `assertCsrfOrThrow(request, session)`.
3. Loads the source Search Result via `searchWorkflow.openSnapshot({ userId, searchId })`.
4. Calls `searchWorkflow.rerun({ userId, searchId })`. The new Search uses the source Search's `selectedTopicIds`, `minimumMatchingUsers`, `durationMinutes`, `dateRangeStart`, `dateRangeEnd`, and the Organizer's profile timezone. The `generatedAt` is `now`.
5. Creates a new Search row and a new immutable Search Result in the same transaction.
6. 303-redirects to `/searches/{newId}`.

### 6.3 Re-run failure cases

| Case | Visible state |
| --- | --- |
| Source Search deleted between page load and click | 303 to `/searches/history` with `feedback=<sealed>`: "That Search is no longer available." |
| A selected Topic has been retired | 303 to `/searches` with `feedback=<sealed>`: "One or more Topics are no longer active. Pick a different Topic set and re-run." |
| Source Organizer no longer has Organizer or Admin role (suspended) | 303 to `/sign-in?reason=suspended` |
| Insufficient permissions on the click | 403 (assertCsrfOrThrow or requirePageContext failure) |

The source Search Result remains at `/searches/{oldId}` and is unaffected by a failed re-run.

### 6.4 The two-Searches question

After a successful re-run the Organizer is on `/searches/{newId}` and sees the new Search Result. The history page lists both. The Organizer can navigate back to the old snapshot at any time.

## 7. Section 5 — Search history

### 7.1 The page

`/searches/history` is rendered by `app/(product)/searches/history/page.tsx`. The page calls `searchWorkflow.listHistory({ userId })` and renders a chronological list (newest first).

```
Search history
Visible to all Organizers and Admins

[2026-07-13 09:00]  Mariana P.
Topics: Product strategy, AI engineering
Minimum: 2   Duration: 60 min
Range: 2026-07-13 → 2026-08-10   Timezone: America/Sao_Paulo
[ Open snapshot ]  [ Re-run ]

[2026-07-12 14:22]  Rafael R.
Topics: Design systems
Minimum: 3   Duration: 90 min
Range: 2026-07-12 → 2026-08-09   Timezone: America/Sao_Paulo
[ Open snapshot ]  [ Re-run ]
```

The list is shared by every Organizer and Admin per the spec at `docs/mvp-spec.md:88-90`. Each row shows the Organizer's display name, generated timestamp, selected Topics, minimum, duration, date range, and timezone. The actions are `Open snapshot` and `Re-run`.

### 7.2 Row order and pagination

Rows are ordered by `generatedAt` descending. No filters, no pagination. The audit's MVP usage assumption supports a small list. The history page renders 50 rows by default; if more than 50 exist, the page shows a `Load more` link that appends the next 50. Pagination is server-side via `?before=<searchId>` and is not part of the page chrome.

### 7.3 Empty state

No Searches yet: the page shows the empty state with copy: "No Searches yet. Run your first Search to see history here." Primary action: `Run your first Search` → `/searches`.

### 7.4 Row actions

- `Open snapshot` is an `<a>` to `/searches/{id}?week=YYYY-MM-DD` (the first week of the snapshot's date range).
- `Re-run` posts to `POST /searches/{id}/rerun` (or its `/searches/history/{id}/rerun` sibling). Same Server Action, same redirect target.

## 8. Snapshot immutability

Every Search Result is immutable. The page never recomputes from current data. The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:177-188` and the spec at `docs/mvp-spec.md:85-90` both call this out. The immutability is enforced at the repository layer: `SearchResultRepository` has no `update` method.

A user can be suspended, can change their profile, can revoke Discoverability, or can disconnect a Calendar Connection after a Search is created. The snapshot does not change. The only honest signal is the stale marker: a cell with a stale `connectionState` is marked, the Match list is rendered from the snapshot, and the Organizer knows the count is approximate.

## 9. The five-section journey closure list

| Section | Closure evidence |
| --- | --- |
| 1 — Search form | Playwright journey: signed-in Organizer → /searches → form pre-filled with defaults → check 2 Topics → set minimum 2, duration 60, date range this week + 4 weeks → Run Search → 303 → /searches/{newId}. Failure paths: zero Topics → inline error; invalid date range → inline error. |
| 2 — Search Result | Playwright journey: /searches/{newId} → header → weekly grid → click slot → SlotDetailsDrawer opens → Match list visible → close drawer → click Next week → new URL with ?week → same page. |
| 3 — Slot Details | Playwright journey: /searches/{id} → click slot with one stale user → drawer shows ⚠ marker and `Calendar: stale, last sync <duration>`. |
| 4 — Re-run | Playwright journey: /searches/{id} → Re-run Search → /searches/{newId} → /searches/history → both rows present → open the old snapshot at /searches/{oldId} → unchanged. |
| 5 — Search history | Playwright journey: /searches/history → 50 rows max → Load more if present → click Open snapshot → /searches/{id} → click Re-run → /searches/{newId}. |

Each closure requires the Playwright journey to pass. The Vitest component and `happy-dom` tests on `SearchResultClient`, `MatchCard`, and `SlotDetailsDrawer` are the lower-level seam, not the closure evidence.

## 10. Closure criteria for ticket #278

When ticket #278 closes, the Organizer journey prototype answers "yes" to every one of these:

- [ ] `/searches` shows the per-Organizer defaults and the all-selected matching rule as one non-editable line.
- [ ] `POST /searches/run` creates a Search + Search Result atomically and 303-redirects to `/searches/{id}`.
- [ ] `/searches/{id}?week=YYYY-MM-DD` loads the immutable snapshot, renders the weekly grid, and opens `SlotDetailsDrawer` on Slot click.
- [ ] Week navigation uses ordinary `<a>` links; the page works without JavaScript.
- [ ] Stale data shows the inline marker and the one-sentence explanation; the cell count is live, never silent-drop.
- [ ] The Organizer who created the Search is never in the Match list.
- [ ] Re-running a Search from the Search Result page or the history page creates a new Search + new immutable Search Result and 303s to `/searches/{newId}`. The source snapshot stays open at `/searches/{oldId}`.
- [ ] `/searches/history` lists every snapshot the Organizer can see, in `generatedAt` desc order, with `Open snapshot` and `Re-run` per row.
- [ ] Snapshot immutability is enforced at the repository layer: no `update` method on `SearchResultRepository`.
- [ ] No booking, RSVP, calendar event creation, reservation, notification inbox, or export/share action exists in this journey.
- [ ] The journey is covered by a Playwright journey that drives form → result → drawer → rerun → history → reopen old snapshot, with each step a distinct block so failures point at the right screen.

## 11. Pointers for the next tickets

- **#281 (Admin journey):** consumes `adminUsersWorkflow`, `adminTopicsWorkflow`, `adminStatusWorkflow`. The Admin journey invites a User; the User's onboarding journey begins. The Admin's Topic Proposal decisions surface on the User's `/me/topics` page per the User journey prototype. The Admin's role grants turn Users into Organizers, which is the precondition for the Search form. The Admin has no `Open snapshot` or `Re-run` action that bypasses the Organizer's view of the same Search Result.
- **#274 (browser acceptance gates):** the Organizer journey is the second end-to-end Playwright journey. The install ticket wires Playwright Test + D4/D5/D6 seams + per-role `storageState`; the User journey prototype is the first journey; the Organizer journey is the second.
- **#279 (completion gates):** every Search-related ticket's closure requires a Playwright journey block. The Vitest component and `happy-dom` tests on `SearchResultClient` and `SlotDetailsDrawer` remain the lower-level seam but are not sufficient closure evidence.
- **#277 (repair spec):** update `docs/mvp-spec.md` Section 4.7 (Organizer Search Form), Section 4.8 (Weekly Search Result Calendar), Section 4.9 (Slot Details Drawer), Section 4.10 (Search History) to match this prototype. Explicitly state that week navigation is server-side, that the matching rule is non-editable, and that stale data is inline-marked.
