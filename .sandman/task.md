# Task

Implement GitHub issue #43: OAuth-connect Google Calendar with free/busy-only scopes

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Calendar Connections](https://github.com/rafaelromao/slotmerge/issues/17). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

A user can authorize Google Calendar via the narrowest free/busy OAuth scopes. The resulting refresh/access tokens are stored encrypted, and connection status (provider, account identifier, scopes, status) is stored in plain columns. No calendar event metadata is requested or stored.

## Acceptance criteria

- [ ] OAuth flow uses `calendar.freebusy` or `calendar.events.freebusy` only.
- [ ] Tokens are encrypted at rest; status metadata is queryable.
- [ ] No event titles, attendees, descriptions, or locations are requested or stored.
- [ ] Disconnect from the consent screen revokes tokens.

## Blocked by

- [Provision app shell, auth, and Postgres bootstrap](https://github.com/rafaelromao/slotmerge/issues/20)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/43-oauth-connect-google-calendar-with-freebusy-only-scopes`
- Source branch: `sandman/43-oauth-connect-google-calendar-with-freebusy-only-scopes`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/43-oauth-connect-google-calendar-with-freebusy-only-scopes` when the run finishes. Do not switch to `main` or any other branch before exiting.

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

### Behaviors to test
- A Google Calendar connect request creates a consent URL that uses `calendar.freebusy` (or the exact fallback `calendar.events.freebusy`) and a single fixed redirect URI, without requesting `openid`, `email`, `profile`, or any calendar write scope.
- The callback route accepts only the fixed redirect path, validates state and PKCE, exchanges the code for tokens, and persists encrypted refresh/access tokens plus plain provider, opaque account identifier, scopes, and status metadata.
- The connect flow never calls a Google identity/userinfo endpoint and never requests or stores event titles, attendees, descriptions, or locations.
- Disconnect revokes the stored refresh token, updates connection status, and leaves queryable plain metadata intact.
- The user-facing connection read surface returns status metadata without exposing token material or calendar event data.

### Testable interfaces
- A small Google OAuth service that accepts injected HTTP clients, clock/state helpers, and token-encryption helpers so redirect building, callback handling, and revocation can be tested without live Google calls.
- A calendar-connection repository that stores plain metadata columns separately from encrypted token columns.
- Fixed route handlers for connect, callback, disconnect, and connection listing that only orchestrate the service/repository boundaries.

### Assumptions / risks
- Google free/busy scopes do not provide a verified Google account email or subject, so the account identifier will be an opaque internal/provider key rather than identity-scoped profile data.
- The fixed callback path from the deployment notes is authoritative, so state must carry the connection ID and CSRF data instead of encoding the connection ID in the URL.
- If Google rejects the narrower freebusy scope in practice, the exact fallback scope is `calendar.events.freebusy`; no broader scope is acceptable.
