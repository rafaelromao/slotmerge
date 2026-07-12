# Task

Implement GitHub issue #55: Define Search query parameters and validate them

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Search & Matching](https://github.com/rafaelromao/slotmerge/issues/15). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

The Search model captures selected active Topics, minimum matching Users, meeting duration, date range, and organizer-facing timezone. Validation rejects invalid combinations before running a Search.

## Acceptance criteria

- [ ] Search accepts selected active Topics, minimum, duration, date range, and timezone.
- [ ] Minimum defaults to 2 and is configurable per Search.
- [ ] Date range defaults to current week plus next four weeks.
- [ ] Duration is configurable per Search.
- [ ] Invalid combinations are rejected with clear errors.

## Blocked by

- [Provision app shell, auth, and Postgres bootstrap](https://github.com/rafaelromao/slotmerge/issues/20)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/55-define-search-query-parameters-and-validate-them`
- Source branch: `sandman/55-define-search-query-parameters-and-validate-them`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/55-define-search-query-parameters-and-validate-them` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

Push the branch and create the PR with a closing-reference body (`Closes #55`). Then delegate review via sandman-pr-review.

## Plan

### Behaviors to test (ordered vertical slices)

1. **`buildSearchInput` returns sensible defaults**
   - With a `Clock` pinned at a known date, an active-Topics repository, and a profile repository exposing an organizer timezone: returns empty `selectedTopicIds`, `minimumMatchingUsers = 2`, `durationMinutes = null`, `dateRangeStart = startOfWeek(clock.now(), organizerTimezone)` (Monday 00:00 in that timezone), `dateRangeEnd = dateRangeStart + 5 weeks` (current week + next four), `organizerTimezone` from the profile (fallback `UTC`).

2. **`buildSearchInput` honors overrides**
   - Override values supplied by the Organizer (selected topic ids, `minimumMatchingUsers`, `durationMinutes`, explicit date range, explicit timezone) replace only the corresponding defaults; the rest of the default shape is preserved.

3. **`validateSearchInput` rejects invalid combinations with field-keyed errors**
   - Rejects when no active Topic is selected.
   - Rejects when `minimumMatchingUsers` is less than 2.
   - Rejects when `minimumMatchingUsers` is greater than the supplied `matchingPoolSize` (sourced from the eligibility seam, not computed inside the validator).
   - Rejects when `durationMinutes` is `null` or non-positive.
   - Rejects when `dateRangeEnd` is before or equal to `dateRangeStart`.
   - Rejects when `dateRangeStart` or `dateRangeEnd` carries non-zero minutes/seconds (must be minute-aligned — not hour-of-engine-grid; the engine computes its own hourly grid later).
   - Rejects when `organizerTimezone` is not a valid IANA zone (validated by both `Intl.DateTimeFormat` round-trip and a strict allowlist pattern).
   - Each rejection returns `{ ok: false, errors: Array<{ field, message }> }` keyed by the input field name so callers can surface clear messages.

4. **`validateSearchInput` accepts the canonical valid input**
   - With one or more active Topic ids, `minimumMatchingUsers = 2`, `durationMinutes = 60`, a valid current-week+4-weeks range, and a valid timezone, returns `{ ok: true }`.

5. **Builder happy path: built defaults pass validation without further inputs**
   - `validateSearchInput(buildSearchInput(deps), { matchingPoolSize })` returns `{ ok: true }` when the active-Topics repository yields at least one Topic and the matching pool is large enough.

6. **Active-Topic lookup is the only source of truth**
   - `buildSearchInput` returns empty `selectedTopicIds` when the active Topics repository yields an empty list.
   - `buildSearchInput` rejects (does not silently drop) any seed topic id passed to it that is not in the active list.

7. **`SearchRepository` contract (in-memory tests only)**
   - `save(input)` returns the persisted record with an assigned id and `generatedAt === clock.now()`.
   - `findById(id)` returns the saved record or `null`.
   - `listByOrganizer(organizerId)` returns prior searches for an organizer ordered by `generatedAt desc`.
   - The repository is dependency-injectable via `setSearchRepositoryForTests(repository | null)`, matching the existing discoverability-consent and profile patterns. Snapshot reference is **never** written by `save`; it is left for a downstream issue that computes results.

8. **Drizzle migration + schema introduce the `searches` table**
   - Migration `0006_searches.sql` creates the table with columns matching the spec in `docs/mvp-spec.md` §6.6: `id`, `organizer_id` (FK to `users`), `selected_topic_ids` (jsonb array of UUIDs), `minimum_matching_users`, `duration_minutes`, `range_start`, `range_end`, `organizer_timezone`, `generated_at`, `snapshot_reference` (nullable).
   - The Drizzle schema and snapshot reflect the new table.
   - The migration is idempotent and applies cleanly on a fresh database.

9. **Drizzle-backed `SearchRepository` implementation**
   - The default `searchRepository` reads/writes through `getDb()` and is exercised end-to-end against an in-memory Drizzle repo in tests. The seam established in slice 7 is unchanged.

### Testable interfaces (seams)

- **`SearchInput` (pure data type)** — the parsed, validated input that the search engine will eventually consume. Defined in a new module under `src/search/`.
- **`SearchInputBuilder` factory** — `createSearchInputBuilder({ activeTopicsRepository, profileRepository, clock })` returns `{ build(overrides), validate(input, deps) }`. `build` produces a candidate without running cross-field validation; `validate` is the single rejection gate. Pure functions; all side effects live behind injected seams.
- **`validateSearchInput(input, { matchingPoolSize })`** — pure validator. Returns `{ ok: true } | { ok: false, errors: Array<{ field: string; message: string }> }`. No I/O.
- **`SearchRepository` interface** — `save(input)`, `findById(id)`, `listByOrganizer(organizerId)`. In-memory implementation provided for tests through a `setSearchRepositoryForTests` override. Drizzle-backed implementation lives alongside. Snapshot reference is set by a separate downstream method (not in this ticket).
- **`Clock` seam** — interface returning `now()`; tests pin the date so "current week + next four weeks" is deterministic. `rangeStart` is `startOfWeek(clock.now(), organizerTimezone)` with `weekStartsOn: "monday"`.
- **`matchingPoolSize` seam** — supplied to `validateSearchInput` by the caller (sourced from the existing eligibility/TopicMatch count, not computed inside the validator). This keeps the matching boundary out of this ticket.
- **IANA timezone validation** — dual check: `Intl.DateTimeFormat(candidate).resolvedOptions().timeZone` round-trips back to `candidate`, plus a strict regex allowlist matching `^[A-Za-z][A-Za-z0-9_+\-/]*$`. Avoids relying on Node ICU build quirks.

### Assumptions / risks

- **Slot computation is out of scope for this issue.** The Search model captures parameters and persists them; actual Slot generation lives in a downstream issue (#15 sub-PRD). This slice must not implement matching — only capture and validate parameters.
- **`generatedAt`, not `createdAt`.** MVP spec §6.6 names the timestamp `generated timestamp`; we use `generatedAt` to stay aligned with the spec. The same `Clock` seam drives it.
- **Snapshot reference is nullable and never set in this ticket.** `SearchRepository.save` writes only parameters + `generatedAt`. A downstream issue (results computation) populates `snapshot_reference` via a separate method.
- **Selected topic ids are stored as a JSONB array of UUIDs.** Matches the immutable Search Result JSON pattern used elsewhere in the spec.
- **No new third-party dependency.** IANA timezone validation reuses `Intl.DateTimeFormat` (already available in Node LTS). Validation errors are hand-rolled `{ field, message }[]` rather than zod issues — keeps the public surface stable for UI form rendering. (zod remains in use elsewhere; this is a local choice.)
- **No frontend slice in this ticket.** The acceptance criteria describe the Search model and validation; the Search form UI is a separate ticket downstream of the search engine.
- **Minute alignment, not engine-grid alignment.** The validator enforces minute-zero (`xx:00:00.000`) boundaries. The hourly Slot grid is computed by the search engine in a later ticket; this validator does not encode that engine's grid.

## Next Step

Begin TDD on the first vertical slice: `buildSearchInput` returns sensible defaults from a pinned `Clock` and the active-Topics/profile repositories. Move to the next slice after each RED→GREEN cycle; commit one commit per finished slice per Hard Rule 2.

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
| PR review | `sandman-pr-review` skill | **Must NOT use subagent**

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
