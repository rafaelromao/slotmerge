# Task

Implement GitHub issue #41: Send critical Admin operational email

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Admin & Notifications](https://github.com/rafaelromao/slotmerge/issues/18). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

Critical operational issues, such as broad provider sync failures or transactional email delivery failures, trigger email to all Admins through the transactional email delivery service.

## Acceptance criteria

- [ ] Critical operational events trigger Admin emails.
- [ ] Email delivery state is recorded.
- [ ] Repeat events within a short window do not spam Admins.

## Blocked by

- [Provision transactional email delivery and email event log](https://github.com/rafaelromao/slotmerge/issues/26)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/41-send-critical-admin-operational-email`
- Source branch: `sandman/41-send-critical-admin-operational-email`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/41-send-critical-admin-operational-email` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Plan
### Behaviors to test (vertical red-green ordering)

1. **Empty admin list is a no-op.** With zero active admins returned by the directory, `triggerAdminCriticalEmail` returns without throwing and without invoking the email delivery service.
2. **Trigger queues an admin-critical email per active admin.** Given an active-admin list of N admins and an empty dedup history, `triggerAdminCriticalEmail` invokes the email delivery service N times with `type: "admin-critical"`, each admin's email as the recipient, and a payload containing the operational event details (`kind`, `summary`, `occurredAt`, plus any event-specific details).
3. **Suspended and non-admin users are skipped.** `triggerAdminCriticalEmail` only delivers to users with `role === "admin"` AND `status === "active"`. The directory dependency is the single seam for that filter.
4. **Repeat events within a short window are deduplicated per event kind.** Given a prior dispatch of the same kind within the dedup window, `triggerAdminCriticalEmail` invokes the delivery service zero times. Given a prior dispatch older than the window (or a different kind), the dispatch still fires.
5. **The dedup path performs no state writes.** When the dedup window short-circuits the dispatch, the function does not invoke the email delivery service (no email event row is created).
6. **Email delivery failure does not throw to the caller.** If queueing one admin's email fails (the existing delivery service throws after marking the event failed), the trigger records the per-recipient failure and continues for the remaining admins so a single bad recipient does not block the alert. The function returns a per-recipient result array.
7. **Existing email delivery state recording is reused.** No new persistence is required for state — the existing `emailEvents` / `emailEventAttempts` rows from the email delivery service serve as both the recorded delivery state and the dedup source of truth. (Verified by reading `service.ts:84-91`: `createQueuedEvent` is the recording step.)

### Testable interfaces / seams

- New module: `src/admin/critical-email.ts` exporting `triggerAdminCriticalEmail(input, deps)`. Dependency interface:
  - `clock?: () => Date`
  - `adminDirectory: { listActiveAdmins(): Promise<Array<{ id: string; email: string }>> }`
  - `emailDeliveryService: { sendEmail(input: { recipient; type; payload }): Promise<{ emailEvent }> }`
  - `lastDispatchLookup: { findMostRecentKindDispatch(kind: string, since: Date): Promise<Date | null> }`
  - `dedupWindowMs?: number` (default `15 * 60 * 1000`)
  - `now?: () => Date` (alias for `clock` to make intent clear at the call site)
- Pure helpers exported for direct unit testing:
  - `createOperationalEvent({ kind, summary, occurredAt, details? })` — validates/normalises the event shape used in the payload.
  - `createKindDedupReference(kind: string)` — SHA-256 of `{ kind }` JSON; used both as the dedup lookup key and as a `payloadReference` argument so the existing `emailEvents.payload_reference` column serves as the dedup index without migration.
  - `isCriticalEmailType(type)` — narrows `"admin-critical"` for the delivery service contract.
- Postgres-backed implementations (wired only when the trigger is used from a real DB context — production wiring is out of scope for this ticket):
  - `createPostgresAdminDirectory(db = getDb())` — `SELECT id, email FROM users WHERE role = 'admin' AND status = 'active' ORDER BY email`.
  - `createPostgresAdminCriticalDispatchLookup(db = getDb())` — `SELECT created_at FROM email_events WHERE type = 'admin-critical' AND payload_reference = $1 AND created_at >= $2 ORDER BY created_at DESC LIMIT 1`.
- New unit test file: `src/admin/critical-email.test.ts` — covers all seven behaviors with stubbed dependencies (no DB).

### Assumptions / risks

- "Short window" is interpreted as **15 minutes**, exposed as `dedupWindowMs` so tests can pin it to e.g. `1000` ms.
- Dedup is keyed by the event `kind` string. Two operational issues with different kinds each get their own alert.
- The `payloadReference` written by the delivery service for `admin-critical` events is derived from `{ kind }` (not from the full event payload) so the dedup lookup can match rows purely on `payload_reference`. The full event details (summary, occurredAt, details) ride inside the delivery `payload` and are written to the worker logs / Postmark transport, not indexed in the DB. No schema migration is required.
- Behavior 5 (no writes on dedup) is implicit but called out explicitly so the test pins it.
- Risk: the `emailEvents.payload_reference` column will, going forward, exclusively hold dedup keys for `admin-critical` rows. This ticket does not introduce prior data, but any future caller must respect the same convention; comment this in the module.
- Risk: the deliverability service throws when queueing fails. The trigger must isolate per-recipient failures so one bad recipient does not block the rest (covered by behavior 6).

## Next Step

PR created: https://github.com/rafaelromao/slotmerge/pull/156 — run `sandman-pr-review` to delegate review to the PR Review Agent.

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
