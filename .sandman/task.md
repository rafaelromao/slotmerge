# Task

Implement GitHub issue #44: OAuth-connect Microsoft work/school calendar with Calendars.ReadBasic

## Issue Context

## Parent

Sub-PRD: [Sub-PRD: Calendar Connections](https://github.com/rafaelromao/slotmerge/issues/17). Top-level PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

A user can authorize a Microsoft work/school calendar using delegated `Calendars.ReadBasic`. Microsoft personal account attempts produce a clear "not supported" message. Tokens are encrypted; connection status is queryable.

## Acceptance criteria

- [ ] Microsoft auth uses `Calendars.ReadBasic` for work/school accounts.
- [ ] Personal Microsoft accounts surface a clear "not supported" message.
- [ ] Tokens are encrypted at rest; status metadata is queryable.
- [ ] Disconnect revokes tokens.

## Blocked by

- [OAuth-connect Google Calendar with free/busy-only scopes](https://github.com/rafaelromao/slotmerge/issues/43)


## Runtime Context

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/44-oauth-connect-microsoft-workschool-calendar-with-calendarsreadbasic`
- Source branch: `sandman/44-oauth-connect-microsoft-workschool-calendar-with-calendarsreadbasic`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/44-oauth-connect-microsoft-workschool-calendar-with-calendarsreadbasic` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

Execute the vertical slices in the Plan below via sandman-tdd (one test → one implementation per slice, commit at the end of each slice). After all slices pass, run self-review, back-merge main into the branch, create PR with `Closes #44` body, and delegate review via sandman-pr-review.

## Plan

### Behaviors to test

- **`/me/calendar-connections/microsoft/connect` POST**: Authenticated user with a valid CSRF token can start a Microsoft work/school OAuth flow. The start function creates a `pending` Calendar Connection with `provider = "microsoft"`, scopes including `Calendars.ReadBasic`, and returns an authorization URL pointing at the Microsoft identity platform (`login.microsoftonline.com`) that requests `Calendars.ReadBasic`, includes the offline_access prompt for refresh tokens, sets PKCE S256 code challenge, encodes a sealed `state` payload (connectionId + csrf + codeVerifier), and targets the existing `/me/calendar-connections/callback` redirect URI. Returns 401 unauthenticated, 403 invalid CSRF, 500 when Microsoft OAuth env is missing.
- **`completeMicrosoftCalendarConnection`**: Given a sealed `state`, the connection is loaded by ID, validated as pending, the authorization code is exchanged at the Microsoft token endpoint using PKCE, the resulting `access_token`, `refresh_token`, and `expires_in` are encrypted-at-rest using the same `encryptCalendarToken` module Google uses, the connection is updated to `connected` with opaque plain metadata (accountIdentifier, providerAccountKey, scopes), and the refreshed Calendar Connection is returned. Throws on token endpoint failure.
- **`revokeMicrosoftCalendarConnection`**: Given an existing connected Microsoft Calendar Connection, the encrypted refresh token is decrypted and revoked at the Microsoft logout endpoint (`https://login.microsoftonline.com/{tenant}/oauth2/v2.0/logout` style, or the canonical revoke endpoint documented for Microsoft identity platform), the connection status is set to `disconnected`, encrypted token columns are nulled, and the connection is returned. If revoke HTTP fails the function throws; missing refresh token is tolerated.
- **Personal-account callback detection**: When the Microsoft OAuth callback includes the standard `error=access_denied` from a personal account scenario (or specifically `error=unsupported_account_type` style returns), the callback route translates that to a clear, user-facing JSON error code (e.g. `unsupported_microsoft_account`) at 400. (We rely on the OAuth provider returning this; the auth URL restricts tenant via `?tenant=organizations` so the user only gets sent to work/school.)
- **`GET /me/calendar-connections`** returns queryable plain metadata for both providers: provider, account identifier, scopes, status, access token expiry, with encrypted token columns never leaked.
- **`PATCH /me/calendar-connections/{id}`** disconnects the Microsoft connection when the connection is a Microsoft provider: revokes refresh token, clears encrypted tokens, returns updated connection view. (Reuses the existing route, no provider split required since encrypted token columns are provider-agnostic; verify the existing PATCH still passes for both providers.)

### Testable interfaces

- `src/calendar/microsoft-oauth.ts`: pure function `buildMicrosoftCalendarAuthorizationUrl({ baseUrl, clientId, codeChallenge, state })` returning a URL on `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize` with `tenant=organizations`, `scope=offline_access Calendars.ReadBasic`, `response_type=code`, PKCE S256, sealed state, and the fixed `/me/calendar-connections/callback` redirect URI.
- `src/calendar/microsoft-oauth.ts`: `getMicrosoftCalendarScopes()` returning the scope string (used both at start and for stored scopes).
- `src/calendar/microsoft-calendar-connections.ts`:
  - `MicrosoftCalendarConnectionRepository` (interface, mirroring Google): `createPending`, `listByUserId`, `findById`, `updateById`.
  - `MicrosoftCalendarConnectionRecord`, `MicrosoftCalendarConnectionView`, `MicrosoftCalendarConnectionStatus`.
  - `sealMicrosoftCalendarConnectionState({ connectionId, csrfToken, codeVerifier, secret })`.
  - `startMicrosoftCalendarConnection({ baseUrl, clientId, csrfToken, generateId?, repository, sessionSecret, userId })` returning `{ authorizationUrl, connection, codeVerifier, state }`.
  - `completeMicrosoftCalendarConnection({ baseUrl, clientId, clientSecret, code, fetchImpl, repository, sessionSecret, state, tokenEncryptionKey, tenant? })`.
  - `revokeMicrosoftCalendarConnection({ connectionId, fetchImpl, repository, tokenEncryptionKey, tenant? })`.
  - `presentMicrosoftCalendarConnection(record)`.
- `src/calendar/repository.ts`: add `setMicrosoftCalendarConnectionRepositoryForTests`, `getMicrosoftCalendarConnectionRepository`, and a `databaseMicrosoftCalendarConnectionRepository` that reuses the existing `calendarConnections` table.
- `src/db/schema.ts`: extend `CalendarProvider` type union to include `"microsoft"`. No migration needed for schema (the column is already `text` and accepts any string).
- `app/me/calendar-connections/microsoft/connect/route.ts`: thin Next.js POST route, mirrors `app/me/calendar-connections/google/connect/route.ts`.
- `app/me/calendar-connections/callback/route.ts`: extend to dispatch on the loaded connection's `provider` to call the right completion function; treat provider-specific OAuth errors (e.g. personal-account `access_denied`) as `unsupported_microsoft_account`.
- `app/me/calendar-connections/route.ts`: list both providers.
- `app/me/calendar-connections/[id]/route.ts`: dispatch revoke on provider to the right function.

### Vertical slices (one commit per slice)

1. **Microsoft OAuth URL builder**: test `buildMicrosoftCalendarAuthorizationUrl` and `getMicrosoftCalendarScopes`. Implement only the URL builder. Commit.
2. **Microsoft Calendar Connection state sealing + repository interface**: test `sealMicrosoftCalendarConnectionState`. Implement seal + the `MicrosoftCalendarConnectionRepository` type (no DB impl yet — interface only for the start/complete/revoke slice; the DB-backed repository is added in a later slice). Commit.
3. **`startMicrosoftCalendarConnection`**: test that it creates a pending record with `provider="microsoft"`, stores `Calendars.ReadBasic` scope, returns a Microsoft authorization URL on `login.microsoftonline.com`. Implement. Commit.
4. **`completeMicrosoftCalendarConnection`**: test that the token endpoint is called with PKCE, tokens are encrypted via `encryptCalendarToken`, scopes stored, status flipped to `connected`, opaque metadata fields populated. Implement. Commit.
5. **`revokeMicrosoftCalendarConnection`**: test refresh-token revoke + clear-encrypted-fields. Implement. Commit.
6. **DB-backed repository**: test the actual drizzle repo against the in-memory adapter (mocked via `setMicrosoftCalendarConnectionRepositoryForTests`); implement the drizzle-backed repository. Commit.
7. **`POST /me/calendar-connections/microsoft/connect` route**: test happy path + 401 + 403 + 500 (no env). Implement the route. Commit.
8. **Callback route dispatch + personal-account handling**: extend the existing callback to dispatch on provider; add a test that an `access_denied` from a personal-account sign-in returns `unsupported_microsoft_account` JSON with status 400. Commit.
9. **List + disconnect routes cover Microsoft**: tests for `GET /me/calendar-connections` returning both providers and `PATCH /me/calendar-connections/{id}` disconnecting a Microsoft connection. Commit.
10. **Drizzle migration (optional)**: since the `provider` column is already a free-text column with no enum constraint, no new SQL migration is strictly required. If we want a CHECK constraint for documentation, add `drizzle/0005_microsoft_calendar_connections.sql`. Skip unless tests fail.

### Assumptions / risks

- **Tenant restriction**: We restrict the authorization URL to `tenant=organizations` so the user is sent only to work/school accounts; personal-account users hit `access_denied` from the identity platform which the callback surfaces as `unsupported_microsoft_account`. This satisfies AC2 without a UI branch.
- **Revoke endpoint**: Microsoft's documented approach is to revoke refresh tokens via the OAuth `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/logout` for sessions; the standard practice for revoking a refresh token in the v2.0 endpoint is to mark it unused server-side (Microsoft does not expose a true token-revocation endpoint for refresh tokens). We mirror the Google pattern (best-effort revoke + clear encrypted storage) and document the asymmetry in code comments. Acceptable for MVP since clearing the encrypted column already prevents further use.
- **Schema migration**: the existing `calendar_connections` table uses a free-text `provider` column, so no SQL migration is required for `microsoft`. We extend the TypeScript `CalendarProvider` union only.
- **Existing routes**: the list and revoke routes already operate on `connection.id` without provider branching. We extend them to dispatch on `provider` and to call the Microsoft-specific revoke function when applicable.
- **Operational status (issue #152)**: already supports reading both providers because the column is free-text — no changes needed there.
- **No new env vars**: `MICROSOFT_OAUTH_CLIENT_ID` and `MICROSOFT_OAUTH_CLIENT_SECRET` already exist in `src/config/runtime.ts`.

## Search Scope Restriction

If `codeindex.json` exists in the repository root, use `codeindex` before `grep`, `rg`, or `glob` for symbol lookup, dependency lookup, or blast-radius discovery. Only fall back to `grep`/`glob` if `codeindex` cannot answer the question.

Never run grep, rg, find, or any recursive content/file search against directories outside the current working directory (e.g. /tmp, /var, /usr, /etc, /opt, /home, node_modules, .git, target, dist, build, vendor). Such searches return massive output that floods the context window. Restrict searches to the cwd or explicit sub-paths within it; use the Glob/Grep tools which already scope to the project by default.

This restriction applies to the current agent and to every subagent invoked in the current session, including subagents launched directly and subagents launched by any Sandman or other skill loaded during the run. When spawning, delegating to, or handing work off to a subagent, pass this Search Scope Restriction into the subagent's instructions verbatim, or reference this section by name, so the subagent obeys the same rule.

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
| PR review | `sandman-pr-review` skill | **Must NOT use subagent |

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

## Completion Requirements

Before final response, verify and report:

- Whether each required skill checklist was completed.
- Test/format commands run and outcomes.
- PR URL and review status, if a PR was created.
- Whether PR merge was performed or skipped, with reason.