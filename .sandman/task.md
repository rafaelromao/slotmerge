# Task

Implement GitHub issue #23: Sign in via magic link

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Auth & Invites](https://github.com/rafaelromao/slotmerge/issues/16). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

Clicking a valid, unused, unexpired magic link authenticates the recipient, creates a session, accepts the invite, and redirects into the app. Used or expired links produce a clear error screen.

## Acceptance criteria

- [ ] A valid magic link creates a session and accepts the invite.
- [ ] A used magic link is rejected on second use.
- [ ] An expired magic link is rejected.
- [ ] The error screen explains the failure and offers the next step (covered by the next ticket).
- [ ] Sessions have a defined lifetime and can be ended.

## Blocked by

- [Send invitation email with magic link](https://github.com/rafaelromao/slotmerge/issues/22)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/23-sign-in-via-magic-link`
- Source branch: `sandman/23-sign-in-via-magic-link`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/23-sign-in-via-magic-link` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

sandman-pr-review (PR #162)

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

## Plan

### Behaviors to test

1. **Valid magic link creates session and accepts invite**
   - Given a valid unexpired magic link token, pending invite, and matching email
   - When POST /auth/magic-link/verify is called
   - Then user is upserted (created with invite role if not exists), session is created, invite is marked accepted, session cookie is set, and redirect to app root `/`

2. **Used magic link is rejected on second use**
   - Given a magic link token whose invite is already accepted
   - When POST /auth/magic-link/verify is called
   - Then error page with "invite_already_accepted" reason

3. **Expired token is rejected**
   - Given a magic link token whose embedded expiresAt has passed
   - When POST /auth/magic-link/verify is called
   - Then error page with "token_expired" reason

4. **Expired invite is rejected**
   - Given a magic link token whose associated invite record has expiresAt in the past
   - When POST /auth/magic-link/verify is called
   - Then error page with "invite_expired" reason

5. **Invalid signature is rejected**
   - Given a magic link token with invalid HMAC signature
   - When POST /auth/magic-link/verify is called
   - Then error page with "invalid_token" reason

6. **Email mismatch is rejected**
   - Given a magic link token whose email does not match the invite's email
   - When POST /auth/magic-link/verify is called
   - Then error page with "email_mismatch" reason

7. **Non-existent invite is rejected**
   - Given a magic link token with non-existent inviteId
   - When POST /auth/magic-link/verify is called
   - Then error page with "invite_not_found" reason

### Testable interfaces

1. **`verifyMagicLinkToken(token, secret, clock?)`** in `src/auth/magic-link.ts`:
   - Parses `payload.signature` format, verifies HMAC, checks token-level expiration
   - Returns decoded payload or throws typed error (InvalidToken | TokenExpired)
   - Pure function, easily unit-tested

2. **`MagicLinkVerifyHandler`** factory in a new `src/auth/magic-link-verify.ts`:
   - `createMagicLinkVerifyHandlers({clock?, db?, tokenVerifier?})`
   - Returns `{GET, POST}` handlers
   - Encapsulates: token verification → invite lookup → email match check → invite expiration check → user upsert → session creation → invite acceptance → redirect
   - All dependencies injectable for tests

3. **`app/auth/magic-link/verify/route.ts`**:
   - Thin Next.js route that delegates to `MagicLinkVerifyHandler`
   - GET: renders confirmation page with auto-submitting form (prevents token in server logs/URLs)
   - POST: processes the verification

### Execution order (vertical slices)

**Slice 1 — Token verifier**
- Add `verifyMagicLinkToken` to `src/auth/magic-link.ts`
- Add unit tests in `src/auth/magic-link.test.ts`
- Verifies HMAC signature, parses payload, checks token expiration

**Slice 2 — Route + handler**
- Create `src/auth/magic-link-verify.ts` with handler factory
- Create `app/auth/magic-link/verify/route.ts` with GET (confirmation form) and POST handlers
- GET renders an auto-post form to POST with the token (security: keeps token out of URL logs)

**Slice 3 — Accept invite + create user + create session**
- When token valid + invite pending + email matches + invite not expired:
  1. Upsert user by email (create if not exists, role from invite; if exists, keep existing role)
  2. Create session record in DB with expiresAt (e.g., 30 days from now)
  3. Set session cookie via `sealSessionCookie`
  4. Update invite status to "accepted"
  5. Redirect to app root `/`

**Slice 4 — Error responses**
- For each failure mode, return HTML error page with error code
- Error screen UI (next ticket) will enhance these with better UX

### Key design decisions

- **GET form auto-submit**: GET with `?token=` in URL exposes token in server logs. Instead, GET renders a small HTML page with an auto-submitting form (method="POST", action includes token). Token only appears in POST body, not in server logs or browser URL bar.
- **User upsert role semantics**: If user already exists, their role is preserved (not overwritten by invite role). Invite role only applies to newly created users.
- **Session lifetime**: 30 days default (configurable). Already modeled in schema with `expiresAt`.
- **Invite vs token expiration**: Both checked — token's embedded `expiresAt` for quick rejection of forged tokens, invite record's `expiresAt` for actual business rule.

### Assumptions / risks

1. Token's `expiresAt` and invite's `expiresAt` are checked independently.
2. Redirect URL after success: app root `/`.
3. Error screen rendering: simple HTML error page now; enhanced by next ticket.
4. CSRF: magic link token serves as the secret; auto-submit form pattern prevents URL exposure.
