# Task

Implement GitHub issue #42: Send Calendar Connection action-required email

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Admin & Notifications](https://github.com/rafaelromao/slotmerge/issues/18). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

When a user's Calendar Connection enters an action-required state (token revoked, reconnect needed, persistent sync failure), the system sends an email to the affected user with a clear next step.

## Acceptance criteria

- [ ] Token revocation triggers a reconnect email.
- [ ] Persistent sync failure triggers an action-required email.
- [ ] Email includes a link to the Calendar Connection page.
- [ ] Email delivery state is recorded.

## Blocked by

- [Provision transactional email delivery and email event log](https://github.com/rafaelromao/slotmerge/issues/26)
- [Encrypt Calendar Connection OAuth tokens at rest](https://github.com/rafaelromao/slotmerge/issues/45)


## Runtime Context

## Plan

Issue #42 sends a transactional email to a User whenever their Calendar Connection enters an action-required state (token revoked, persistent sync failure). Delivery state must be recorded through the existing single Email delivery service module (`src/email/service.ts`).

### Pre-flight

- [x] `gh issue view 42` confirms issue is OPEN with 4 acceptance criteria.
- [x] Both blockers (`#26`, `#45`) are CLOSED.
- [x] `origin/main` is up to date and the branch is an ancestor of `origin/main`.
- [x] No open PR for the current branch.
- [x] No existing implementation in `origin/main` matches the acceptance criteria.

### Subagent review summary

Subagent reviewed the initial plan and produced four concrete revisions, all adopted here:

1. **Ownership check on revoke route.** Before wiring the email, ensure `app/me/calendar-connections/[id]/route.ts` rejects requests where `found.record.userId !== session.user.id`. Otherwise any logged-in user could disconnect someone else's connection and trigger an email to a third party.
2. **Sync-failure wiring is internal, not a new POST route.** The spec's API surface (`docs/mvp-spec.md:282-287`) does not list a `POST .../sync-failure` endpoint, and the trigger origin is the sync engine, not the user. Expose `recordCalendarConnectionSyncFailure(connectionId, error)` as an internal function in `src/calendar/repository.ts` that calls the trigger module. The actual sync engine is a separate issue.
3. **Drop `lastSyncAt` / drop the transport-rendering slice.** The transport already stringifies the payload. Put `reconnectUrl` in the payload so it appears in the body without touching `src/email/transport.ts`.
4. **Use the real `EmailDeliveryService` type, not a narrowed one.** Mirror the singleton + test-override pattern used by `getGoogleCalendarConnectionRepository` (`src/calendar/repository.ts:30-38`).

### Tracer bullet

End-to-end flow that exercises every layer:

1. Connection's revoke or sync-failure entry-point calls the action-required trigger module with `(connectionId, reason, user.email)`.
2. Trigger module looks up a prior dispatch (Postgres), dedups if within window, otherwise builds the payload (including `reconnectUrl`) and hands it to the singleton `EmailDeliveryService`.
3. `EmailDeliveryService` records the `EmailEvent` (delivery state), enqueues the worker, the worker renders the body (which now includes the `reconnectUrl`), and the transport sends it.

### Behaviors to test (vertical slices)

**Slice 1 — schema migration (`drizzle/0006_calendar_connection_sync_failure.sql` + `src/db/schema.ts`)**
- Adds nullable `last_error_code` / `last_error_message` columns to `calendar_connections`.
- Drizzle schema and `findById`/`listByUserId`/`updateById` selects include the new columns.

**Slice 2 — action-required trigger module (`src/calendar/action-required-email.ts`)**
- For `token-revoked` and `sync-failure` reasons, calls `emailDeliveryService.sendEmail` exactly once with `type: "calendar-action-required"`, the user email as recipient, a payload containing `connectionId`, `provider`, `reason`, `reconnectUrl`, `occurredAt` (ISO), and a deterministic `payloadReference` derived from `(connectionId, reason)`.
- Skips dispatch when `findMostRecentConnectionDispatch(connectionId, reason, since)` returns a non-null timestamp inside the dedup window.
- Returns `{ status: "sent" | "skipped", emailEventId?: string }`.
- Uses `dedupWindowMs` from deps with a default of 60 minutes (twice admin-critical's 15-minute window because user-initiated `token-revoked` should not re-fire on every page reload, and `sync-failure` should not re-fire while a previous one is being acted on).
- Reuses `EmailDeliveryService` from `src/email/service.ts` directly (not a narrowed duplicate).

**Slice 3 — dispatch lookup repository (`src/calendar/action-required-email.repository.ts`)**
- Postgres-backed `findMostRecentConnectionDispatch(connectionId, reason, since)` mirrors `createPostgresAdminCriticalDispatchLookup` (`src/admin/critical-email.repository.ts:29-51`).
- `createConnectionActionRequiredDedupReference(connectionId, reason)` returns a pure-function SHA-256 hash of `{"connectionId","reason"}` (mirrors `createKindDedupReference` in `src/admin/critical-email.ts:66-68`).
- Repository is wired through a `setConnectionActionRequiredDispatchLookupForTests` test override (mirrors the calendar repository pattern at `src/calendar/repository.ts:18-28`).

**Slice 4 — singleton accessor for the email delivery service (`src/email/service.ts` / new factory)**
- Add `getEmailDeliveryService()` that constructs a default `EmailDeliveryService` backed by the Postgres repository + Graphile enqueue, plus `setEmailDeliveryServiceForTests(...)` for the route tests.
- Mirror the existing `getGoogleCalendarConnectionRepository` / `setGoogleCalendarConnectionRepositoryForTests` pattern (`src/calendar/repository.ts:18-38`).

**Slice 5 — ownership check + wire revoke routes (`app/me/calendar-connections/[id]/route.ts`)**
- After `findCalendarConnectionById(expectedId)`, return 404 if `found.record.userId !== session.user.id`.
- After a successful revoke (Google or Microsoft), call `triggerCalendarActionRequiredEmail` with `{ connectionId, provider, reason: "token-revoked", user: { id, email } }`.
- The revoke HTTP response stays 200 even if the email enqueue fails (email failures are observable through the `email_events` table, not the HTTP response).
- The trigger is awaited only long enough to record the `EmailEvent`; the actual send runs in the worker. The route never blocks the HTTP response on transport success.

**Slice 6 — internal sync-failure recorder (`src/calendar/repository.ts` + `src/calendar/action-required-email.ts`)**
- Add `recordCalendarConnectionSyncFailure(connectionId, { code, message })` that updates `last_error_code`, `last_error_message`, and `updated_at` on the row.
- The recorder calls `triggerCalendarActionRequiredEmail` with `reason: "sync-failure"` after the update succeeds.
- Connection status stays `connected` while the error columns are populated. The follow-up `needs-reconnect` status value (per `docs/mvp-spec.md:143`) is filed as a separate issue and explicitly tracked in the slice description below.

### Out of scope

- The actual sync engine, webhooks, and reconciliation scheduler — separate issues.
- A user-callable POST `/me/calendar-connections/{id}/sync-failure` route — the spec API surface (`docs/mvp-spec.md:282-287`) does not list it; the trigger origin is the sync engine, not the user. The internal recorder is the slice boundary.
- Changing the connection status enum to include `needs-reconnect`. Today's schema has only `pending`/`connected`/`disconnected`. The spec calls for `needs reconnect` (`docs/mvp-spec.md:143`) and that belongs in a follow-up issue, not this one. The current slice writes error columns on a still-`connected` row and is honest about that limitation.
- A proper HTML email template — the existing transport JSON-stringifies the payload (`src/email/transport.ts:69-75`), so a `reconnectUrl` field in the payload is enough to satisfy "Email includes a link to the Calendar Connection page" (`docs/mvp-spec.md:435`). A real HTML template is a separate slice.
- Sending a real email in tests — `EMAIL_ADAPTER=mock` returns `mock-<eventId>` for any `EmailTransport.send`.

### Schema additions

- `calendar_connections.last_error_code` (text, nullable)
- `calendar_connections.last_error_message` (text, nullable)
- No enum change in this issue (deferred; see "Out of scope").

### Risks

- The spec calls for a `needs-reconnect` status value (`docs/mvp-spec.md:143`) that the current schema does not have. This issue records the failure via columns, not status, and explicitly defers the enum change to a follow-up. The trigger module is structured so a future status change will not require changes to email logic.
- The revoke route currently does not check ownership. Without that fix, an authenticated user could disconnect someone else's connection and trigger an email to a third party. Slice 5 ships the ownership check as part of the same change so we never ship the email wiring without it.
- Dedup window default (60 min) is twice the admin-critical window (15 min). This is intentional: the recipient is the user (not an admin) and a re-trigger while the previous email is still likely unread would be noise. If product feedback says otherwise, the dedup window is a single constant.

### Subagent review

A subagent reviewed the first draft and produced four revisions, all adopted above. Plan consensus reached.

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/42-send-calendar-connection-action-required-email`
- Source branch: `sandman/42-send-calendar-connection-action-required-email`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/42-send-calendar-connection-action-required-email` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch (`sandman/42-send-calendar-connection-action-required-email` created from `main`).
- [x] Plan (sandman-plan) — drafted above, subagent reviewed, consensus reached on four revisions (ownership check, internal recorder not new route, drop transport slice, use real `EmailDeliveryService` type).
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

Implement the plan via vertical-slice TDD: schema migration → trigger module → dispatch lookup repository → email delivery service accessor → ownership check + revoke wiring → sync-failure recorder. One commit per slice.

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
