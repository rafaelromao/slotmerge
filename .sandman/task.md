# Task

Implement GitHub issue #39: Approve, reject, or retire Topics

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Admin & Notifications](https://github.com/rafaelromao/slotmerge/issues/18). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

Admins can approve or reject pending Topic Proposals and retire active Topics. Retired Topics preserve historical user associations but are not selectable for new ones and cannot be used in new Searches.

## Acceptance criteria

- [ ] Admin can approve a pending Topic Proposal; it becomes active.
- [ ] Admin can reject a pending Topic Proposal.
- [ ] Admin can retire an active Topic.
- [ ] Retired Topics remain visible on past associations but not selectable for new ones.
- [ ] Retired Topics do not participate in new Searches.

## Blocked by

- [View controlled Topic catalogue](https://github.com/rafaelromao/slotmerge/issues/30)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/39-approve-reject-or-retire-topics`
- Source branch: `sandman/39-approve-reject-or-retire-topics`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/39-approve-reject-or-retire-topics` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

Implement: load sandman-tdd and execute Slice 1 (Schema + migration)

## Plan

### Behaviors to test

1. **Admin can approve a pending Topic Proposal; it becomes active.**
   - POST /admin/topic-proposals/{id}/approve (action=approve form param) → atomically: TopicProposal status=approved + new Topic status=active created with candidate_name as name
   - No auto-UserTopic association created on approve; proposing user must explicitly select the new active Topic
2. **Admin can reject a pending Topic Proposal.**
   - POST /admin/topic-proposals/{id}/reject (action=reject form param) → TopicProposal status=rejected, no Topic created
3. **Admin can retire an active Topic.**
   - POST /admin/topics/{id}/retire (action=retire form param) → Topic status=retired, retiredAt set to now
4. **Retired Topics retain existing UserTopic associations.**
   - UserTopic associations with status=active are NOT modified when a Topic is retired; only the Topic's status changes
5. **Admin can view pending Topic Proposals queue.**
   - GET /admin/topic-proposals → HTML page listing pending proposals with approve/reject forms

### Testable interfaces

- `TopicProposalRepository`: `listPending()`, `approve(id): Promise<{ topicId: string }>`, `reject(id): Promise<void>`
- `TopicRepository`: `listActive()`, `retire(id): Promise<void>`
- `AdminTopicProposalsHandlers`: factory `{ GET, POST }` with DI for session + repository
- `AdminTopicsHandlers`: factory `{ GET, POST }` with DI for session + repository

### Slices (vertical, execution order)

**Slice 1 — Schema + migration**
- Add `topic_proposals` table: id, proposed_by_user_id (FK→users), candidate_name, status (pending/approved/rejected), created_at, updated_at
- Add `topics` table: id, name (unique), status (pending/active/retired), retired_at (nullable), created_at, updated_at
- Add `user_topics` table: id, user_id (FK→users), topic_id (FK→topics), status (active/pending-retired/historical), created_at, updated_at
- Add relations to schema.ts; create migration file

**Slice 2 — Repository layer**
- `TopicProposalRepository` with DB implementation (approve uses a transaction)
- `TopicRepository` with DB implementation

**Slice 3 — Admin Topic Proposals page+handler**
- `app/admin/topic-proposals/route.ts` → delegates to `src/admin/topic-proposals.ts`
- GET: list pending proposals; POST: route approve/reject by action param
- HTML page with forms, CSRF token

**Slice 4 — Admin Topics page+handler**
- `app/admin/topics/route.ts` → delegates to `src/admin/topics.ts`
- GET: list active topics; POST: route retire by action param
- HTML page with retire forms, CSRF token

**Slice 5 — Unit tests**
- `src/admin/topic-proposals.test.ts`: mock session + repository, test approve/reject/list
- `src/admin/topics.test.ts`: mock session + repository, test retire/list
- `src/admin/topic-proposals.test.ts`: test that approve atomically creates Topic

### Assumptions / risks

- No audit logging infrastructure exists yet; audit logging for admin Topic decisions is noted in mvp-spec §10 but out of scope for this issue.
- No existing Topic/TopicProposal/UserTopic tables exist in schema; this slice creates them.
- Retired Topics not participating in Searches requires the Search module to filter by status=active; this AC is enforced by the Search module (separate issue) and not tested here — the AC "Retired Topics do not participate in new Searches" is satisfied by setting status=retired, which the Search module will read.
- "Retired Topics remain visible on past associations" is satisfied by NOT modifying UserTopic associations when retiring — the association stays at status=active.

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
