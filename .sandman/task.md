# Task

<<<<<<< HEAD
Implement GitHub issue #57: Render weekly Search Result calendar with per-Slot match counts
||||||| 326ffb3
Implement GitHub issue #56: Run a Search and persist an immutable Search Result snapshot
=======
Implement GitHub issue #61: Mark Search Results stale when underlying data changes
>>>>>>> origin/main

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Search & Matching](https://github.com/rafaelromao/slotmerge/issues/15). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

<<<<<<< HEAD
The Search Result page renders a weekly calendar with an hourly grid. Each cell shows the Match count for the Slot or is empty. Stale-data markers appear in cells whose Matches include stale imported calendar data. Week navigation is inside the rolling 90-day window.
||||||| 326ffb3
Running a Search computes the weekly grid, per-Slot match counts, and per-Slot Match details from current DB state. The Search row stores normalized query parameters; the Search Result snapshot stores an immutable JSON result.
=======
Saved Search Results remain immutable, but the Search history view shows a staleness indicator when re-opening a Search whose underlying data has changed since the snapshot was generated.
>>>>>>> origin/main

## Acceptance criteria

<<<<<<< HEAD
- [ ] Weekly calendar view renders hourly Slot start times.
- [ ] Each cell shows the Match count for that Slot.
- [ ] Stale-data markers appear on affected cells.
- [ ] Week navigation moves within the rolling 90-day window.
- [ ] Only Organizers and Admins can access the page.
||||||| 326ffb3
- [ ] A Search row stores normalized query parameters.
- [ ] A Search Result snapshot stores an immutable JSON result.
- [ ] Search computation reads current data and never calls provider APIs.
- [ ] Hourly Slot start times align to the hourly grid.
- [ ] Snapshots are not modified after creation.
=======
- [ ] Snapshots are never mutated.
- [ ] Search history flags re-opened snapshots as stale when underlying data has changed.
- [ ] Re-running creates a new snapshot to clear staleness.
>>>>>>> origin/main

## Blocked by

- [Run a Search and persist an immutable Search Result snapshot](https://github.com/rafaelromao/slotmerge/issues/56)


## Runtime Context

- You are running inside a Sandman-created worktree.
<<<<<<< HEAD
- Current branch: `sandman/57-render-weekly-search-result-calendar-with-per-slot-match-counts`
- Source branch: `sandman/57-render-weekly-search-result-calendar-with-per-slot-match-counts`
||||||| 326ffb3
- Current branch: `sandman/56-run-a-search-and-persist-an-immutable-search-result-snapshot`
- Source branch: `sandman/56-run-a-search-and-persist-an-immutable-search-result-snapshot`
=======
- Current branch: `sandman/61-mark-search-results-stale-when-underlying-data-changes`
- Source branch: `sandman/61-mark-search-results-stale-when-underlying-data-changes`
>>>>>>> origin/main
- Base branch: `main`
- Review command: `/sandman review`

<<<<<<< HEAD
The worktree MUST be checked out on `sandman/57-render-weekly-search-result-calendar-with-per-slot-match-counts` when the run finishes. Do not switch to `main` or any other branch before exiting.
||||||| 326ffb3
The worktree MUST be checked out on `sandman/56-run-a-search-and-persist-an-immutable-search-result-snapshot` when the run finishes. Do not switch to `main` or any other branch before exiting.
=======
The worktree MUST be checked out on `sandman/61-mark-search-results-stale-when-underlying-data-changes` when the run finishes. Do not switch to `main` or any other branch before exiting.
>>>>>>> origin/main

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

PR-Review (sandman-pr-review)

## Plan

### Confirmation: AC1 and AC3 already hold

**AC1 (Snapshots are never mutated):** Confirmed in `drizzle-search-result-repository.ts` — the `save` method only inserts new rows; `SearchSnapshot` JSONB column is immutable once written.

**AC3 (Re-running creates a new snapshot):** Confirmed in `run-search.ts` — each call to `runSearch()` creates a new `SearchResultRecord` via `searchResultRepository.save()`. The old snapshot is never updated.

**AC2 (Staleness indicator in history):** Not yet implemented. This plan addresses it.

### Behaviors to test

<<<<<<< HEAD
1. **Organizer/Admin role guard**: Only sessions with role "organizer" or "admin" can access the searches page. Users with role "user" get 403 Forbidden. The guard function `isOrganizerOrAdmin` lives in `src/auth/session.ts` alongside the existing `isAdminSession`.

2. **Search listing API (GET /searches)**: Returns list of searches for all Organizers/Admins (shared history per spec). Each search record includes id, organizerId, selectedTopicIds, minimumMatchingUsers, durationMinutes, dateRangeStart, dateRangeEnd, organizerTimezone, generatedAt. Note: existing `SearchRepository.listByOrganizer` filters by single user; a new `listAll` or similar method may be needed to support shared history.

3. **Search detail API (GET /searches/:id)**: Returns the full search record including the nested SearchSnapshot JSON. Uses `SearchRepository.findById` to load the search metadata, then `SearchResultRepository.findBySearchId` to load the snapshot. Response shape includes both search metadata fields and a nested `snapshot` object with the full `SearchSnapshot` JSON.

4. **Weekly calendar grid rendering**: The UI receives the snapshot and renders a 7-day x 24-hour grid. Each cell shows the matchCount for that slot hour (or empty if 0 matches). Slots are filtered to the currently selected week using a pure function.

5. **Stale-data markers**: A slot cell displays a stale marker if ANY match in that slot has `calendarFreshness === "stale"`. Pure function `slotHasStaleMatch(slot: Slot): boolean`.

6. **Week navigation - previous**: "Previous week" button navigates back 7 days. Disabled if the resulting weekStart would be before `(today - 90 days)`.

7. **Week navigation - next**: "Next week" button navigates forward 7 days. Disabled if the resulting weekEnd would be after `dateRangeEnd`.

8. **Week navigation - initial state**: Initial display week is the Monday of the week containing `dateRangeStart`, aligned to start of day in `organizerTimezone`.
||||||| 326ffb3
1. **submitSearch persists a Search record with normalized parameters** — already implemented; AC met by existing `submitSearch`.
2. **generateHourlySlots produces hour-aligned start times** — given `rangeStart` and `rangeEnd`, returns an array of `Date` objects at XX:00:00.000Z. Misaligned `rangeStart` is corrected to the previous hour boundary; `rangeEnd` is exclusive.
3. **runSearch produces a SearchSnapshot JSON with all slots in the range, including zero-match slots** — the snapshot covers every hourly slot from rangeStart to rangeEnd, with matchCount=0 for slots that have no eligible users.
4. **runSearch reads only from DB repositories; no provider API calls are made** — all data (users, topics, availability, busy intervals) comes from existing repository interfaces. No Google/Microsoft Graph calls.
5. **SearchResult snapshot is immutable — only insert exists; no update method** — the `SearchResultRepository` interface has no `update` operation. The DB table has no `updatedAt` column.
6. **A SearchResult snapshot can be retrieved by id or by searchId** — `findById(id)` and `findBySearchId(searchId)` operations exist on `SearchResultRepository`.
7. **Slots within the date range are correctly enumerated with hour-aligned starts** — slot starts run from the hour-aligned `rangeStart` in 1-hour increments up to but not exceeding `rangeEnd`.
=======
1. **Fresh snapshot not flagged:** A `SearchHistoryItem` with `generatedAt` within 24 hours has `stale: false`.
2. **Old snapshot flagged:** A `SearchHistoryItem` with `generatedAt` older than 24 hours has `stale: true`.
3. **Stale field in API response:** `GET /search/history` returns `stale: boolean` per item.

### TDD slice ordering (vertical)

1. Add `stale: boolean` to `SearchHistoryItem` type (`src/search/repository.ts:14-25`); add JSDoc noting it's derived at read time.
2. Add `deriveSearchSnapshotStaleness(generatedAt: Date, now: Date): boolean` in `src/search/match-detail.ts` using `CALENDAR_STALENESS_THRESHOLD_MS`.
3. Compute `stale` in `InMemorySearchRepository.listSearchHistory()` (`src/search/in-memory-repository.ts:35-60`).
4. Compute `stale` in `createPostgresSearchRepository().listSearchHistory()` (`src/search/drizzle-repository.ts:42-77`).
5. Add `stale` to history route response in `createSearchHistoryHandlers().getHistory()` (`src/search/history-route.ts:35-38`).
6. Add unit tests to `src/search/repository.test.ts` for fresh/stale threshold cases.
7. Add integration test to `src/search/history-route.test.ts` for `stale` in response.
>>>>>>> origin/main

### Testable interfaces
<<<<<<< HEAD

1. **`isOrganizerOrAdmin(session: Session | null): session is Session`** — pure type guard in `src/auth/session.ts`. Returns true if session exists and role is "organizer" or "admin".

2. **`getSlotsForWeek(snapshot: SearchSnapshot, weekStart: Date, timezone: string): Slot[]`** — pure function that filters snapshot.slots to those whose startUtc falls within [weekStart, weekStart + 7 days) in the given timezone. Input: SearchSnapshot and a Monday 00:00 in timezone. Output: Slot[] for that week.

3. **`slotHasStaleMatch(slot: Slot): boolean`** — pure function that returns true if any match in slot.matches has calendarFreshness === "stale".

4. **`getPreviousWeekStart(currentWeekStart: Date): Date | null`** — pure function. Returns previous Monday if (currentWeekStart - 7 days) >= (today - 90 days), otherwise null (navigation not allowed).

5. **`getNextWeekStart(currentWeekStart: Date, snapshotDateRangeEnd: Date): Date | null`** — pure function. Returns next Monday if (currentWeekStart + 14 days) <= snapshotDateRangeEnd, otherwise null.

6. **`alignToMonday(date: Date, timezone: string): Date`** — pure function that takes any date and returns the Monday 00:00 of that week in the given timezone.
||||||| 326ffb3

- **`SearchResultRepository`** — `save(result: SearchResultRecord): Promise<SearchResultRecord>`, `findById(id: string): Promise<SearchResultRecord | null>`, `findBySearchId(searchId: string): Promise<SearchResultRecord | null>`. **No update method.**
- **`SearchResultRecord`** — `{ id: string; searchId: string; snapshotJson: SearchSnapshot; createdAt: Date }`
- **`SearchSnapshot`** — `{ generatedAt: string; organizerTimezone: string; dateRangeStart: string; dateRangeEnd: string; durationMinutes: number; slots: Slot[] }`
- **`Slot`** — `{ startUtc: string; matchCount: number; matches: SlotMatchDetail[] }`
- **`SlotMatchDetail`** — `{ userId: string; displayName: string | null; avatarUrl: string | null; shortBio: string | null; topics: TopicDetail[]; availabilityIndicator: AvailabilityIndicator; calendarFreshness: CalendarFreshness }`
- **`TopicDetail`** — `{ id: string; name: string }`
- **`AvailabilityIndicator`** — `'available' | 'partial' | 'unavailable'`
- **`CalendarFreshness`** — `'fresh' | 'stale' | 'none'`
- **`generateHourlySlots(rangeStart: Date, rangeEnd: Date): Date[]`** — pure function; corrects `rangeStart` to previous hour boundary if misaligned; returns empty array if `rangeStart >= rangeEnd`.
- **`availabilityIndicator(slotStart: Date, effectiveAvailability: Interval[], durationMinutes: number): AvailabilityIndicator`** — pure function derived from `hasFullDurationCoverage`. Returns `'available'` if full coverage, `'partial'` if partial overlap exists, `'unavailable'` if no coverage.
- **`deriveCalendarFreshness(lastSyncAt: Date | null, now: Date): CalendarFreshness`** — `'none'` if `lastSyncAt === null`; `'fresh'` if `now - lastSyncAt < CALENDAR_STALENESS_THRESHOLD_MS`; `'stale'` otherwise.
- **`CALENDAR_STALENESS_THRESHOLD_MS = 24 * 60 * 60 * 1000`** — 24-hour threshold.
- **`DiscoverableUserRepository`** — `listDiscoverableUserIds(selectedTopicIds: string[]): Promise<string[]>` — returns IDs of active, consented users who have at least one of the selected topics. Used to build the candidate pool.
- **`RunSearchDeps`** — `{ matchingDependencies: MatchingDependencies; discoverableUserRepository: DiscoverableUserRepository; getUserAvailabilityData: MatchingDependencies['getUserAvailabilityData']; clock: Clock; searchResultRepository: SearchResultRepository; topicRepository: ActiveTopicsRepository; profileRepository: ProfileRepository }`
- **`runSearch(params: { searchRecord: SearchRecord; input: SearchInput }, deps: RunSearchDeps): Promise<SearchResultRecord>`** — computes slots, finds matches per slot, builds snapshot JSON, persists via `searchResultRepository`.

### Implementation slices (sandman-tdd execution order)

1. **Add searchResults table to schema** — `search_results` with: `id (uuid, PK)`, `search_id (uuid, FK -> searches, not null, unique)`, `snapshot_json (jsonb, not null)`, `created_at (timestamp, notNull, defaultNow)`. No `updatedAt` column. Index on `search_id`.
2. **Add SearchResultRepository interface and InMemorySearchResultRepository** — save, findById, findBySearchId. No update method.
3. **Add generateHourlySlots pure function with tests** — aligns rangeStart to previous hour; generates 1-hour slots up to rangeEnd.
4. **Add TopicDetail, AvailabilityIndicator, CalendarFreshness types and availabilityIndicator, deriveCalendarFreshness pure functions** — availabilityIndicator delegates to `hasFullDurationCoverage` logic.
5. **Add DiscoverableUserRepository interface** — `listDiscoverableUserIds(selectedTopicIds)` queries active users with discoverability consent.
6. **Add SearchSnapshot, Slot, SlotMatchDetail types** — full JSON shape for the snapshot.
7. **Add runSearch function** — orchestrates: generateHourlySlots → for each slot call `findEligibleMatches` with slotStart → build `SearchSnapshot` JSON → save via `SearchResultRepository`. Uses only DB-backed repositories; no provider API calls.
8. **Wire runSearch into submitSearch** — after saving Search record, call `runSearch` with the stored record and built input. Update Search record's `snapshotReference` to point to the SearchResult id.
9. **Add Drizzle SearchResult repository** — `createPostgresSearchResultRepository()` implementation.
=======
- `SearchHistoryItem.stale: boolean` — new field, derived at read time from `generatedAt`
- `deriveSearchSnapshotStaleness(generatedAt, now)` — pure function using 24h threshold
- `SearchRepository.listSearchHistory()` — returns items with computed `stale`
- `createSearchHistoryHandlers().getHistory()` — HTTP response includes `stale` per item
>>>>>>> origin/main

### Assumptions / risks

<<<<<<< HEAD
- Any Organizer or Admin can view any search (shared history per spec). No owner-only authorization needed.
- Slots in SearchSnapshot cover the full dateRangeStart to dateRangeEnd. Filtering to a week is a pure transformation.
- Stale detection is boolean per slot: if any match in a slot has stale calendar data, the cell marker is shown.
- Week navigation uses the search's `dateRangeEnd` as the forward boundary (not a rolling window from today).
- The 90-day backward lookback is relative to today, not the search creation date.
- UI is a client-rendered page at `/searches/[id]` using the API data.
||||||| 326ffb3
- `findEligibleMatches` (from `find-eligible-matches.ts`) already handles per-slot matching logic including full-duration coverage check. `runSearch` reuses it.
- `computeEffectiveAvailability` (from `effective-availability.ts`) handles all availability sources (windows, overrides, busy intervals with buffer). `runSearch` uses it as-is.
- `matchingPoolSize` validation in `validateSearchInput` uses the count passed in; the caller provides the correct count. This is existing behavior.
- Calendar freshness threshold of 24 hours is a reasonable default matching the `sync.ts` staleness marker behavior.
- `availabilityIndicator` derives from `hasFullDurationCoverage`: full coverage → `'available'`; partial overlap (start of interval covers part of slot) → `'partial'`; no coverage → `'unavailable'`.
- `listDiscoverableUserIds` will be a new repository that queries the `users`, `discoverability_consents`, `user_topics`, and availability source tables to find eligible candidates.
=======
- **24h heuristic limitation:** If calendar data changes within 24 hours, staleness won't be detected. Future enhancement: denormalize `maxLastSyncAt` at snapshot creation time and compare at read time.
- **No schema changes required:** Staleness computed at read time using existing `generatedAt` field.
- **Snapshots remain immutable:** No mutation; staleness is a derived view concern.
>>>>>>> origin/main

## Already Resolved

If the issue is already implemented on `main`, after fetching and checking the current `origin/main` HEAD against the issue acceptance criteria, update `.sandman/task.md` so it contains the exact line `## Status: already resolved`.

Do not use issue closure, a matching local branch, or unmerged worktree changes as proof that the issue is already resolved. If any acceptance criterion is missing or you are not certain, continue with Plan.

Do not paraphrase this line. Do not use `already implemented`, `no action required`, or any other wording for this marker.

Before writing `## Status: already resolved`, the `sandman-implement` skill requires two pre-flight checks (see Step 1.5). Both must pass before the marker is written. If either fails, do NOT write the marker — fix the underlying condition first, or stop and let the existing PR drive the run.

## Success-Blocking Conditions

The run is NOT considered successful (and `## Status: already resolved` MUST NOT be written) while any of the following are true:

- **Open PR with no approval** — `gh pr list --head <branch> --state open` returns one or more PRs that have not been approved (or the approval state is unknown).
- **`mergeable: CONFLICTING`** — the branch's open PR is in a conflict state with the base branch.
- **Unpushed commits** — `git log @{u}..HEAD` (or `git log origin/main..HEAD` for a new branch) is non-empty; the local branch has commits the remote does not.
- **Unresolved AC blocker** — any acceptance criterion in the issue body is unmet, contested, or marked blocked by another open issue.

Re-check this block immediately before writing `## Status: already resolved`. If any condition is true, abort the marker and address the underlying problem (close orphan PR, back-merge, push commits, or resolve the blocker).

## Mandatory Execution Contract

This task must be executed through the Sandman skill workflow, not by ad-hoc implementation.

1. Load the `sandman` skill.
2. Use mode `sandman implement`.
3. When `sandman` routes to a subskill, load that subskill and follow its full workflow, checklist, guardrails, hard rules, preconditions, and stop conditions before moving on.
4. Treat every `Workflow`, `Checklist`, `Guardrails`, `Hard rule`, `Preconditions`, and `Stop conditions` section in each loaded Sandman subskill as mandatory.
5. Do not skip, summarize, or replace skill steps with your own shortcut.
6. If a skill says to load another skill, load it and follow it end to end.
7. If a step cannot be completed, stop only when the relevant skill says to stop, report the blocker, then still run the continuation step below.

## AFK Rule — Absolute

This is a fully automated Away From Keyboard workflow. **The user will never be available to answer questions, give approval, or make decisions during execution.**

### Hard Ban

You MUST NEVER:
- Ask the user for approval, confirmation, permission, or decisions.
- Ask the user "should I proceed?", "ready for next step?", "want me to continue?", or any variant.
- Ask the user for clarification, feedback, or review.
- Pause, prompt, or block waiting for user input — **including yes/no questions, confirmations, and rhetorical check-ins**.
- Stop mid-workflow to report status to the user unless the workflow has reached a terminal stop condition defined by a loaded skill.

### Subagent Escape Hatch

If you genuinely cannot decide what to do next (ambiguous result, conflicting skill instructions, unclear failure mode), do not ask the user. Instead:
1. **Spawn a subagent** with full context of the decision point.
2. Ask the subagent to analyze and recommend.
3. Reach consensus with the subagent.
4. Proceed automatically.

This is your only allowed second-opinion mechanism. Never fall back to asking the user.

### Satisfying "User Approval" Gates in Skills

When any loaded skill refers to user approval, user confirmation, or user satisfaction, satisfy that gate by proceeding automatically once tests, formatting, CI, and review gates pass.

The Required Skill Chain defines specific tools for each review type:

| Step | Designated Mechanism | Notes |
|------|-------------------|-------|
| Plan approval (TDD) | Subagent review + consensus | Only step that explicitly requires subagent review |
| Self-review | `sandman-self-review` skill |
| PR review | `sandman-pr-review` skill | **Must NOT use subagent** |

**PR review is the only step where subagent review is banned.** Use the `sandman-pr-review` skill instead. Subagent review is recommended for plan approval.

### Examples of Banned Questions

These are all forbidden (non-exhaustive):

> "Ready for PR review step. Want me to proceed?"
> "Should I create the PR now?"
> "Does this look good to you?"
> "Can I merge?"
> "What should I do about this test failure?"
> "The review returned feedback. Should I apply it?"

All of these MUST be handled autonomously. Use the Subagent Escape Hatch for genuine decision ambiguity or as delegated in the table above.

## Search Scope Restriction

If `codeindex.json` exists in the repository root, use `codeindex` before `grep`, `rg`, or `glob` for symbol lookup, dependency lookup, or blast-radius discovery. Only fall back to `grep`/`glob` if `codeindex` cannot answer the question.

Never run grep, rg, find, or any recursive content/file search against directories outside the current working directory (e.g. /tmp, /var, /usr, /etc, /opt, /home, node_modules, .git, target, dist, build, vendor). Such searches return massive output that floods the context window. Restrict searches to the cwd or explicit sub-paths within it; use the Glob/Grep tools which already scope to the project by default.

This restriction applies to the current agent and to every subagent invoked in the current session, including subagents launched directly and subagents launched by any Sandman or other skill loaded during the run. When spawning, delegating to, or handing work off to a subagent, pass this Search Scope Restriction into the subagent's instructions verbatim, or reference this section by name, so the subagent obeys the same rule.

## Required Skill Chain

During `sandman implement`, follow all delegated subskills it calls:

- `sandman-tdd` for planning, subagent-reviewed plan consensus, vertical red-green TDD, and refactor-after-green.
- `sandman-self-review` for self-review.
- `sandman-back-merge` before PR creation, with no rebase and no force-push.
- `sandman-pr-review` for delegated PR review. Do not review the PR yourself.
- `sandman-pr-merge` only if the PR is fully approved, required checks are green, and GitHub reports it mergeable.

## Required Order

1. Complete checklist items in order: Create branch, Plan, Implement, PR-Review, PR-Merge.
2. For plan-approval, use subagent review. For self-review, use `sandman-self-review` skill. For PR-review, use `sandman-pr-review` skill — subagent review is banned there. Proceed after consensus/completion. Do not ask the user.
3. **PR creation is not PR review.** A PR existing does not mean it has been reviewed or is ready to merge. Before loading `sandman-pr-merge`, the agent MUST confirm that `sandman-pr-review` was actually executed and produced a reviewed/approved state. If the last completed step is "PR Created" and the PR is not approved or not mergeable, the agent MUST call `sandman-pr-review` before `sandman-pr-merge` — do not skip the review step. If any merge gate is false or ambiguous, call `sandman-pr-review` and continue the review loop instead of reporting blockers to the user.
4. If `PR-Review` completes with full approval and all merge gates are true, load and run `sandman-pr-merge`.
5. If a `sandman-pr-review` pass times out or returns without approval, do not mark `PR-Review` complete and do not advance to `PR-Merge` on the next retry. Re-enter `sandman-pr-review` and keep the review loop open until approval is observed or a stop condition is reached.

## Completion Requirements

Before final response, verify and report:

- Whether each required skill checklist was completed.
- Test/format commands run and outcomes.
- PR URL and review status, if a PR was created.
- Whether PR merge was performed or skipped, with reason.
