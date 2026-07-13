# Task

Implement GitHub issue #54: Match Users against active Topics, full-duration Availability, and eligibility

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Search & Matching](https://github.com/rafaelromao/slotmerge/issues/15). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

A matching function returns eligible Matches for a Search: only Users with all selected active Topics who are available for the full requested Slot duration, who are active, not suspended, discoverable, and setup-complete. The Searcher is excluded.

## Acceptance criteria

- [ ] Only Users with all selected active Topics are eligible.
- [ ] A User is only counted for a Slot if available for the full requested duration.
- [ ] Suspended users are not eligible.
- [ ] Users without discoverability consent are not eligible.
- [ ] Users missing any required setup item are not eligible.
- [ ] The Searcher is excluded from candidates and the minimum count.

## Blocked by

- [Grant and revoke discoverability consent](https://github.com/rafaelromao/slotmerge/issues/28)
- [Show setup checklist and gate setup completion](https://github.com/rafaelromao/slotmerge/issues/35)
- [Compute effective Availability from windows, overrides, and imported busy intervals](https://github.com/rafaelromao/slotmerge/issues/53)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/54-match-users-against-active-topics-full-duration-availability-and-eligibility`
- Source branch: `sandman/54-match-users-against-active-topics-full-duration-availability-and-eligibility`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/54-match-users-against-active-topics-full-duration-availability-and-eligibility` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

The registered next step is **Implement (sandman-implement)**.

## Plan

### Behaviors to test

**TDD slice order (vertical slices, one per AC or AC group):**

1. **Slice 1 - Topic eligibility (AC1)**: Given `selectedTopicIds = [A, B, C]`, only users who have ALL three topics with status "active" are eligible for this search.
   - User has [A, B, C], search requires [A, B] → eligible
   - User has [A, B], search requires [A, B, C] → NOT eligible
   - User has [], search requires [A] → NOT eligible

2. **Slice 2 - Full-duration availability (AC2)**: Given a slot start time T and duration D, a user is counted only if their effective availability intervals cover `[T, T+D]` with no gaps.
   - Available [9:00-17:00], slot 10:00-11:00 → eligible
   - Available [9:00-10:30], slot 10:00-11:00 → NOT eligible (gap 10:30-11:00)
   - Available [9:00-12:00, 13:00-17:00], slot 10:00-11:00 → eligible
   - Available [9:00-12:00, 13:00-17:00], slot 12:30-13:30 → NOT eligible (gap 12:00-13:00)

3. **Slice 3 - Searcher exclusion (AC6)**: The organizer (searcher) is never included in the matching pool, even if they meet all other criteria.

4. **Slice 4 - Composite eligibility (AC3/4/5 via delegation)**: A user is an eligible Match only if they are active, consented, and setup-complete. This is delegated to `isEligibleForSearch` which is already tested.

### Testable interfaces

**New file: `src/matching/find-eligible-matches.ts`**

```typescript
import type { Interval } from "./effective-availability";
import type { WeeklyAvailabilityWindow } from "../profile/availability-windows";
import type { AvailabilityOverride } from "../profile/availability-overrides";
import type { ImportedBusyIntervalRecord } from "../calendar/imported-busy-intervals";

export type FindEligibleMatchesParams = {
  organizerId: string;
  selectedTopicIds: string[];
  candidateUserIds: string[];
  durationMinutes: number;
  rangeStart: Date;
  rangeEnd: Date;
};

export type EffectiveAvailabilityInputs = {
  userId: string;
  profileTimezone: string;
  bufferMinutes: number;
  windows: WeeklyAvailabilityWindow[];
  overrides: AvailabilityOverride[];
  busyIntervals: ImportedBusyIntervalRecord[];
  rangeStart: Date;
  rangeEnd: Date;
};

export type MatchingDependencies = {
  listSelectedTopicIds: (userId: string) => Promise<string[]>;
  computeEffectiveAvailability: (inputs: EffectiveAvailabilityInputs) => Interval[];
  getUserAvailabilityData: (
    userId: string,
  ) => Promise<{
    profileTimezone: string;
    bufferMinutes: number;
    windows: WeeklyAvailabilityWindow[];
    overrides: AvailabilityOverride[];
    busyIntervals: ImportedBusyIntervalRecord[];
  }>;
  isUserEligibleForSearch: (userId: string) => Promise<boolean>;
};

export async function findEligibleMatches(
  params: FindEligibleMatchesParams,
  deps: MatchingDependencies,
): Promise<string[]>;
```

**Filter loop pseudocode:**
```typescript
for (userId of candidateUserIds) {
  // AC6: Skip organizer
  if (userId === organizerId) continue;
  
  // AC3/4/5: Check eligibility (suspended, consent, setup)
  if (!await deps.isUserEligibleForSearch(userId)) continue;
  
  // AC1: Check all selected topics are active
  const userTopicIds = await deps.listSelectedTopicIds(userId);
  if (!selectedTopicIds.every(id => userTopicIds.includes(id))) continue;
  
  // AC2: Check full-duration availability for each slot
  const avail = deps.getUserAvailabilityData(userId);
  const effectiveAvail = deps.computeEffectiveAvailability({...avail, rangeStart, rangeEnd});
  if (!hasFullCoverage(effectiveAvail, slotStart, durationMinutes)) continue;
  
  matches.push(userId);
}
```

**Injection point**: Tests call `findEligibleMatches(params, testDeps)` directly. Production wiring is in `src/matching/index.ts` (to be created).

### Assumptions / risks

- Caller is responsible for fetching the `candidateUserIds` pool (not computed within this function)
- Effective availability intervals from `computeEffectiveAvailability` are already merged and non-overlapping
- The function does NOT generate slots - it only filters a candidate pool; slot generation is a separate concern
- `hasFullCoverage(intervals, slotStart, durationMinutes)` checks if the union of intervals covers `[slotStart, slotStart+duration]`

### TDD execution order

1. **RED**: Write test for `hasAllSelectedTopics` (AC1) - simplest slice
2. **GREEN**: Implement minimal `hasAllSelectedTopics` logic
3. **RED**: Write test for `hasFullDurationCoverage` (AC2)
4. **GREEN**: Implement `hasFullDurationCoverage`
5. **RED**: Write test for AC6 (searcher exclusion) and full `findEligibleMatches`
6. **GREEN**: Wire everything together in `findEligibleMatches`
7. **REFACTOR**: Clean up and verify all tests pass

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
