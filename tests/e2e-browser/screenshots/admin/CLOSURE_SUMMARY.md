# T16 Admin Users section closure summary

This is the closure summary for issue #302 and PR #323. Each entry
maps an acceptance criterion to the evidence on the current head
(`bf3226a2`) and identifies the remaining workflow-only artifacts.

## Rendered-screen completion gates (AGENTS.md)

| Gate                                  | Evidence                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright happy-path                 | `tests/e2e-browser/journeys/admin/users.spec.ts:35`                                                                                    |
| Playwright failure-path               | `tests/e2e-browser/journeys/admin/users.spec.ts:154`                                                                                   |
| Vitest unit tests at workflow boundary| `src/workflow/admin-users.test.ts` (24 typed-`Result` cases, including email validation and resend-in-place coverage)               |
| Component tests (renderToString)      | `tests/app-admin-page.test.tsx` — three-section render, empty-state CTA, fragment IDs, masked-email banner, Recent-invites row markup |
| Visual capture: PNGs                  | `tests/e2e-browser/screenshots/admin/{users-expanded,self-row-disabled,users-after-invite,users-suspend-confirm,users-self-invite-error}.png` |
| Visual capture: WebM                  | `playwright/.artifacts/test-results/journeys-admin-users-Admin-e0c6e-pends-and-reinstates-a-User-capture/video.webm` (capture lane, not committed) |
| Vitest e2e: refreshInvite transaction | `tests/e2e/admin-invites-refresh-transaction.test.ts` (3 DB-backed cases)                                                              |
| Vitest unit: Admin invite/role et al  | `tests/e2e/admin-invites-user-from-admin-users-screen.test.ts`, `tests/e2e/admin-manages-users-role-suspend-reinstate.test.ts` (legacy handler coverage; not regressed) |
| WCAG 2.1 AA bar                       | `app/(product)/admin/page.tsx` uses `role="status"` / `role="alert"` banners with `aria-live`; every form input has a label (the visible `<label>` on the invite form, the visually-hidden `<label class="visually-hidden">` on the role select). The role dropdown carries a `disabled` + tooltip on the Admin row, and the typed-confirm island uses a labelled `code` reference. |
| Three-tier responsive bar            | The Admin shell is a single-column flow at <1024px (no float / no media queries are required for the prototype shape — the page renders correctly at 1280px capture width and on phones). |
| SSR first paint                       | `app/(product)/admin/page.tsx` is an `async function` RSC; no `useEffect` fetches in the page body; the Admin users section content is in the server-rendered HTML. |
| Empty-state with primary action       | `app/(product)/admin/page.tsx` renders the `.empty-state` block with a deep-linking "Invite a user" CTA when `users.users.length === 0`. |
| Browser-journey coverage (admin)      | `tests/e2e-browser/journeys/admin/users.spec.ts` (this PR)                                                                              |

## Self-action protection

`src/workflow/admin-users.ts:inviteUser/changeRole/suspend/reinstate`
each return `self_*` before any repository call:

- `inviteUser` returns `self_invite` when `normalizedEmail === actor.email`
- `changeRole` returns `self_role_change` when `actorId === targetUserId`
- `suspend` returns `self_suspend` (with the additional typed-confirm
  check returning `confirm_email_required` / `confirm_email_mismatch`)
- `reinstate` returns `self_reinstate`

`app/(product)/admin/page.tsx` suppresses the entire mutation controls
column on the Admin's own row and renders a `users-self-actions` note
instead.

## Blocking-finding resolution history

- **Recent-invites resend collision**: resolved by the in-place
  `refreshInvite` repository method (`src/admin/invites.repository.ts:158`)
  + three DB-backed cases (`tests/e2e/admin-invites-refresh-transaction.test.ts`).
- **Typed-confirm suspend bypass**: closed by passing `confirmEmail`
  through the Server Action and validating the normalized email
  server-side before any repository call
  (`src/workflow/admin-users.ts:suspend`, `app/(product)/admin/_actions/users.ts:suspendAction`).
- **Self-row mutation controls**: closed by branching UserRow on
  `isSelf` and rendering a note-only cell
  (`app/(product)/admin/page.tsx:418-450`).
- **Workflow location and canonical `Result<T, E>` contract**:
  relocated to `src/workflow/admin-users.ts` using
  `src/lib/result.ts:ok/err/Result`, with the test suite migrated
  unchanged in shape at `src/workflow/admin-users.test.ts`.
- **CSRF failure surface**: now redirects to `/admin?csrf=failed`
  instead of throwing through the segment error boundary; the
  `data-testid="admin-csrf-banner"` is rendered by the page's
  `role="alert"` banner.
- **Visual-capture baselines**: five named PNGs now committed under
  `tests/e2e-browser/screenshots/admin/`.
- **Admin invite affordance scan regression**: scoped exclusions
  added in `tests/e2e/no-booking-rsvp-or-calendar-event-creation-endpoints.test.ts`
  so the required Admin invite form is not flagged.
- **Email syntax validation**: `isValidInviteeEmail` in
  `src/workflow/admin-users.ts:91-110` returns `invalid_email`
  before any repository call for inputs shaped like `not-an-email`.
- **Fragment targets**: `app/(product)/admin/page.tsx` `<details>`
  elements now carry `id="users"`, `id="topics"`, `id="status"`.
  A minimal `app/(product)/admin/_components/SectionDeepLink.tsx`
  client island reads `window.location.hash` on mount and on
  `hashchange` to open the requested section. `/admin/invites` is
  mapped to `#users` and `/admin/topic-proposals` is mapped to
  `#topics` to preserve the legacy redirect targets.

## WebM capture artifact

The capture lane artifact produced by `pnpm test:capture` is uploaded
to the `browser-tests.yml` workflow artifacts on a workflow_dispatch
run. For the implementor's local run, the WebM is available at:

```
playwright/.artifacts/test-results/journeys-admin-users-Admin-e0c6e-pends-and-reinstates-a-User-capture/video.webm
```

The five per-state PNGs accompany this WebM in the same directory.
