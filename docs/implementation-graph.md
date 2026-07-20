# SlotMerge Implementation Ticket Graph

Dependency-ordered source of truth for the SlotMerge MVP web app implementation phase. Companion to `docs/mvp-spec.md` (canonical implementation-ready spec) and the Wayfinder map ([issue #271](https://github.com/rafaelromao/slotmerge/issues/271)).

Every screen in `docs/mvp-spec.md` section 4 is owned by exactly one implementation ticket. The graph is ordered so the first tracer bullet proves the harness; each subsequent ticket unblocks the next. Tickets use the [Rendered-screen and browser-journey completion gates](https://github.com/rafaelromao/slotmerge/issues/279) recorded in `AGENTS.md`.

The graph below is the design. The actual implementation PRs are created from these stubs. Each ticket body includes a `Closure Evidence` block, a Playwright journey owner, a canonical workflow module owner, and the AGENTS.md acceptance bar checked.

## 0. Conventions

- **One ticket = one screen surface (or one shared component)**. If a screen is split across multiple surfaces (e.g. `/me/profile` form + `/me/profile` saved state), they share one ticket.
- **Dependencies are native GitHub issue dependencies**. A ticket is unblocked when every dependency is closed.
- **Migration step** maps each ticket to the canonical migration order from `docs/research/canonical-next-page-api-architecture.md`: shell → Search → Calendar → Availability → Topics → Consent → Admin.
- **Workflow module** names the deep module the ticket introduces or exercises.
- **Playwright journey file** names the path the implementer writes under `tests/e2e-browser/journeys/{user,organizer,admin}/`.

## 1. Foundation tickets (unblock the harness)

### T1. Browser harness install + setup Home journey

- **Migration step**: shell (step 1).
- **Owns**: Playwright Test install; the D4/D5/D6 seams; the canonical `playwright.config.ts` with default + capture projects; the `.github/workflows/browser-tests.yml` and `visual-regression.yml` workflow_dispatch lanes; the per-role `storageState` setup; the `app/(product)/layout.tsx` shell; the `app/(public)/layout.tsx`; the role-aware top bar; the Setup status chip; the Calendar status badge; the avatar dropdown; the `HeaderMenuToggle` client component; the `app/page.tsx` setup checklist.
- **Workflow module**: `setupHomeWorkflow`, `authWorkflow`, `accountWorkflow` (sign-out).
- **Playwright journey**: `tests/e2e-browser/journeys/user/setup-home.spec.ts`. The first passing journey is the install acceptance: signed-out User, magic-link verify, setup checklist visible, all five cards present.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `authWorkflow` and `setupHomeWorkflow`; component test for the `(product)` layout and the `HeaderMenuToggle`; per-state screenshots; capture run.

### T2. Canonical page-and-action URL tree and auth/CSRF seams

- **Depends on**: T1.
- **Owns**: `requirePageContext` and `assertCsrfOrThrow`; per-segment `error.tsx` and `not-found.tsx`; the canonical route tree wiring (RSC pages and Server Action files); the URL consolidation 308 redirects for the legacy routes listed in `docs/mvp-spec.md:7.8`.
- **Workflow module**: cross-cutting; no new module.
- **Playwright journey**: `tests/e2e-browser/journeys/user/role-guard.spec.ts`. Plain User typing `/searches` in the URL bar sees the per-segment `not-found.tsx`; Admin sees the page.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `requirePageContext` and `assertCsrfOrThrow`; component test for the per-segment error boundaries.

## 2. User journey tickets

### T3. Magic-link request, verify, and resend

- **Migration step**: shell (step 1).
- **Depends on**: T1, T2.
- **Owns**: `app/(public)/sign-in/page.tsx`, `app/(public)/sign-in/sent/page.tsx`, `app/(public)/sign-in/verify/page.tsx`; the three typed error states; `app/auth/magic-link/request/route.ts`, `app/auth/magic-link/resend/route.ts`, `app/auth/magic-link/verify/route.ts`; `app/auth/session/route.ts` (sign-out).
- **Workflow module**: `authWorkflow`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/magic-link.spec.ts`. The journey drives Admin invite (cross-journey with T11), the verify page, the three error states (expired, used, invalid), and the resend flow.
- **Closure evidence**: Playwright happy + failure (one spec per error state); Vitest unit for `authWorkflow`; component tests for the sign-in pages.

### T4. Profile page

- **Migration step**: Consent (step 6).
- **Depends on**: T1, T2.
- **Owns**: `app/(product)/me/page.tsx`, `app/(product)/me/profile/page.tsx`; `updateProfileAction`; the six-field form.
- **Workflow module**: `profileWorkflow.updateProfile`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/profile.spec.ts`. Display name + timezone + buffer + bio + avatar; validation errors for each field.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `profileWorkflow.updateProfile`; component test for the profile form.

### T5. Discoverability consent page

- **Migration step**: Consent (step 6).
- **Depends on**: T1, T2.
- **Owns**: `app/(product)/me/discoverability/page.tsx`; `setDiscoverabilityAction`; the static copy block; the saved-state Revoke action.
- **Workflow module**: `discoverabilityWorkflow.set`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/discoverability.spec.ts`. Grant consent; revoke; re-grant.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `discoverabilityWorkflow.set`; component test for the consent form.

### T6. Topics page and Topic Proposals

- **Migration step**: Topics (step 5).
- **Depends on**: T1, T2.
- **Owns**: `app/(product)/me/topics/page.tsx`; `saveTopicSelectionAction`; `proposeTopicAction`; the "My Proposals" status badges.
- **Workflow module**: `topicWorkflow.listActive`, `topicWorkflow.listMyProposals`, `topicWorkflow.propose`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/topics.spec.ts`. Select Topics, save, propose a Topic, see the pending row, see similarity error.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `topicWorkflow`; component test for the Topics form and the "My Proposals" list.

### T7. Availability page

- **Migration step**: Availability (step 4).
- **Depends on**: T1, T2.
- **Owns**: `app/(product)/me/availability/page.tsx`; weekly editor Server Actions; overrides Server Actions; the plain-text effective Availability preview; the URL repair per `docs/mvp-spec.md:7.8`.
- **Workflow module**: `availabilityWorkflow`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/availability.spec.ts`. Add weekly window, add override, block override, edit buffer, see effective Availability preview.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `availabilityWorkflow`; component test for the availability form.

### T8. Calendar Connection page and OAuth hand-off

- **Migration step**: Calendar (step 3).
- **Depends on**: T1, T2, T7.
- **Owns**: `app/(product)/me/calendar-connections/page.tsx`; the connect CTAs; the per-connection list; the per-connection Server Actions; the `app/me/calendar-connections/connect/{google,microsoft}/route.ts` external seams; the `app/me/calendar-connections/callback/route.ts`; the `app/me/calendar-connections/{id}/calendars|refresh|disconnect/route.ts` external seams; the `CalendarOAuthState` sealed payload; the four typed callback outcomes.
- **Workflow module**: `calendarConnectionWorkflow`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/calendar-connection.spec.ts`. Connect Google (mock sidecar returns a stub token), see `connected` outcome, select contributing calendars, refresh, disconnect, reconnect, see `needs_reconnect` state. Microsoft personal account returns the `unsupported` outcome.
- **Closure evidence**: Playwright happy + failure (one spec per outcome); Vitest unit for `calendarConnectionWorkflow`; component test for the page and the connect CTAs.

### T9. Self-delete page

- **Migration step**: shell (step 1, deferred until profile/Topics/Availability are stable).
- **Depends on**: T1, T2, T4, T5, T6, T7, T8.
- **Owns**: `app/(product)/me/delete/page.tsx`; `selfDeleteAction`; the typed-confirm flow; the post-delete redirect to `/sign-in?reason=deleted`.
- **Workflow module**: `accountWorkflow.selfDelete`.
- **Playwright journey**: `tests/e2e-browser/journeys/user/self-delete.spec.ts`. Type `DELETE`; submit; verify the User's profile, Topics, Availability, Discoverability, and Calendar Connections are gone; verify the audit references remain.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `accountWorkflow.selfDelete`; component test for the typed-confirm form.

### T10. End-to-end User journey

- **Migration step**: shell (step 1, last).
- **Depends on**: T3, T4, T5, T6, T7, T8, T9.
- **Owns**: a single Playwright spec that drives the canonical User happy path: invite → verify → setup checklist → profile → consent → topics → availability → calendar connection → sign-out. Each step is a distinct `test.describe` block so failures point at the right surface.
- **Workflow module**: cross-cutting.
- **Playwright journey**: `tests/e2e-browser/journeys/user/end-to-end.spec.ts`. The install acceptance already covered setup Home; this spec exercises the full path through every User surface.
- **Closure evidence**: Playwright happy; Vitest unit for the cross-cutting helpers; component test for the shell; per-state screenshots for every User surface; capture run for the full journey.

## 3. Organizer journey tickets

### T11. Search form and runSearchAction

- **Migration step**: Search (step 2).
- **Depends on**: T1, T2, T6 (Topics must exist for the catalogue).
- **Owns**: `app/(product)/searches/page.tsx`; the per-Organizer server-computed defaults; `POST /searches/run` Server Action; the all-selected matching rule line; the empty-state copy.
- **Workflow module**: `searchWorkflow.buildForm`, `searchWorkflow.run`.
- **Playwright journey**: `tests/e2e-browser/journeys/organizer/search-form.spec.ts`. Form pre-fills; validation errors per field; Run Search redirects to `/searches/{newId}`.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `searchWorkflow.buildForm` and `searchWorkflow.run`; component test for the form.

### T12. Search Result page and Slot Details drawer

- **Migration step**: Search (step 2).
- **Depends on**: T11.
- **Owns**: `app/(product)/searches/[id]/page.tsx`; the immutable Search Result loading from the snapshot repository; the weekly grid; the per-cell stale marker; the existing `SlotDetailsDrawer` client island; week navigation via `?week=YYYY-MM-DD`; the `data-testid="slot-{dayIdx}-{slotIdx}"` hooks; the `data-stale` and `aria-label` semantics; the permanent 308 redirect from `/searches/[id]/results` to `/searches/[id]`.
- **Workflow module**: `searchWorkflow.openSnapshot`.
- **Playwright journey**: `tests/e2e-browser/journeys/organizer/search-result.spec.ts`. Grid renders; click slot opens drawer; per-Match row content; stale marker on a slot with one stale user; Next week link.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `searchWorkflow.openSnapshot`; component test for the `SlotDetailsDrawer` and the weekly grid.

### T13. Search history and re-run

- **Migration step**: Search (step 2).
- **Depends on**: T12.
- **Owns**: `app/(product)/searches/history/page.tsx`; the chronological list; the `Open snapshot` and `Re-run` actions; `POST /searches/{id}/rerun` Server Action; the 50-row pagination via `?before=…`; the `?before=<searchId>` `Load more` link; the permanent 308 redirects from `/search/history` and `/search/{id}/snapshot` to the canonical paths.
- **Workflow module**: `searchWorkflow.listHistory`, `searchWorkflow.rerun`.
- **Playwright journey**: `tests/e2e-browser/journeys/organizer/search-history.spec.ts`. List renders; click Open snapshot → Search Result; click Re-run → new Search Result; the old snapshot stays open at `/searches/{oldId}`.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `searchWorkflow.listHistory` and `searchWorkflow.rerun`; component test for the history list.

### T14. `/api/v1` read adapters

- **Migration step**: Search (step 2).
- **Depends on**: T12, T13.
- **Owns**: `app/api/v1/searches/route.ts`, `app/api/v1/searches/[id]/route.ts`, `app/api/v1/me/setup-status/route.ts`; the shared DTO serializers; the problem+json error shape per the canonical architecture.
- **Workflow module**: cross-cutting; thin adapters over the existing workflow modules.
- **Playwright journey**: `tests/e2e-browser/api-v1.spec.ts`. The harness issues `fetch` calls to each endpoint with the per-role `storageState` cookie and asserts the response shape.
- **Closure evidence**: Playwright happy + failure; Vitest unit for each adapter's serializer and error mapper; contract test for the response shape.

### T15. End-to-end Organizer journey

- **Migration step**: Search (step 2, last).
- **Depends on**: T11, T12, T13, T14.
- **Owns**: a single Playwright spec that drives the canonical Organizer happy path: form → result → drawer → history → rerun.
- **Playwright journey**: `tests/e2e-browser/journeys/organizer/end-to-end.spec.ts`.
- **Closure evidence**: Playwright happy; Vitest unit; per-state screenshots; capture run for the full journey.

## 4. Admin journey tickets

### T16. Admin page shell + Users section

- **Migration step**: Admin (step 7).
- **Depends on**: T1, T2.
- **Owns**: `app/(product)/admin/page.tsx`; the three collapsible sections; the Users section's invite form; the Users table with inline role dropdowns; the typed-confirm Suspend inline form; the single-click Reinstate; the Recent invites list with `Resend` and `Re-invite` actions; the permanent 308 redirects from `/admin/invites` and `/admin/topic-proposals`; the self-action protection in the workflow module.
- **Workflow module**: `adminUsersWorkflow`.
- **Playwright journey**: `tests/e2e-browser/journeys/admin/users.spec.ts`. Invite a User; the masked-email success banner; change a User's role; suspend a User; reinstate a User; the current Admin's row disabled.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `adminUsersWorkflow`; component test for the Users section.

### T17. Admin Topics section

- **Migration step**: Admin (step 7).
- **Depends on**: T16.
- **Owns**: the Topics section of `/admin`; Pending Topic Proposals list with `Approve` and `Reject`; Active Topics list with `Retire` (typed-confirm); the transactional Approve flow that creates a new active Topic; the self-action protection that blocks the Admin from retiring a Topic they proposed.
- **Workflow module**: `adminTopicsWorkflow`.
- **Playwright journey**: `tests/e2e-browser/journeys/admin/topics.spec.ts`. Approve a Proposal; reject a Proposal; retire a Topic; the Admin who proposed cannot retire.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `adminTopicsWorkflow`; component test for the Topics section.

### T18. Admin Status section

- **Migration step**: Admin (step 7).
- **Depends on**: T16.
- **Owns**: the Status section of `/admin`; the generated timestamp; the 24h transactional Email health; the per-provider Calendar Connection summary; the Tokens-needing-refresh table; the read-only alert banners; the per-row `Refresh` and `Disconnect` actions.
- **Workflow module**: `adminStatusWorkflow`, plus thin calls to `calendarConnectionWorkflow` for the per-row actions.
- **Playwright journey**: `tests/e2e-browser/journeys/admin/status.spec.ts`. Page renders all three sections; warning banner appears when Email failure rate > 5% or when there is > 1 connection in `needs_reconnect`; no `Refresh now` button.
- **Closure evidence**: Playwright happy + failure; Vitest unit for `adminStatusWorkflow`; component test for the Status section.

### T19. End-to-end Admin journey

- **Migration step**: Admin (step 7, last).
- **Depends on**: T16, T17, T18.
- **Owns**: a single Playwright spec that drives the canonical Admin happy path: invite → role change → suspend → reinstate → approve proposal → reject proposal → retire topic → status page.
- **Playwright journey**: `tests/e2e-browser/journeys/admin/end-to-end.spec.ts`.
- **Closure evidence**: Playwright happy; Vitest unit; per-state screenshots; capture run for the full journey.

## 5. Tracker and parent-PRD closure tickets

### T20. PRD and sub-PRD amendments

- **Owns**: the in-place edits to top-level PRD #14 and the five sub-PRDs #15–#19. Each amendment adds: the canonical page-and-action URL ownership, the canonical workflow module, the browser-journey owner, the `Closure Evidence` template, the AGENTS.md acceptance bar check, the self-action protection, the SSR-by-default rule, the snapshot immutability rule, and the no-booking scope.
- **Closure evidence**: each PR has a human reviewer; each sub-PRD body contains the new sections; the parent PRD #14 explicitly lists each sub-PRD's closure evidence set.

### T21. E2E plan #62 in-place update

- **Owns**: the in-place edit of issue #62's body. The new body enumerates the three end-to-end Playwright journeys (one per role), each per-screen journey, the closure-evidence set, the visual capture policy, the workflow_dispatch-only CI lane, the Vitest-only PR CI gate, and the AGENTS.md acceptance bar.
- **Closure evidence**: the new body matches the locked Browser Acceptance subsection and the closure gates from `AGENTS.md`; the issue is reopened if it had been closed.

### T22. Migration compatibility adapter retirement

- **Owns**: removal of the legacy JSON endpoints after one minor version: `/api/searches/{id}`, `/search/{id}/snapshot`, `/search/history`. The 308 redirects remain in place for the duration of the minor version.
- **Depends on**: T20, T21, and every prior implementation ticket.
- **Closure evidence**: every test that called the legacy endpoints has been migrated; the legacy handlers return 404 with the canonical successor in the `Link` header; the audit at `docs/research/mvp-web-screen-and-tracker-coverage.md` is fully closed.

### T23. Stale test assertion cleanup

- **Owns**: a single follow-up ticket that updates every stale assertion in the existing `tests/e2e/` suite to match the canonical migration: the URL contract, the CSRF header shape, the JSON body shape for the surviving adapters, the form-POST vs Server-Action transition, and the `?feedback=<sealed>` re-render path. The ticket body lists every test file it touches.
- **Depends on**: T22.
- **Closure evidence**: the `pnpm test:e2e` suite is green; the ticket body enumerates the touched files with a one-line summary per file; the Vitest component tests on the new pages are also green.

## 6. Parent-PRD closure tickets

### T24. Top-level PRD #14 closure

- **Depends on**: T1–T23.
- **Owns**: the closure of issue #14. The closing comment reproduces the closure evidence set: every screen ticket under the five sub-PRDs is closed with the AGENTS.md closure evidence; the three end-to-end Playwright journeys pass; the visual capture run produces the per-screen baselines; the spec/PRD/E2E plan repair PRs are merged; a human reviewer has signed the closure.
- **Closure evidence**: the AGENTS.md closure-gate set reproduced verbatim; the link to each end-to-end Playwright journey run; the link to the visual capture artifacts; the human reviewer's sign-off.

### T25. Sub-PRD closures

- **Owns**: the closure of issues #15, #16, #17, #18, #19. Each sub-PRD closes on the same evidence set scoped to its sub-surface:
  - #15 (Search & Matching): T10–T15 closure evidence.
  - #16 (Auth & Invites): T3 closure evidence.
  - #17 (Calendar Connections): T8 closure evidence.
  - #18 (Admin & Notifications): T16–T19 closure evidence.
  - #19 (Profile & Setup): T4, T5, T6, T7, T9 closure evidence.
- **Closure evidence**: the per-sub-PRD subset of the AGENTS.md closure gates, reproduced in each sub-PRD's closing comment.

## 7. Dependency summary

```
T1 (browser harness + setup Home)
  └→ T2 (URL tree + auth/CSRF)
        ├→ T3 (magic-link)
        │    └→ T10 (User end-to-end)
        ├→ T4 (profile)
        ├→ T5 (discoverability)
        ├→ T6 (topics)
        ├→ T7 (availability)
        │    └→ T8 (calendar)
        ├→ T8 (calendar)
        ├→ T9 (self-delete)
        │    └→ T10 (User end-to-end)
        └→ T11 (search form)
             ├→ T12 (search result)
             │    └→ T13 (search history)
             │         ├→ T14 (/api/v1)
             │         └→ T15 (Organizer end-to-end)
             └→ T15 (Organizer end-to-end)
        └→ T16 (admin page + Users)
             ├→ T17 (admin topics)
             │    └→ T19 (Admin end-to-end)
             └→ T18 (admin status)
                  └→ T19 (Admin end-to-end)
T20 (PRD amendments) — independent; lands before any T* implementation.
T21 (E2E plan update) — independent; lands before any T* implementation.
T22 (compat adapter retirement) — depends on T20, T21, and every prior T*.
T23 (stale assertion cleanup) — depends on T22.
T24 (PRD #14 closure) — depends on T1–T23.
T25 (sub-PRD closures) — depends on T24.
```

The dependency graph is acyclic. Every node is reachable from T1. The graph respects the canonical migration order: shell → Search → Calendar → Availability → Topics → Consent → Admin.

## 8. Per-ticket Closure Evidence template

Every implementation ticket body has a `Closure Evidence` section with this template:

```markdown
## Closure Evidence

- Playwright happy-path spec: `tests/e2e-browser/.../<surface>.spec.ts`
- Playwright failure-path spec: `tests/e2e-browser/.../<surface>.spec.ts` (named `test('renders ... error state', ...)`)
- Vitest unit test: `src/workflow/<workflow>.test.ts`
- Component test: `app/.../<surface>.test.tsx`
- Visual capture: `tests/e2e-browser/screenshots/<screen>/<state>.png`; capture run at <link>
- AGENTS.md acceptance bar checked: <list of items>
- Closure PR: <link>
```

The closing PR comment reproduces each link verbatim.
