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
- [x] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

PR-Review (sandman-pr-review)

## Plan
### Behaviors to test
- A magic-link failure screen for an expired invite link offers a safe "send a new link" action, while a malformed token still shows only a generic failure.
- A resend request uses the invite record as the source of truth, sends a fresh magic-link email to the invited email only, and advances persisted invite state so only the newest link can verify.
- After a resend, the prior unused magic-link token is rejected by verification.
- Repeated resend requests keep only the latest token valid, and the resend endpoint is rate-limited.

### Testable interfaces
- `createMagicLinkVerifyHandlers` should expose an error view that can carry a recoverable resend action for expired-but-parseable tokens.
- A new resend handler should accept only the original token/invite reference, resolve the invite from storage, and inject email delivery and rate-limiting dependencies.
- The invite persistence shape should include a resend generation or nonce that the token issuer embeds and the verifier compares.

### Assumptions / risks
- Invalid tokens remain generic because they cannot safely identify an invite.
- The resend path needs a small persistence migration and a matching verifier change; without both, old links cannot be invalidated safely.
- Repeated requests may still enqueue multiple emails, but only one token should remain valid at a time.
