# Task

Implement GitHub issue #48: Reconcile Calendar Connection sync and process webhook events

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Calendar Connections](https://github.com/rafaelromao/slotmerge/issues/17). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

Calendar Connection sync runs as a background job: provider webhooks update intervals promptly, scheduled reconciliation fills gaps, and transient failures use exponential backoff and provider `Retry-After` semantics. Quota handling avoids spikes.

## Acceptance criteria

- [ ] Provider webhook events update imported busy intervals.
- [ ] Scheduled reconciliation refreshes the rolling 90-day window.
- [ ] Transient failures use exponential backoff and `Retry-After`.
- [ ] Quotas are respected via randomized traffic patterns.
- [ ] Sync errors update Calendar Connection status.

## Blocked by

- [Persist normalized imported busy intervals for the rolling 90-day window](https://github.com/rafaelromao/slotmerge/issues/47)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/48-reconcile-calendar-connection-sync-and-process-webhook-events`
- Source branch: `sandman/48-reconcile-calendar-connection-sync-and-process-webhook-events`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/48-reconcile-calendar-connection-sync-and-process-webhook-events` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Plan

### Behaviors to test

1. **Google webhook handler validates and processes calendar notifications** — Given a valid Google calendar webhook payload with proper signature, the handler enqueues a sync job for the affected calendar connection.

2. **Microsoft webhook validation token round-trip** — Given a Microsoft webhook POST with a `Validationtoken` query param, the handler responds with `200 OK` and the raw token as `text/plain` per the Graph subscription validation spec.

3. **Microsoft webhook handler validates and processes calendar notifications** — Given a valid Microsoft calendar webhook notification (not validation), the handler enqueues a sync job for the affected calendar connection.

4. **Webhook for disconnected connection is a no-op** — Given a webhook notification for a calendar connection with status `disconnected`, no sync job is enqueued.

5. **Calendar sync job fetches free/busy from Google API and stores intervals** — Given a connected Google Calendar Connection, the sync job uses the access token to call Google's FreeBusy API, converts busy blocks to `ImportedBusyIntervalRecord`s, and upserts them via the repository.

6. **Calendar sync job fetches free/busy from Microsoft API and stores intervals** — Given a connected Microsoft Calendar Connection, the sync job uses the access token to call Microsoft Graph's `me/calendar/getSchedule`, converts busy blocks to `ImportedBusyIntervalRecord`s, and upserts them via the repository.

7. **Sync failures record error metadata and update connection status** — Given a sync job that fails with a transient error, the failure is recorded via `recordCalendarConnectionSyncFailure` and the connection's `lastErrorCode`/`lastErrorMessage` are updated.

8. **Transient failures use exponential backoff with Retry-After** — Given a sync job that receives a 429 or 503 response with a `Retry-After` header, the job re-enqueues itself with exponential backoff starting at twice the `Retry-After` value.

9. **Quota errors apply jittered backoff to avoid traffic spikes** — Given a sync job that receives a 429 response without a `Retry-After` header (generic rate limit), the job re-enqueues itself with a random jitter between 30s and 120s.

10. **Scheduled reconciliation enqueues sync jobs for all connected calendar connections** — Given at least one connected calendar connection, the reconciliation scheduler enqueues a sync job for each with a random stagger delay (0–60s) to avoid spikes.

### Testable interfaces

1. **`src/calendar/sync-jobs.ts`** — Calendar sync job handlers for Graphile Worker:
   - `calendarSyncTaskName: string`
   - `handleCalendarSyncJob(payload: { connectionId: string })` — fetches free/busy, stores intervals, handles errors/backoff
   - `enqueueCalendarSync(connectionId: string, backoffMs?: number)` — enqueues sync job with optional backoff (injected for tests)

2. **`src/calendar/webhook-handlers.ts`** — Webhook handlers for provider notifications:
   - `handleGoogleCalendarWebhook(payload: unknown, signature: string, secret: string)` — validates Google signature, returns connectionId or throws
   - `handleMicrosoftCalendarValidationWebhook(validationToken: string)` — returns `200 OK` with raw token
   - `handleMicrosoftCalendarWebhook(payload: unknown)` — parses notification payload, returns connectionId or throws

3. **`src/calendar/reconciliation-scheduler.ts`** — Reconciliation scheduling:
   - `reconciliationTaskName: string`
   - `handleReconciliationJob(payload: unknown)` — finds all connected calendar connections and enqueues sync jobs with stagger

4. **`src/calendar/sync-failure-recorder.ts`** (existing) — Already exists with `recordCalendarConnectionSyncFailure`. No interface changes needed.

5. **`src/worker/run.ts`** (modified) — Registers `calendarSyncTaskName` and `reconciliationTaskName` in the task list.

### Assumptions / risks

- Google webhook notifications arrive as POST to `/webhooks/google/calendar` with `Google-Channel-ID`, `Google-Message-ID`, and `Google-RESOURCE-ID` headers plus a JSON body.
- Microsoft webhook notifications arrive as POST to `/webhooks/microsoft/calendar` with `Validationtoken` (for subscription validation), `X-MS-WEBHOOK-TYPE` (notification), and `X-MS-WEBHOOK-SIGNATURE` headers.
- Microsoft validation token response must echo back the token as `200 OK text/plain` per Graph spec.
- Google FreeBusy API: `POST https://www.googleapis.com/calendar/v3/freeBusy` with `timeMin`, `timeMax`, `items`.
- Microsoft Graph: `POST https://graph.microsoft.com/v1.0/me/calendar/getSchedule` with `schedules`, `startTime`, `endTime`.
- Token refresh is NOT in scope for this issue; assume valid access tokens exist.
- The 90-day rolling window enforcement is already in `isWithinRollingWindow()` and `upsertBatch()` filters accordingly.
- Webhook routes are defined in the spec but NOT yet created in `app/webhooks/`.
- `upsertBatch` already deletes existing intervals for a connection before inserting (issue #47), so no explicit delete step needed in sync.
- Only `connected` status connections are synced; `pending` and `disconnected` are skipped.

## Next Step

Implement (sandman-implement: execute TDD via sandman-tdd, commit, self-review, back-merge, create PR, delegate review)

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
