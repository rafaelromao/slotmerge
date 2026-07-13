# Task

Implement GitHub issue #62: E2E test plan: SlotMerge MVP

## Issue Context

## Parent

Parent PRD: [SlotMerge MVP PRD](https://github.com/rafaelromao/slotmerge/issues/14).

## What to build

The full E2E test plan for SlotMerge MVP. Mocks only external services (Google Calendar, Microsoft Graph, email delivery, time/clock). Covers every PRD user story #1–#61 plus cross-cutting privacy and non-goal guards. Includes the testing infrastructure that makes the plan runnable and the coverage map that ties each test back to the PRD.

## External services mocked

- Google Calendar API — free/busy queries, OAuth, webhook delivery.
- Microsoft Graph — `getSchedule`, OAuth, webhook delivery.
- Email delivery transport — all transactional emails.
- Time — clock injection for magic-link expiration, stale markers, backoff windows, retention.

## Testing infrastructure

- One full-stack web app instance per test run with mocked adapters wired in.
- Ephemeral PostgreSQL database with schema migrated each run.
- `clock` injected at the app boundary (auth, scheduling, staleness, retention), advanced without sleeping.
- Per-test reset of DB, fixtures, and clock.
- Tests assert observable behavior only: HTTP responses, rendered HTML, persisted records via API, mock email/webhook events.

Shared helpers:

- `MockEmailAdapter` recording every send; helpers for delivery state and retries.
- `MockGoogleCalendar` and `MockMicrosoftGraph` recording calls and returning scripted free/busy responses, OAuth callbacks, and webhook deliveries.
- `searchResultPage` helper that runs an Organizer Search end-to-end and inspects the rendered calendar and clicked Slot details drawer payload.

## Coverage map (PRD story → tests)

- Stories 1–5 → tests 1–7
- Stories 6–9 → tests 8–11
- Stories 10–14 → tests 12–14
- Stories 15–17 → tests 51–53
- Stories 18–23 → tests 15–20
- Stories 24–34 → tests 21–32
- Stories 35–46 → tests 33–43
- Stories 47–50 → tests 44–46
- Stories 51–56 → tests 49–50, 54–55
- Stories 57–61 → tests 56–59
- Privacy and non-goal guards → tests 60–62

## Open questions

1. Test framework — Vitest, Jest, Playwright, or a custom harness?
2. Calendar provider mock fidelity — thin in-process adapter or real-shaped OAuth/webhook mocks?
3. Clock injection — single global clock or per-feature clocks?
4. Snapshot/JSON schema assertions — strict schema or behavioral only?
5. Per-test performance budget in CI?

## Blocked by

None — can start immediately.

## Open Questions Resolved

1. **Test framework**: Vitest (already configured; per PRD E2E test plan spec)
2. **Calendar provider mock fidelity**: Real-shaped OAuth/webhook mocks with scriptable free/busy responses (per issue description)
3. **Clock injection**: Single global `TestClock` at app boundary, advanced without sleeping (per issue description)
4. **Snapshot/JSON schema assertions**: Strict schema on `SearchResultSnapshot` JSON; Zod schema defined in test helpers
5. **Per-test performance budget**: Not applicable — E2E tests are not executed in CI per PRD spec

## Plan

### Behaviors to test

**Tracer bullet (auth slice — tests 1–7)**
- B: Invited email receives magic link and can authenticate via the link
- B: Non-invited email cannot request or use a magic link
- B: Magic link cannot be used after expiration (clock advances past expiry)
- B: Magic link cannot be used twice (already-used token rejected)
- B: Self-delete removes profile, availability, calendar connections, and discoverability; audit references preserved

**Setup slice (tests 8–14, 51–53)**
- B: User with complete setup (profile + consent + topic + availability) becomes discoverable
- B: Incomplete setup prevents discoverability; checklist reflects accurate state
- B: Topic proposal submitted by user appears in pending proposals
- B: Topic proposal does not satisfy "at least one Topic" for matching until approved
- B: Weekly availability windows are persisted and returned correctly
- B: One-off availability overrides (add/block) are persisted and returned correctly
- B: User-topic associations (active Topics) are persisted and returned correctly

**Availability slice (tests 15–20)**
- B: Weekly availability windows subtract imported busy intervals; buffer respected
- B: One-off overrides take precedence over weekly windows for their time range
- B: Buffer duration shifts availability start/end times
- B: Availability edits apply immediately to subsequent searches

**Calendar connection slice (tests 21–32)**
- B: Google OAuth flow: connect → authorization URL returned → callback → tokens stored → connected status
- B: Microsoft OAuth flow: connect → authorization URL returned → callback → tokens stored → connected status
- B: Microsoft personal account returns unsupported provider message
- B: Selected calendars determine which calendar conflicts are imported
- B: Disconnect removes tokens and prevents further sync
- B: Calendar sync imports free/busy intervals and persists them
- B: Stale flag raised when sync does not succeed within expected window
- B: Stale imported data does not exclude user from Search; stale markers appear in slot details

**Organizer search slice (tests 33–43)**
- B: Only Organizers and Admins can run searches; normal Users receive 403
- B: Search with one selected Topic matches only users with that active Topic
- B: Search with multiple selected Topics matches only users with ALL selected active Topics
- B: Searcher never appears in results and never counts toward minimum matching users
- B: User counted in slot only if available for the full meeting duration from slot start
- B: Default minimum matching users is 2; configurable per search
- B: Slots align to the hourly grid; start times are on the hour
- B: Search result calendar shows per-slot match counts and stale markers
- B: Clicking a slot opens a drawer listing matching users with visible profile/topic/availability details
- B: Every search creates an immutable snapshot in DB; later data changes do not affect it
- B: All Organizers/Admins can view search history

**Admin user management slice (tests 44–46, 49–50)**
- B: Admin can invite a user by email with chosen role; invitation email sent with magic link
- B: Admin can change a user's role (User → Organizer → Admin and reverse)
- B: Admin can suspend a user; suspended user cannot authenticate
- B: Admin can reinstate a suspended user

**Admin topic curation slice (tests 54–55)**
- B: Admin can approve a pending topic proposal; approved topic becomes active and selectable
- B: Admin can reject a pending topic proposal
- B: Admin can retire an active topic; retired topic not selectable for new associations or searches
- B: Retired topic preserves historical user associations

**Calendar action-required email slice (tests 56–59)**
- B: Persistent calendar sync failure triggers action-required email to affected user
- B: Successful reconnect clears the failure state and stops action-required email cycle
- B: Critical operational issues trigger email to Admins

**Privacy slice (tests 60–62)**
- B: Discoverability consent required before user appears in any search result
- B: Discoverability can be disabled; disabled user excluded from subsequent searches
- B: Search result slot details do not expose raw calendar event titles, attendees, locations, descriptions, or email addresses
- B: Deleted user's data fully removed; only audit references remain

**Non-goal guards slice (tests 61–62)**
- B: Search results page has no booking, RSVP, invitation, or event-creation UI controls
- B: User profile page has no notification inbox or notification preference controls
- B: Calendar connection UI has no event write, create, or send controls (free/busy only)
- B: Search results do not include any copy/share/export/handoff controls

### Testable interfaces

**Clock injection (`tests/e2e/helpers/clock.ts`)**
```typescript
class TestClock {
  private static Date date = new Date('2024-06-01T00:00:00Z');
  static now(): Date           // returns current clock value
  static advance(hours: number): void  // moves clock forward synchronously
  static reset(): void         // resets to base date
  static set(date: Date): void // sets to arbitrary date
}
```
All services that accept `clock?: () => Date` receive `TestClock.now`.

**MockEmailAdapter (`tests/e2e/helpers/email.ts`)**
```typescript
class MockEmailAdapter {
  private sent: EmailEvent[] = [];
  reset(): void
  findByRecipient(email: string): EmailEvent[]
  findByType(type: EmailType): EmailEvent[]
  assertDelivered(recipient: string, type: EmailType): void
  assertNotDelivered(recipient: string, type: EmailType): void
  lastDelivery(recipient: string, type: EmailType): EmailEvent | undefined
}
```
Leverages existing `createEmailTransport({ adapter: "mock" })`.

**MockGoogleCalendar (`tests/e2e/helpers/google-calendar.ts`)**
```typescript
class MockGoogleCalendar {
  record: GoogleCalendarCall[] = [];
  private freebusyScripts: Map<string, FreeBusyResponse[]> = new Map();
  private oauthScripts: OAuthScript[] = [];
  private webhookScripts: WebhookScript[] = [];

  scriptFreeBusy(email: string, responses: FreeBusyResponse[]): void
  scriptOAuthCallback(code: string, state: string, result: OAuthCallbackResult): void
  scriptWebhookDelivery(channelId: string, result: WebhookDeliveryResult): void
  reset(): void

  // Must implement Google Calendar API shape:
  // POST https://www.googleapis.com/calendar/v3/freeBusy
  getFreeBusyCalls(): FreeBusyQuery[]
  getOAuthCallbacks(): OAuthCallback[]
  getWebhookDeliveries(): WebhookDelivery[]
}
```
`freebusyScripts` keyed by user email; each call pops the next scripted response.

**MockMicrosoftGraph (`tests/e2e/helpers/microsoft-graph.ts`)**
```typescript
class MockMicrosoftGraph {
  record: MicrosoftGraphCall[] = [];
  private scheduleScripts: Map<string, ScheduleResponse[]> = new Map();
  private oauthScripts: OAuthScript[] = [];
  private webhookScripts: WebhookScript[] = [];

  scriptGetSchedule(email: string, responses: ScheduleResponse[]): void
  scriptOAuthCallback(code: string, state: string, result: OAuthCallbackResult): void
  scriptWebhookDelivery(channelId: string, result: WebhookDeliveryResult): void
  reset(): void

  // Must implement Microsoft Graph shape:
  // POST /me/calendar/getSchedule
  getScheduleCalls(): GetScheduleCall[]
  getOAuthCallbacks(): OAuthCallback[]
  getWebhookDeliveries(): WebhookDelivery[]
}
```

**SearchResultSnapshot schema (`tests/e2e/helpers/search-result-snapshot.ts`)**
```typescript
import { z } from "zod";

export const SearchResultSnapshotSchema = z.object({
  version: z.literal(1),
  searchId: z.string(),
  generatedAt: z.string().datetime(),
  parameters: z.object({
    selectedTopicIds: z.array(z.string()),
    minimumMatchingUsers: z.number().int().min(1),
    durationMinutes: z.number().int().min(15).max(480),
    dateRangeStart: z.string().datetime(),
    dateRangeEnd: z.string().datetime(),
    organizerTimezone: z.string(),
  }),
  weeklyGrid: z.record( // key: ISO "2024-W23"
    z.array(z.object({
      startTime: z.string().datetime(),
      endTime: z.string().datetime(),
      matchCount: z.number().int().min(0),
      stale: z.boolean(),
      matches: z.array(z.object({
        userId: z.string(),
        displayName: z.string(),
        avatarUrl: z.string().nullable(),
        bio: z.string().nullable(),
        topics: z.array(z.object({ id: z.string(), name: z.string() })),
        availabilityIndicators: z.record(z.string(), z.boolean()),
        calendarFresh: z.boolean(),
      })),
    }))
  ),
});

export type SearchResultSnapshot = z.infer<typeof SearchResultSnapshotSchema>;
```
All search result assertions use `SearchResultSnapshotSchema.parse()` for strict validation.

**searchResultPage helper (`tests/e2e/helpers/search-result-page.ts`)**
```typescript
async function searchResultPage(organizerSession: SessionCookie, params: {
  selectedTopicIds: string[];
  minimumMatchingUsers?: number;
  durationMinutes?: number;
  dateRangeStart?: string;
  dateRangeEnd?: string;
  timezone?: string;
}): Promise<{
  snapshot: SearchResultSnapshot;
  calendarGrid: WeeklyGrid;
  slotDetails: SlotDetails[];
  response: Response;
}>
```
1. POST `/searches` with search params → receive snapshot JSON + redirect
2. GET the redirect target (rendered search results page)
3. Parse weekly calendar grid from HTML
4. Click the first slot with `matchCount > 0` via GET `/searches/{id}/slots/{slotId}` or HTML interaction
5. Return `{ snapshot, calendarGrid, slotDetails }`

**Database reset (`tests/e2e/helpers/db.ts`)**
```typescript
async function resetDatabase(): Promise<void>
// TRUNCATE all tables CASCADE; re-apply migrations via drizzle-kit or direct SQL
// Uses APP_ENV=test DATABASE_URL
```

**Webhook delivery** — direct route handler invocation in Vitest (no supertest needed):
```typescript
import { POST as GoogleWebhookPost } from "app/webhooks/google/calendar/route";
const webhookResponse = await GoogleWebhookPost(
  new Request("http://localhost/webhooks/google/calendar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(webhookEvent),
  })
);
```

**OAuth callback flow** — tested as multi-step scenario:
1. POST `/me/calendar-connections/google/connect` → extract `authorizationUrl` from response
2. `MockGoogleCalendar.scriptOAuthCallback(code, state, { accessToken, refreshToken, expiresAt })`
3. POST `/me/calendar-connections/{connectionId}/callback` with `code` and `state`
4. Assert connection status is `"connected"` via GET `/me/calendar-connections`

### Per-test setup/teardown

```typescript
beforeEach(async () => {
  await resetDatabase();
  TestClock.reset();
  MockEmailAdapter.reset();
  MockGoogleCalendar.reset();
  MockMicrosoftGraph.reset();
});
```

### Execution order (vertical slices)

1. **Auth + Invite** — tests 1–7: TestClock, MockEmailAdapter, DB reset, invite/magic-link/self-delete flows
2. **Setup + Consent** — tests 8–14: profile, discoverability, checklist accuracy
3. **Topic associations** — tests 51–53: topic catalogue, proposals, user-topic associations
4. **Availability windows** — tests 15–20: weekly windows, overrides, buffer
5. **Google Calendar connection** — tests 21–27: OAuth flow, free/busy import, staleness, disconnect
6. **Microsoft Calendar connection** — tests 28–32: OAuth flow, getSchedule, staleness, disconnect
7. **Organizer search** — tests 33–43: form, execution, grid, slot details, snapshot immutability
8. **Search history** — tests 44–46: all Organizers/Admins can view history
9. **Admin user management** — tests 49–50: invite, role change, suspend/reinstate
10. **Admin topic curation** — tests 54–55: approve/reject/retire
11. **Calendar action-required email** — tests 56–59: action-required email, critical admin email
12. **Privacy guards** — tests 60–62: consent, data exposure limits, self-delete, non-goal UI absence

### Assumptions / risks

- **Assumption**: Repository override pattern (`setXxxRepositoryForTests`) composes cleanly with external service mocks; no conflict between in-process repository mocks and the `fetchImpl`-based calendar mocks.
- **Assumption**: Drizzle migrations can be re-applied to an ephemeral test DB via `drizzle-kit migrate --force` in `beforeEach` without race conditions.
- **Risk**: Clock injection sites — must audit every `clock?: () => Date` parameter in `src/` to ensure `TestClock.now` is passed at all call sites; any untested path that hard-codes `() => new Date()` will cause time-dependent test failures.
- **Risk**: OAuth multi-step flow — the redirect URL in `startGoogleCalendarConnection` is constructed from `APP_BASE_URL`; tests must set `APP_BASE_URL=http://localhost` to produce correct callback URLs.
- **Risk**: Snapshot immutability test requires a second search to be run after data changes; must ensure both searches are against the same date range or use distinct date ranges to avoid false positives.

- You are running inside a Sandman-created worktree.
- Current branch: `sandman/62-e2e-test-plan-slotmerge-mvp`
- Source branch: `sandman/62-e2e-test-plan-slotmerge-mvp`
- Base branch: `main`
- Review command: `/sandman review`

The worktree MUST be checked out on `sandman/62-e2e-test-plan-slotmerge-mvp` when the run finishes. Do not switch to `main` or any other branch before exiting.

## Execution Checklist

- [x] Create branch
- [x] Plan (sandman-plan)
- [ ] Implement (sandman-implement: execute TDD + commit + self-review + back-merge + create PR + delegate review)
- [ ] PR-Review (sandman-pr-review)
- [ ] PR-Merge (sandman-pr-merge)

Before moving on, check which checklist items are already complete in `.sandman/task.md`. If an item is already checked, treat it as complete and skip it instead of repeating the work.

After checking off an item, update `.sandman/task.md` in place and rewrite the registered `## Next Step` so it points at the next unchecked checklist item.

## Next Step

Execute `sandman-tdd` tracer bullet: auth-and-invite test infrastructure slice (TestClock + MockEmailAdapter + DB reset + test 1)

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
