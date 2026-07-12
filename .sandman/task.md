# Task

Implement GitHub issue #24: Request new magic link after invalid or expired link

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Auth & Invites](https://github.com/rafaelromao/slotmerge/issues/16). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

From the magic-link error screen, a user requests a fresh magic link. The prior unused link is invalidated, and the new link is sent only to the email associated with the original invite.

## Acceptance criteria

- [ ] The error screen offers a "send a new link" action.
- [ ] The prior unused magic link is invalidated.
- [ ] A new magic-link email is sent to the invited email only.
- [ ] Repeated requests do not silently spawn multiple valid links.

## Blocked by

- [Sign in via magic link](https://github.com/rafaelromao/slotmerge/issues/23)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/24-request-new-magic-link-after-invalid-or-expired-link`
- Source branch: `sandman/24-request-new-magic-link-after-invalid-or-expired-link`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/24-request-new-magic-link-after-invalid-or-expired-link` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)

## Plan

### Behaviors to test (TDD tracer bullets, in execution order)

1. **Error page shows "request new link" button for retryable errors** — GET /auth/magic-link/verify renders a form with a "request new link" action (POST /auth/magic-link/resend, token as hidden field) when the error reason is one of the retryable set: `token_expired`, `invalid_token`, `invite_not_found`, `invite_expired`, `email_mismatch`. Non-retryable errors (`invite_already_accepted`, `invite_revoked`) do NOT show the button.

2. **Resend invalidates the old link** — POST /auth/magic-link/resend with a valid HMAC-signed token marks the associated pending invite as "revoked" (the old token's inviteId now resolves to a revoked invite, making the old token unusable for login).

3. **Resend creates a new pending invite and emails new magic link** — After revoking the old invite, the resend handler creates a new pending invite (same email, fresh `expiresAt`, role from the revoked invite) and calls `emailDeliveryService.sendEmail` with the new magic link URL, recipient = invited email only.

4. **Repeated resend requests do not spawn multiple valid links** — `resendInvite` on `InviteRepository` atomically revokes the existing pending invite before inserting the new one, ensuring exactly one pending invite per email at all times.

5. **Resend fails for non-retryable invite states** — POST /auth/magic-link/resend with a token whose invite is already `accepted` or `revoked` returns a non-retryable error page without creating a new invite or sending email.

6. **Resend fails gracefully for invalid/malformed tokens** — POST /auth/magic-link/resend with a token that fails HMAC verification returns `invalid_token` error page; the token payload is not decoded beyond the HMAC check.

7. **Resend succeeds with 200 confirmation HTML** — A valid token whose invite is still `pending` (and not expired per DB record) results in a new magic-link email being queued and a 200 HTML page confirming the email was sent.

### Testable interfaces

- **`MagicLinkResendDependencies`** — deps for the resend handler: `clock`, `magicLinkSecret`, `baseUrl`, `inviteRepository` (with the new `resendInvite` method below), `magicLinkTokenIssuer`, `emailDeliveryService`.
- **`InviteRepository` extended with**:
  - `resendInvite(email: string, role: string, newExpiresAt: Date): Promise<{ id: string; email: string; role: string; expiresAt: Date }>` — atomically: (a) finds and revokes the existing pending invite for `email` (if any), (b) inserts a new pending invite for `email`, (c) returns the new invite record.
- **`emailDeliveryService.sendEmail`** — already exists; mocked in tests using the same pattern as `admin/invites.test.ts`.
- **`createMagicLinkTokenIssuer`** — already exists; `issueMagicLinkToken({ inviteId, email, expiresAt })` called with the new invite record.

### Implementation slices (tests FIRST, then implementation)

1. **Tests (red):** Write `src/auth/magic-link-resend.test.ts` with all 7 behavior tests above. Use the same mock factory pattern as `magic-link-verify.test.ts`. Mock `inviteRepository`, `emailDeliveryService`, `magicLinkTokenIssuer`.

2. **Interface:** Add `resendInvite` to `InviteRepository` type in `src/auth/magic-link-verify.ts`.

3. **Resend handler:** Add `createMagicLinkResendHandler(deps)` to `src/auth/magic-link-verify.ts` that implements POST logic: decodes token without expiry check (reuse the existing `verifyMagicLinkToken` signature-check logic inline), looks up invite, validates state, calls `inviteRepository.resendInvite`, issues new token, sends email.

4. **Route:** Create `app/auth/magic-link/resend/route.ts` with `POST = (r) => createMagicLinkResendHandler()(r)`.

5. **Error page update:** Modify `errorResponse` in `magic-link-verify.ts` to accept a `retryable` flag and optionally render the resend form.

6. **Default impl:** Implement `resendInvite` in `defaultInviteRepository` using a DB transaction (revoke old → insert new, both in same tx). `invitedByAdminId` set to `null` for resend invites (not needed for magic-link auth).

### Assumptions / risks

- Token expiry in the signed payload is NOT the source of truth for link validity — the `invites.expires_at` DB column is. This allows resending even when the token has expired but the invite record itself has not.
- HMAC signature check is sufficient to authenticate a resend request; no separate auth token needed since the magic link token itself proves the user received the original email at the correct address.
- `invitedByAdminId` is `NULL` for resend invites — this field is not used in the magic-link verify flow, only stored for audit purposes.
- The `resendInvite` transaction is atomic — if email sending fails after the new invite is committed, the old invite remains revoked (acceptable per the "at-least-once" delivery model of the email queue).
- No new DB migration needed — existing `status = 'revoked'` enum value and `gen_random_uuid()` for new invite id are sufficient.
- Rate limiting is out of scope for this issue (per issue comments, will be addressed separately).

### Codebase conventions

- `escapeHtml` helper from `magic-link-verify.ts` reused for resend form HTML.
- Same `vi.fn()` mock factory pattern as `magic-link-verify.test.ts`.
- `emailDeliveryService.sendEmail` with `enqueueInviteEmailJob` from `admin/invites.ts`.
- `createMagicLinkTokenIssuer` with `loadRuntimeConfig` for default `baseUrl` and `secret`.

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
