# Task

Implement GitHub issue #33: Define weekly Availability Windows in profile timezone

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Calendar Connections](https://github.com/rafaelromao/slotmerge/issues/17). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

A User defines recurring weekly Availability Windows in their profile timezone. Windows are stored timezone-aware so recurring rules behave correctly across DST.

## Acceptance criteria

- [ ] User can add, edit, and remove weekly Availability Windows.
- [ ] Windows are stored in the user's profile timezone.
- [ ] Windows correctly handle DST transitions.
- [ ] At least one Availability Window or override satisfies setup-completion availability.

## Blocked by

- [Edit profile attributes](https://github.com/rafaelromao/slotmerge/issues/27) — CLOSED

## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/33-define-weekly-availability-windows-in-profile-timezone`
- Source branch: `sandman/33-define-weekly-availability-windows-in-profile-timezone`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/33-define-weekly-availability-windows-in-profile-timezone` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan) — subagent-reviewed plan approved
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review) — see self-review findings below
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Plan

### Behaviors to test

1. **Add weekly Availability Window**: User can create a weekly recurring window with day-of-week (0=Sun–6=Sat), start time (HH:MM), end time (HH:MM) stored in their profile timezone. Returns the created window with its ID. Rejects creation if user has no profile timezone.

2. **List Availability Windows**: User can list all their own weekly availability windows.

3. **Edit Availability Window**: User can update an existing window's day-of-week, start time, or end time. Validates ownership before editing. Returns 404 if window not found or not owned.

4. **Remove Availability Window**: User can delete an existing window by ID. Validates ownership before deleting. Returns 404 if window not found or not owned.

5. **Setup completeness satisfied by Availability Windows**: When user has ≥1 availability window, `hasAvailabilitySource` is true in setup completeness. This already works via existing `computeSetupCompleteness` — repo must return windows to satisfy it.

6. **Reject when profileTimezone is null**: Window creation fails with a `profile_timezone_required` error if the user has no `profileTimezone` set.

7. **Input validation**: dayOfWeek must be 0–6; startTime and endTime must be valid HH:MM with endTime > startTime.

8. **DST expansion utility**: `expandWeeklyWindowToUtcRange(window, timezone, rangeStart, rangeEnd)` returns UTC Date[] intervals for a weekly window across a date range, correctly shifting hours across DST boundaries using `Intl.DateTimeFormat` with `timeZone` option.

### Testable interfaces

- `WeeklyAvailabilityWindowRepository` interface in `src/profile/availability-windows.ts`:
  - `add(userId: string, window: NewWeeklyAvailabilityWindow): Promise<WeeklyAvailabilityWindow>`
  - `listByUserId(userId: string): Promise<WeeklyAvailabilityWindow[]>`
  - `updateById(id: string, userId: string, updates: WeeklyAvailabilityWindowUpdate): Promise<WeeklyAvailabilityWindow | null>`
  - `removeById(id: string, userId: string): Promise<boolean>`
- `WeeklyAvailabilityWindow` type: `{ id: string; userId: string; dayOfWeek: number; startTime: string; endTime: string; profileTimezone: string; createdAt: Date; updatedAt: Date }`
- `NewWeeklyAvailabilityWindow`: `{ dayOfWeek: number; startTime: string; endTime: string }`
- `WeeklyAvailabilityWindowUpdate`: partial of `NewWeeklyAvailabilityWindow`
- REST endpoints: `POST/GET/DELETE /me/availability-windows` and `PATCH /me/availability-windows/:id`
- Profile timezone read from `users.profileTimezone` at creation time; validated to be non-null

### Changes required

### Implementation slices (TDD order)

- **Timezone library**: No third-party timezone library in dependencies. DST expansion uses native `Date` + `Intl.DateTimeFormat` with `timeZone` option. If this proves insufficient during TDD, raise as blocker before adding a dependency.
- **No one-off overrides**: This issue covers only weekly recurring windows. One-off overrides are a separate future issue.
- **Unique constraint**: DB migration enforces unique `(userId, dayOfWeek, startTime)` per user. Repo layer maps DB unique-violation errors to a `duplicate_window` API error.
- **Route location**: New `app/me/availability-windows/` route segment following the same auth+CSRF pattern as `app/me/discoverability-consent/`.

### TDD execution order

1. Repository interface + in-memory test double (enables all route tests)
2. DB migration `0007_availability_windows.sql` — schema + indexes
3. DB-backed repository implementation
4. Route-level tests + implementation: POST (add), GET (list)
5. Route-level tests + implementation: PATCH (edit), DELETE (remove)
6. DST expansion utility + unit tests

## Next Step

The registered next step is the first unchecked item in the Execution Checklist: **PR-Review** (sandman-pr-review).

## Self-Review Findings (addressed before commit)

### Standards
- Removed unnecessary defensive `if (!row)` check after insert
- Duplicated `hasValidCsrfToken` and `formatWindow` in two routes — accepted as existing pattern

### Spec
- Fixed PATCH partial-update validation bug: added `findById` to repo interface and validation in PATCH handler to ensure `endTime > startTime` when doing partial updates
- Added `findById` method to in-memory test doubles

### Tests
- DST test: corrected to use January (EST) vs June (EDT) instead of March 9 vs 16 (both EDT)
- DST expansion formula: fixed sign from `-offsetMs` to `+offsetMs` (UTC = local + offset for positive offsets)

## Already Resolved

If the issue is already implemented on `main`, after fetching and checking the current `origin/main` HEAD against the issue acceptance criteria, update `.sandman/task.md` so it contains the exact line `## Status: already resolved`.

Do not use issue closure, a matching local branch, or unmerged worktree changes as proof that the issue is already resolved. If any acceptance criterion is missing or you are not certain, continue to Plan.

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
6. If a skill says to load another skill, load that skill and follow it end to end.
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
> "What should I do about this test gap?"
> "The review returned feedback. Should I apply it?"

All of these MUST be handled autonomously. Use the Subagent Escape Hatch for genuine decision ambiguity or as delegated in the table above.

## Search Scope Restriction

If `codeindex.json` exists in the repository root, use `codeindex` before `grep`, `rg`, or `glob` for symbol lookup, dependency lookup, or blast-radius discovery. Only fall back to `grep`/`glob` if `codeindex` cannot answer the question.

Never run grep, rg, find, or any recursive content search against directories outside the current working directory (e.g. /tmp, /var, /usr, /etc, /opt, /home, node_modules, .git, target, dist, build, vendor). Such searches return massive output that floods the context window. Restrict searches to the cwd or explicit sub-paths within it; use the Glob/Grep tools which already scope to the project by default.

This restriction applies to the current agent and to every subagent invoked in the current session, including subagents launched directly and subagents launched by any Sandman or other skill loaded during the run. When spawning, delegating to, or handing off to a subagent, pass this Search Scope Restriction into the subagent's instructions verbatim, or reference this section by name, so the subagent obeys the same rule.

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
4. If a `PR-Review` completes with full approval and all merge gates are true, load and run `sandman-pr-merge`.
5. If a `sandman-pr-review` pass times out or returns without approval, do not mark `PR-Review` complete and do not advance to `PR-Merge` on the next retry. Re-enter `sandman-pr-review` and keep the review loop open until approval or a stop condition is reached.

## Completion Requirements

Before final response, verify and report:

- Whether each required skill checklist was completed.
- Test/format commands run and outcomes.
- PR URL and review status, if a PR was created.
- Whether PR merge was performed or skipped, with reason.

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Calendar Connections](https://github.com/rafaelromao/slotmerge/issues/17). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

<<<<<<< HEAD
A User defines recurring weekly Availability Windows in their profile timezone. Windows are stored timezone-aware so recurring rules behave correctly across DST.
||||||| 2c831a8
A User sees the list of their pending Topic Proposals on `My Topics`, including their current state. Pending Topic Proposals count toward setup completion but do not make the user match Searches.
=======
Calendar sync writes normalized busy intervals per user, connection, provider calendar, status (busy, out-of-office, tentative, free, working-elsewhere), and start/end time for the rolling 90-day future window. Search reads these rows and never calls provider APIs at runtime.
>>>>>>> origin/main

## Acceptance criteria

<<<<<<< HEAD
- [ ] User can add, edit, and remove weekly Availability Windows.
- [ ] Windows are stored in the user's profile timezone.
- [ ] Windows correctly handle DST transitions.
- [ ] At least one Availability Window or override satisfies setup-completion availability.
||||||| 2c831a8
- [ ] User sees pending proposals with their current state.
- [ ] Pending proposals count toward setup completion.
- [ ] User can identify which proposals are awaiting Admin review.
=======
- [ ] Imported busy intervals are stored as normalized rows.
- [ ] Status is preserved per interval.
- [ ] Only the rolling 90-day future window is stored.
- [ ] Search does not call provider APIs at runtime.
- [ ] Edits apply immediately to future Searches.
>>>>>>> origin/main

## Blocked by

<<<<<<< HEAD
- [Edit profile attributes](https://github.com/rafaelromao/slotmerge/issues/27) — CLOSED
||||||| 2c831a8
- [Propose a new Topic](https://github.com/rafaelromao/slotmerge/issues/29)

=======
- [OAuth-connect Microsoft work/school calendar with Calendars.ReadBasic](https://github.com/rafaelromao/slotmerge/issues/44)
- [Encrypt Calendar Connection OAuth tokens at rest](https://github.com/rafaelromao/slotmerge/issues/45)

>>>>>>> origin/main

## Runtime Context

- You are running inside a Sandman-created worktree.
<<<<<<< HEAD
- Current branch: `sandman/33-define-weekly-availability-windows-in-profile-timezone`
- Source branch: `sandman/33-define-weekly-availability-windows-in-profile-timezone`
||||||| 2c831a8
- Current branch: `sandman/32-list-pending-topic-proposals-on-profile`
- Source branch: `sandman/32-list-pending-topic-proposals-on-profile`
=======
- Current branch: `sandman/47-persist-normalized-imported-busy-intervals-for-the-rolling-90-day-window`
- Source branch: `sandman/47-persist-normalized-imported-busy-intervals-for-the-rolling-90-day-window`
>>>>>>> origin/main
- Base branch: `main`
- Review command: `/sandman review`

<<<<<<< HEAD
The worktree MUST be checked out on `sandman/33-define-weekly-availability-windows-in-profile-timezone` when the run finishes. Do not switch to `main` or any other branch before exiting.
||||||| 2c831a8
The worktree MUST be checked out on `sandman/32-list-pending-topic-proposals-on-profile` when the run finishes. Do not switch to `main` or any other branch before exiting.
=======
The worktree MUST be checked out on `sandman/47-persist-normalized-imported-busy-intervals-for-the-rolling-90-day-window` when the run finishes. Do not switch to `main` or any other branch before exiting.
>>>>>>> origin/main

## Execution Checklist

- [x] Create branch
<<<<<<< HEAD
- [x] Plan (sandman-plan) — subagent-reviewed plan approved
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review) — see self-review findings below
||||||| 2c831a8
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
=======
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
>>>>>>> origin/main
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Plan

### Behaviors to test

<<<<<<< HEAD
1. **Add weekly Availability Window**: User can create a weekly recurring window with day-of-week (0=Sun–6=Sat), start time (HH:MM), end time (HH:MM) stored in their profile timezone. Returns the created window with its ID. Rejects creation if user has no profile timezone.

2. **List Availability Windows**: User can list all their own weekly availability windows.

3. **Edit Availability Window**: User can update an existing window's day-of-week, start time, or end time. Validates ownership before editing. Returns 404 if window not found or not owned.

4. **Remove Availability Window**: User can delete an existing window by ID. Validates ownership before deleting. Returns 404 if window not found or not owned.

5. **Setup completeness satisfied by Availability Windows**: When user has ≥1 availability window, `hasAvailabilitySource` is true in setup completeness. This already works via existing `computeSetupCompleteness` — repo must return windows to satisfy it.

6. **Reject when profileTimezone is null**: Window creation fails with a `profile_timezone_required` error if the user has no `profileTimezone` set.

7. **Input validation**: dayOfWeek must be 0–6; startTime and endTime must be valid HH:MM with endTime > startTime.

8. **DST expansion utility**: `expandWeeklyWindowToUtcRange(window, timezone, rangeStart, rangeEnd)` returns UTC Date[] intervals for a weekly window across a date range, correctly shifting hours across DST boundaries using `Intl.DateTimeFormat` with `timeZone` option.
||||||| 2c831a8
1. **GET /me returns topicProposals with status field (AC1 + AC3)**: When a user has topic proposals, the GET /me response includes those proposals with their `status` field (`"pending"` | `"approved"` | `"rejected"`). The `status: "pending"` value is how users identify which proposals are awaiting Admin review — no additional UI logic required beyond surfacing the field.
2. **TopicProposal type includes status field**: The `TopicProposal` type in `app/me/route.ts` reflects `{ id: string; name: string; status: TopicProposalStatus }` — matching the DB schema.
3. **Pending proposals count toward setup completion (AC2)**: A user with only pending topic proposals (no approved topics) still has `hasTopic` setup item marked complete — this already works at line 65 of `route.ts`.
=======
1. **Busy intervals can be persisted and retrieved by user**
   - Given a user with connected calendars
   - When busy intervals are imported from a calendar provider
   - Then they are stored in `imported_busy_intervals` table
   - And can be retrieved by user ID and date range

2. **Status is preserved per interval**
   - Given busy intervals with different blocking statuses (busy, out-of-office, tentative)
   - When stored in the database
   - Then the exact status is preserved on retrieval
   - Note: only busy/out-of-office/tentative are stored (free/working-elsewhere are filtered per spec §6.5)

3. **Only the rolling 90-day future window is stored**
   - Given intervals with start times beyond 90 days in the future
   - When attempting to store them
   - Then they are not persisted (filtered out on upsert)
   - And only intervals starting within the next 90 days are stored

4. **Search reads persisted busy intervals without provider API calls**
   - Given stored busy intervals for a user
   - When Search computes availability
   - Then no provider API calls are made
   - And busy intervals from DB are used directly

5. **Edits apply immediately to future Searches**
   - Given stored busy intervals for a user
   - When intervals are updated/deleted in the DB
   - Then subsequent Search queries see the new data immediately
>>>>>>> origin/main

### Testable interfaces

<<<<<<< HEAD
- `WeeklyAvailabilityWindowRepository` interface in `src/profile/availability-windows.ts`:
  - `add(userId: string, window: NewWeeklyAvailabilityWindow): Promise<WeeklyAvailabilityWindow>`
  - `listByUserId(userId: string): Promise<WeeklyAvailabilityWindow[]>`
  - `updateById(id: string, userId: string, updates: WeeklyAvailabilityWindowUpdate): Promise<WeeklyAvailabilityWindow | null>`
  - `removeById(id: string, userId: string): Promise<boolean>`
- `WeeklyAvailabilityWindow` type: `{ id: string; userId: string; dayOfWeek: number; startTime: string; endTime: string; profileTimezone: string; createdAt: Date; updatedAt: Date }`
- `NewWeeklyAvailabilityWindow`: `{ dayOfWeek: number; startTime: string; endTime: string }`
- `WeeklyAvailabilityWindowUpdate`: partial of `NewWeeklyAvailabilityWindow`
- REST endpoints: `POST/GET/DELETE /me/availability-windows` and `PATCH /me/availability-windows/:id`
- Profile timezone read from `users.profileTimezone` at creation time; validated to be non-null
||||||| 2c831a8
- `app/me/route.ts` — `TopicProposal` type, `buildMeResponse()` return shape, `computeSetupCompleteness()` logic
- `tests/me-route.test.ts` — existing test fixtures using `setPerUserLookupStateForTests({ topicProposalsByUserId: Map<string, TopicProposal[]> })`

### Changes required

**`app/me/route.ts`**:
- Import `TopicProposalStatus` from `../../src/db/schema`
- Add `status: TopicProposalStatus` to the `TopicProposal` type (line 24)
- Existing `getTopicProposalsByUserId` already returns `TopicProposal[]` — the in-memory store holds full objects, no seam change needed

**`tests/me-route.test.ts`**:
- All existing test assertions use `topicProposals: []` (empty) — no assertion updates required
- Add a new test: seed `topicProposalsByUserId` with mixed statuses (`"pending"`, `"approved"`, `"rejected"`), assert all three are returned with correct `status` values, and assert `hasTopic` setup item is `complete: true` when only pending proposals exist
=======
1. **BusyIntervalStatus** enum — type-safe status values:
   ```typescript
   type BusyIntervalStatus = "busy" | "out-of-office" | "tentative";
   // Note: "free" and "working-elsewhere" are not stored per spec §6.5
   ```

2. **ImportedBusyIntervalRecord** — Type for a stored busy interval:
   ```typescript
   type ImportedBusyIntervalRecord = {
     id: string;
     userId: string;
     connectionId: string;
     providerCalendarId: string;
     providerEventReference: string | null;
     status: BusyIntervalStatus;
     startAt: Date;
     endAt: Date;
     importedAt: Date;
   };
   ```

3. **ImportedBusyIntervalRepository** interface:
   ```typescript
   type ImportedBusyIntervalRepository = {
     upsertBatch(intervals: ImportedBusyIntervalRecord[]): Promise<void>;
     deleteByConnectionId(connectionId: string): Promise<void>;
     findByUserIdAndDateRange(
       userId: string,
       start: Date,
       end: Date,
     ): Promise<ImportedBusyIntervalRecord[]>;
     deleteExpiredBefore(before: Date): Promise<number>;
   };
   ```

4. **Test override mechanism** (same pattern as `setSearchRepositoryForTests`):
   ```typescript
   let importedBusyIntervalRepositoryOverride: ImportedBusyIntervalRepository | null = null;
   export function setImportedBusyIntervalRepositoryForTests(repo: ImportedBusyIntervalRepository | null);
   export function getImportedBusyIntervalRepository(): ImportedBusyIntervalRepository;
   ```
>>>>>>> origin/main

### Implementation slices (TDD order)

<<<<<<< HEAD
- **Timezone library**: No third-party timezone library in dependencies. DST expansion uses native `Date` + `Intl.DateTimeFormat` with `timeZone` option. If this proves insufficient during TDD, raise as blocker before adding a dependency.
- **No one-off overrides**: This issue covers only weekly recurring windows. One-off overrides are a separate future issue.
- **Unique constraint**: DB migration enforces unique `(userId, dayOfWeek, startTime)` per user. Repo layer maps DB unique-violation errors to a `duplicate_window` API error.
- **Route location**: New `app/me/availability-windows/` route segment following the same auth+CSRF pattern as `app/me/discoverability-consent/`.

### TDD execution order

1. Repository interface + in-memory test double (enables all route tests)
2. DB migration `0007_availability_windows.sql` — schema + indexes
3. DB-backed repository implementation
4. Route-level tests + implementation: POST (add), GET (list)
5. Route-level tests + implementation: PATCH (edit), DELETE (remove)
6. DST expansion utility + unit tests

## Next Step

The registered next step is the first unchecked item in the Execution Checklist: **PR-Review** (sandman-pr-review).

## Self-Review Findings (addressed before commit)

### Standards
- Removed unnecessary defensive `if (!row)` check after insert
- Duplicated `hasValidCsrfToken` and `formatWindow` in two routes — accepted as existing pattern

### Spec
- Fixed PATCH partial-update validation bug: added `findById` to repo interface and validation in PATCH handler to ensure `endTime > startTime` when doing partial updates
- Added `findById` method to in-memory test doubles

### Tests
- DST test: corrected to use January (EST) vs June (EDT) instead of March 9 vs 16 (both EDT)
- DST expansion formula: fixed sign from `-offsetMs` to `+offsetMs` (UTC = local + offset for positive offsets)
||||||| 2c831a8
- The blocking issue #31 (Propose a new Topic) defines the creation side; this change only affects the viewing/listing side and is safe to implement independently.
- `candidateName` in the DB schema maps to `name` in the API — existing mapping is preserved.
- `TopicProposalStatus` type already exists in `src/db/schema` — no new type needed.
=======
**Slice 1: Schema and migration**
- Add `imported_busy_intervals` table to `src/db/schema.ts` with columns: id, userId, connectionId, providerCalendarId, providerEventReference (nullable), status, startAt, endAt, importedAt
- Add indexes on (userId, startAt, endAt) for efficient range queries
- Add foreign key to `calendar_connections` table
- Create Drizzle migration file `drizzle/0007_imported_busy_intervals.sql`
- Add relations: `calendarConnection` → `importedBusyIntervals` (one-to-many), `user` → `importedBusyIntervals` (one-to-many)

**Slice 2: Repository interface and in-memory implementation**
- Define `ImportedBusyIntervalRepository` interface in `src/calendar/imported-busy-intervals.ts`
- Create `InMemoryImportedBusyIntervalRepository` for tests
- Add `setImportedBusyIntervalRepositoryForTests` and `getImportedBusyIntervalRepository` override mechanism
- Write tests for all 5 behaviors using in-memory repo

**Slice 3: Postgres repository implementation**
- Implement `createPostgresImportedBusyIntervalRepository()` in `src/calendar/imported-busy-intervals.repository.ts`
- `upsertBatch`: delete all existing intervals for the same connectionId, then insert new batch (assumes serialized per-connection sync — concurrent syncs for same connection are not supported in MVP)
- `findByUserIdAndDateRange`: query by userId + range using the index
- `deleteExpiredBefore`: cleanup job helper
- Verify all tests pass against Postgres

**Slice 4: 90-day window enforcement**
- Add `isWithinRollingWindow(startAt: Date): boolean` pure function
- Filter intervals in `upsertBatch` — only store if `isWithinRollingWindow(startAt)` is true
- Write test: intervals beyond 90 days are not stored
- Note: `deleteExpiredBefore` handles intervals whose startAt has passed the window

**Slice 5: Search integration — seam definition**
- Add `getImportedBusyIntervalsByUserId(userId, rangeStart, rangeEnd)` testable seam parallel to existing `getAvailabilityWindowsByUserId` pattern
- `hasAvailabilitySource` check (in `isEligibleForSearchFromProfileSources`) stays true if `calendarConnections.length > 0` — no change needed there
- The imported busy intervals seam enters downstream at slot-computation time (separate from eligibility check)
- Write test: given stored busy intervals, they are returned by `getImportedBusyIntervalsByUserId` without any provider API calls

**Slice 5b: Assert no provider API calls during search**
- In the search integration test, mock the calendar provider client (Google/Microsoft fetch)
- Assert that during `getImportedBusyIntervalsByUserId` call, zero provider API calls are made
- This satisfies acceptance criterion "Search does not call provider APIs at runtime"

### Assumptions / Risks

1. Issues #44 and #45 block actual calendar sync, but the persistence layer is built ahead
2. The sync model is serialized per-connection (delete-all then insert-all for a given connectionId)
3. Only blocking statuses (busy, out-of-office, tentative) are stored; free/working-elsewhere are filtered at storage time
4. BufferMinutes subtraction happens at search-time slot computation (not at storage time), after `getImportedBusyIntervalsByUserId` returns

## Next Step

Load sandman-implement and execute the TDD plan
>>>>>>> origin/main

## Already Resolved

If the issue is already implemented on `main`, after fetching and checking the current `origin/main` HEAD against the issue acceptance criteria, update `.sandman/task.md` so it contains the exact line `## Status: already resolved`.

Do not use issue closure, a matching local branch, or unmerged worktree changes as proof that the issue is already resolved. If any acceptance criterion is missing or you are not certain, continue to Plan.

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

This restriction applies to the current agent and to every subagent invoked in the current session, including subagents launched directly and subagents launched by any Sandman or other skill loaded during the run. When spawning, delegating to, or handing off to a subagent, pass this Search Scope Restriction into the subagent's instructions verbatim, or reference this section by name, so the subagent obeys the same rule.

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
