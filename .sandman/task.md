# Task

Implement GitHub issue #29: Self-delete account

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Profile & Setup](https://github.com/rafaelromao/slotmerge/issues/19). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

A User can self-delete their account. Personal profile, Availability, Topic associations, and Calendar Connection tokens are removed. Non-personal audit history (such as Admin actions on Topics) is preserved.

## Acceptance criteria

- [ ] User can trigger self-delete from `My availability`.
- [ ] Self-delete removes personal profile, Availability, and Calendar Connection tokens.
- [ ] Self-delete removes the user from Search eligibility.
- [ ] Audit history that does not require personal data is preserved.

## Blocked by

- [Edit profile attributes](https://github.com/rafaelromao/slotmerge/issues/27)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/29-self-delete-account`
- Source branch: `sandman/29-self-delete-account`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/29-self-delete-account` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

## Plan

### Behaviors to test

In execution order (tracer bullet first). Each slice asserts an observable outcome at the public boundary (`DELETE /me` HTTP route + repository override seam), not internal FK mechanics.

1. **`DELETE /me` requires authentication.** Without a valid session cookie, the endpoint responds with `401 { error: "unauthenticated" }` and no per-user lookup function is invoked.
2. **`DELETE /me` requires a matching CSRF token.** With a valid session but missing/mismatched `x-csrf-token`, the endpoint responds with `403 { error: "invalid_csrf" }` and no per-user lookup function is invoked.
3. **`DELETE /me` removes the authenticated User.** With a valid session and CSRF token, the endpoint invokes the profile repository's delete seam, then responds with `204` and a `Set-Cookie` header that clears the `slotmerge_session` cookie. After the call:
   - `getProfileByUserId(userId)` returns `null`.
   - `getTopicsByUserId(userId)`, `getAvailabilityWindowsByUserId(userId)`, and `getCalendarConnectionsByUserId(userId)` each return an empty list for that userId.
4. **Search eligibility is removed as a consequence of #3.** Because the user row no longer exists, no future query against `users` (or a join through it) can include them. The same observable check from slice #3 (the four lookup functions all return empty/null for that userId) is the proof at this boundary; Search itself is not yet implemented.
5. **Non-personal audit history is preserved.** When a User who has invited other Users (i.e., is referenced by `invites.invited_by_admin_id`) self-deletes, the resulting `invites` rows remain in the database. Concretely:
   - Before the test, seed: 1 inviter User (the deleter), 1 invite row referencing the inviter.
   - Invoke `DELETE /me` as the inviter.
   - Assert that the invite row count is unchanged AND the invite row's `invited_by_admin_id` is now `NULL` (the personal reference is dropped, the audit artifact — the email, role, status, timestamps — is preserved).
6. **Boundary idempotency.** If the user record is already gone when the request arrives (e.g., session cookie still valid in browser, but user already deleted by a concurrent request), the endpoint returns `404 { error: "user_not_found" }` rather than throwing. (Sessions are FK-cascaded with users, so the more common race is "session is gone", which short-circuits at `getSessionFromRequest` to `401`. We cover both branches.)

### Testable interfaces

We use the seam patterns already established in this repo (`setProfileRepositoryForTests`, `setSessionRepositoryForTests`). No new test-only abstractions.

- **`app/me/route.ts`** — add a `DELETE` handler in the same file as `GET`/`PATCH`, so the existing file-local `hasValidCsrfToken` helper is reusable. The handler:
  - Resolves session via `getSessionFromRequest`.
  - Validates CSRF token via the existing `hasValidCsrfToken`.
  - Calls `deleteProfileByUserId(session.user.id)` from the profile repository.
  - If the repository returns `null` (user not found), responds `404 { error: "user_not_found" }`.
  - Otherwise responds `204` with `Set-Cookie: slotmerge_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`.
- **`src/profile/repository.ts`** — extend the `ProfileRepository` interface with a new method `deleteByUserId(userId): Promise<boolean>`. The override hook (`setProfileRepositoryForTests`) already exists; tests plug a fake that flips a state bit and returns `true`. The DB implementation deletes from `users` and returns whether a row was affected.
- **Test fixtures** — the existing `getTopicsByUserId` / `getAvailabilityWindowsByUserId` / `getCalendarConnectionsByUserId` in `app/me/route.ts` are local placeholder functions returning empty arrays. We lift them behind a small module-level registry that a test helper can seed and reset, so a test can: (a) seed a topic/availability/calendar connection for `user-1`, (b) call `DELETE /me`, (c) assert those lookups return empty for `user-1`. Same pattern as the existing `setProfileStateForTests` helper at the top of `tests/me-route.test.ts`.
- **Drizzle migration** — add a new migration that changes the `invites.invited_by_admin_id` FK from `ON DELETE RESTRICT` to `ON DELETE SET NULL` and makes the column nullable. The migration filename will be the next free number in `drizzle/` (currently `0003_topics.sql` is the latest on `main`; the implementor will verify at execution time). The schema (`src/db/schema.ts`) is updated in the same change to match (`invitedByAdminId: uuid(...).references(() => users.id, { onDelete: "set null" })` and the column type made nullable). When `users` row is deleted, `invites.invited_by_admin_id` is set to `NULL`; the invite row (email, role, status, timestamps) stays — preserving non-personal audit history per spec §3.8 / §12.1.

### Assumptions / risks

- **AC #1 ("User can trigger self-delete from `My availability`") is partially delivered in this slice.** The MVP spec (`docs/mvp-spec.md` §7.1) defines the self-delete surface as `DELETE /me`. The "from My availability" UI affordance belongs to a downstream UI ticket in the Availability sub-PRD (no Availability page exists yet — `getAvailabilityWindowsByUserId` is a stub). For #29, this slice ships the API + repository behaviour; the UI affordance on the Availability page is tracked as a follow-up by the Availability sub-PRD owner. We will explicitly note this on the PR body so reviewers and the next ticket know.
- **Spec §10 audit-log requirement is deferred.** §10 mandates audit logging for self-delete events, but the codebase has no audit-log subscriber yet (the `email_events` table is for transactional email delivery, not audit). Emitting an audit row would require opening a parallel ticket to define the audit-log table and enqueue seam. For #29, the deletion itself is the audit artifact: the invites row stays, with the personal reference nulled. A follow-up ticket must add the audit-log pipeline; we will surface this gap in the PR body.
- **Availability is currently mocked.** There is no `availability_windows` table yet. The deletion of the `users` row covers `sessions`, `calendar_connections`, `topic_proposals`, `user_topics` via existing cascade FKs. When the Availability data model lands in a future ticket, the same `deleteByUserId` cascade will need to be extended; this is out of scope for #29.
- **Discoverability consent is mocked.** `me/route.ts` returns `discoverability: { consented: false }`. Removing the user removes them from Search eligibility by definition; no separate discoverability-table change is needed.
- **`invites.invited_by_admin_id` → `SET NULL`.** The PR #146 invite ticket (`Admin invites a User with email and role`) defines an invite flow but does not assert any runtime constraint about deleting an inviter with outstanding invites — the only thing protecting it today is the FK `RESTRICT`. Switching to `SET NULL` keeps the invite row intact (the non-personal email/role/status/timestamps are the audit artifact) and drops only the personal inviter reference, which matches the spec wording "non-personal audit references are preserved". We will note this trade-off in the PR body and reference this concern explicitly.
- **`204` vs `200`.** We pick `204 No Content` for `DELETE /me` — Next.js route handlers treat `Response(null, { status: 204 })` as the canonical DELETE response, the response includes the cookie-clearing `Set-Cookie` header (which `200` could also carry but is uncommon), and no body is required by the spec. The cookie-clearing header is the only signal the client needs.
- **Migration number.** Implementor will pick the next free number at execution time; do not hard-code in the plan.
- **`hasValidCsrfToken` is file-local.** Putting `DELETE` in `app/me/route.ts` keeps it reusable without extraction.
- **Sandbox / no real DB.** All assertions go through the override pattern; no live DB queries.

## Next Step

Run `sandman-tdd` against the plan above. First red test: `DELETE /me` rejects with `401` when no session is present.

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
