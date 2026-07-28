# T17 Admin Topics section closure summary

This is the closure summary for issue #303 (T17: Admin Topics section).
It builds on the T16 Users closure summary at the previous head and adds
the Topics-specific evidence.

## Rendered-screen completion gates (AGENTS.md)

| Gate                                         | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright happy-path (Topics)               | `tests/e2e-browser/journeys/admin/topics.spec.ts:21`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Playwright failure-path (own-proposal guard) | `tests/e2e-browser/journeys/admin/topics.spec.ts:120`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Playwright 308-redirect (legacy alias)       | `tests/e2e-browser/journeys/admin/topics.spec.ts:148` (`GET /admin/topic-proposals` 308-redirects to `/admin#topics`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Vitest unit tests at workflow boundary       | `src/workflow/admin-topics.test.ts` (typed `Result<T, E>` coverage for `load`, `decideProposal` approve/reject/error branches, `retireTopic` self-action guard + confirm + mismatch + already-retired + case-insensitive typed match)                                                                                                                                                                                                                                                                                                                                                                                                        |
| Vitest Server Action tests                   | `app/(product)/admin/_actions/topics.test.ts` (CSRF, role enforcement, exact workflow invocation shape, exact redirect targets per branch)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Component tests (renderToString + happy-dom) | `app/(product)/admin/_components/RetireTypedConfirm.test.tsx` (disabled-by-default, enables on case-insensitive typed match, disabled when `disabledBySelfAction`, exact help text / `title` / `aria-describedby`)                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Vitest e2e: decide transaction               | `tests/e2e/topics-decide-proposal-transaction.test.ts` (approve + reject atomicity, concurrent duplicate decisions, idempotence under replay)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Vitest e2e: retire transaction               | `tests/e2e/topics-retire-transaction.test.ts` (Topic + active `user_topics` → historical atomicity, self-action guard at the workflow boundary, idempotence under replay, legacy `retire` preserves active associations)                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Component render: page section               | `tests/app-admin-page.test.tsx` — Topics summary line, pending + active empty-state placeholders, summary counts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Visual capture: PNGs                         | `tests/e2e-browser/screenshots/admin/{topics-expanded,topics-after-approve,topics-after-reject,topics-self-action-disabled,topics-retire-confirm,topics-after-retire}.png`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Visual capture: WebM                         | `playwright/.artifacts/test-results/journeys-admin-topics-*/*` (capture lane, ephemeral; not committed)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| WCAG 2.1 AA bar                              | Topics section uses single `<h2>` per panel; both lists have labelled `<label>` controls; typed-confirm input is associated with `<code>{topicName}</code>` via a `<label htmlFor>`; error and success banners expose `role="alert"` / `role="status"` with `aria-live`; the self-action Retire button carries a `title` attribute and a paired `<span role="note">` linked through `aria-describedby`; approval / rejection controls use text labels (no icon-only controls); Pending / Active / Retired states are text badges; `<details>` collapse is native (no scripted animation), so `prefers-reduced-motion` is honored implicitly. |
| Three-tier responsive bar                    | The Admin shell is a single-column flow at <1024px — the Topics section is two stacked `<table>`s (Pending Proposals then Active Topics) — no media queries are required beyond the existing global layout in `app/globals.css`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| SSR first paint                              | `app/(product)/admin/page.tsx` is an `async function` RSC; the Topics section's pending proposals and active topics are in the server-rendered HTML before hydration; no `useEffect` fetches in the page body.                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Empty-state with primary action              | The Pending list and the Active list each render `.empty-state` blocks (with `topics-pending-empty` and `topics-active-empty` `data-testid`s); the Topics section is intentionally read-only — no Invite-User CTA within it (Users are the source of Topic Proposals, so the existing Users empty-state CTA still applies site-wide).                                                                                                                                                                                                                                                                                                        |

## Self-action protection

`src/workflow/admin-topics.ts:retireTopic` returns
`cannot_retire_own_proposal` **before** any repository mutation when
`topic.proposedByUserId === actorId`, regardless of `confirmName`. The
guard is proved by the Vitest unit suite at
`src/workflow/admin-topics.test.ts:118-148` (matched confirmation
returns the same `cannot_retire_own_proposal`, not `topic_retired`)
and again at `src/workflow/admin-topics.test.ts:148-178` (mismatched
confirmation also returns `cannot_retire_own_proposal`).

The UI surface mirrors the guard at
`app/(product)/admin/_components/RetireTypedConfirm.tsx`:
`disabledBySelfAction` disables the input and the submit button,
attaches a `title` of `You cannot retire a Topic you proposed.` and
links both to a `<span role="note" data-testid="topics-self-action-help-${topicId}">`
via `aria-describedby`. The `RetireTypedConfirm.test.tsx` suite proves
the disabled state and unchanged `disabled=true` even when the typed
name matches the topic.

## Audit records

`decideProposal` and `retireTopic` each insert a row into
`audit_records` in the same Postgres transaction as their primary data
writes, matching `docs/mvp-spec.md:84, 273, 396, 473`:

- `decideProposal({ status: "approved" })` writes `action: "approve-proposal"`,
  `targetType: "topic-proposal"`, `targetId: <proposal-id>`, and
  `metadata: { candidateName }`.
- `decideProposal({ status: "rejected" })` writes `action: "reject-proposal"`,
  `targetType: "topic-proposal"`, `targetId: <proposal-id>`, and
  `metadata: { candidateName }`.
- `retireTopic` writes `action: "retire-topic"`, `targetType: "topic"`,
  `targetId: <topic-id>`, and `metadata: { topicName, transitionedAssociationCount }`.

The `audit_records` table (`drizzle/0016_audit_records.sql`) is
non-personal: actor and target ids are stored as `uuid` columns
without foreign-key constraints, so a User delete via
`SET NULL`/`ON DELETE CASCADE` keeps the audit row intact (per
`docs/mvp-spec.md:114, 424`). The migration is exercised by
`tests/audit-records-migration.test.ts`; the same-transaction inserts
are exercised by `tests/e2e/topics-decide-proposal-transaction.test.ts`
and `tests/e2e/topics-retire-transaction.test.ts`.

## Legacy `/admin/topic-proposals` lifecycle

`app/admin/topic-proposals/route.ts` GET still serves the 308 redirect
to `/admin#topics`. The legacy POST remains available for the locked
one-minor-version compatibility window
(`tests/retired-routes.test.ts:118-132` asserts the POST handler stays
reachable), so the existing `tests/e2e/admin-approves-topic-proposal.test.ts`,
`tests/e2e/admin-rejects-topic-proposal.test.ts`, and
`tests/e2e/admin-retires-active-topic.test.ts` continue to pass without
modification. The canonical Server Actions at `app/(product)/admin/_actions/topics.ts`
are the primary UI write path that this PR closes.

## WebM capture artifact

The capture lane artifact produced by `pnpm test:capture` is uploaded
to the `browser-tests.yml` workflow artifacts on a workflow_dispatch
run. The implementor's local run emits the Topics journey at:

```
playwright/.artifacts/test-results/journeys-admin-topics-*/*/video.webm
```

The six per-state PNGs accompany this WebM in the same directory.
