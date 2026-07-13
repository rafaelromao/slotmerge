# Task

Implement GitHub issue #31: Propose a new Topic

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Profile & Setup](https://github.com/rafaelromao/slotmerge/issues/19). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

A User submits a Topic Proposal from `My Topics`. Submissions are similarity-blocked against existing active and pending Topic names so the catalogue does not fragment. Blocked submissions surface a clear "too similar to" message.

## Acceptance criteria

- [ ] User submits a proposal name from `My Topics`.
- [ ] Submissions near an existing name (case-insensitive, whitespace-normalized, similarity threshold) are blocked.
- [ ] Blocked submissions show the closest existing Topic name(s).
- [ ] Accepted submissions create a pending Topic Proposal attached to the user.

## Blocked by

- [View controlled Topic catalogue](https://github.com/rafaelromao/slotmerge/issues/30)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/31-propose-a-new-topic`
- Source branch: `sandman/31-propose-a-new-topic`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/31-propose-a-new-topic` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Plan

### Behaviors to test

1. **Submit a valid topic proposal**  
   Authenticated user POSTs to `/topic-proposals` with a candidate name. Name is whitespace-collapsed + lowercased. No existing active or pending topic name is similar at ≥0.8 ratio. A `pending` TopicProposal record is created in DB, linked to the user. Returns 201 with the created proposal.

2. **Submit a proposal blocked by an active topic (similarity)**  
   Candidate name is similar (≥0.8 ratio) to an existing active topic name. Returns 409 `{"error": "too_similar", "matches": [{"name": "...", "type": "active"}]}` and no record is created.

3. **Submit a proposal blocked by a pending proposal (similarity)**  
   Candidate name is similar (≥0.8 ratio) to another user's pending topic proposal. Returns 409 with `type: "pending"` in matches. No record created.

4. **Submit a proposal blocked by exact match**  
   Candidate name is identical (case-insensitive, whitespace-collapsed) to an existing active or pending name. Blocked same as similarity — ratio 1.0 is covered by ≥0.8 threshold.

5. **Submit a duplicate of own pending proposal**  
   User already has a pending proposal "Sailing". Submitting "Sailing" again returns 409 `{"error": "already_pending", "proposalId": "..."}`. No duplicate created.

6. **Submit a proposal with empty/invalid name**  
   Name is empty or whitespace-only after trimming. Returns 400 `{"error": "invalid_name"}`.

7. **Submit a proposal similar to multiple entries**  
   Candidate name is similar to both an active topic AND a pending proposal. All above-threshold matches are returned in the `matches` array.

8. **View own topic proposals**  
   Authenticated user GETs `/me/topic-proposals`. Returns list of their own proposals with id, candidateName, status, createdAt.

9. **"My Topics" page shows proposal form and pending proposals**  
   GET `/me/topics` renders a "Propose a new Topic" text input + submit button. Below it, lists the user's own pending proposals (name + status). Proposal form submits via POST to `/topic-proposals` with CSRF token.

10. **Proposal submission integrates into "My Topics" page**  
    After a successful POST, the new pending proposal appears in the pending proposals list on `/me/topics`.

### Testable interfaces

- `src/topics/proposals.ts` — new module:
  - `computeSimilarity(a: string, b: string): number` — pure Levenshtein ratio (0–1)
  - `normalizeTopicName(name: string): string` — trim + collapse internal whitespace to single space + lowercase
  - `isSimilar(a: string, b: string): boolean` — true if normalized similarity ≥ 0.8
  - `findSimilarTopics(candidateName: string, repository: TopicCatalogueWithProposals): Promise<SimilarMatch[]>`
  - `createTopicProposal(userId: string, candidateName: string, repository: TopicProposalDbRepository): Promise<TopicProposal>`
  - `listUserTopicProposals(userId: string, repository: TopicProposalDbRepository): Promise<UserTopicProposal[]>`

- `app/topic-proposals/route.ts` — POST `/topic-proposals`
- `app/me/topic-proposals/route.ts` — GET `/me/topic-proposals`

- `app/me/topics/route.ts` — updated to render proposal form and user pending proposals list

### Assumptions / risks

- `fast-levenshtein` is a transitive dep (via graphile-worker). Risk: future graphile-worker drops it. Mitigation: add as direct dep in same PR.
- Threshold 0.8: calibrate with examples during TDD ("Sailing" vs "Sailng", "React" vs "React.js", "TypeScript" vs "Typescript")
- Normalization: trim leading/trailing whitespace, collapse internal runs of whitespace to single space, then lowercase
- Similarity check targets: all `status = 'active'` topics + all `status = 'pending'` topic proposals
- Proposal form uses existing HTML-form + CSRF pattern from `app/me/topics/route.ts`

### Test execution order (sandman-tdd)

1. `computeSimilarity` pure unit tests (red-green first)
2. `isSimilar` threshold boundary tests (exact 0.8, just above/below)
3. `normalizeTopicName` edge case tests (empty, whitespace, case)
4. `findSimilarTopics` with in-memory repository mock
5. `createTopicProposal` with in-memory repository mock (valid case)
6. `createTopicProposal` error paths (too similar, duplicate, invalid)
7. Route handler tests with mocked dependencies
8. HTML rendering in `me/topics/route.ts`

## Next Step

PR-Review (sandman-pr-review)

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
