# Task

Implement GitHub issue #22: Send invitation email with magic link

## Issue Context

## Parent

Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

When an Admin invite POST persists, dispatch an invitation email through the existing email delivery service with a signed magic-link URL tied to the invite id, email, role, and expiration.

## Acceptance criteria

- [ ] Admin invite POST persists an invitation and queues a magic-link invitation email
- [ ] Magic link is URL-safe, time-bound, signed with HMAC, expiration encoded in the URL
- [ ] Email payload is built from the actual persisted invite row (id, email, role, expiresAt)
- [ ] Fail fast when MAGIC_LINK_SECRET is missing in non-test runtime
- [ ] Clock is injectable for deterministic expiresAt in tests
- [ ] The invite handler does not import graphile-worker directly (wraps in enqueueInviteEmailJob)

## Blocked by

- [Provision app shell, auth, and Postgres bootstrap](https://github.com/rafaelromao/slotmerge/issues/20) — CLOSED

## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/22-send-invitation-email-with-magic-link`
- Source branch: `sandman/22-send-invitation-email-with-magic-link`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/22-send-invitation-email-with-magic-link` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [x] Implement (sandman-implement: TDD + commits 996048a, e30c4a7, 81e5753 landed, full suite 67 tests green, typecheck/lint/format clean)
- [x] Back-merge (origin/main merged into current branch; commit e7dd54f; PR #153 MERGEABLE)
- [x] Self-review fixes for review feedback (commit cf8d25c; MAGIC_LINK_SECRET and APP_BASE_URL registered in loadRuntimeConfig)
- [ ] PR-Review (sandman-pr-review) — re-requesting after self-review fix
- [ ] PR-Merge (sandman-pr-merge)

## Plan

### Behaviors to test

- Admin invite POST persists the invite and queues an invitation email through the email delivery service
- Magic link is signed (HMAC-SHA256), URL-safe, time-bound, with expiration encoded in the URL
- createInvite returns the persisted row so the email payload uses real id/email/role/expiresAt
- Handler resolves MAGIC_LINK_SECRET at issue time (not construction) so the Next.js build can collect page data without it
- enqueueInviteEmailJob wraps graphile-worker so the handler does not import it directly
- MAGIC_LINK_SECRET and APP_BASE_URL are validated at boot via loadRuntimeConfig in non-local mode

### Implementation status

- 996048a: feat — initial implementation
- e30c4a7: refactor — self-review fixes (HMAC, drop verify endpoint, static imports)
- 81e5753: fix — defer MAGIC_LINK_SECRET resolution to first issue
- e7dd54f: chore — merge origin/main into branch (resolve CONFLICTING)
- cf8d25c: refactor — register MAGIC_LINK_SECRET and APP_BASE_URL in loadRuntimeConfig

## Next Step

Wait for CI to pass on cf8d25c, then poll for new review feedback. Last reviewer response was CHANGES_REQUESTED (Important: MAGIC_LINK_SECRET not in envSchema). All findings addressed in cf8d25c.
