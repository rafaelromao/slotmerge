# Canonical Next.js Page and API Architecture

Decision artifact for [Choose canonical Next.js page and API architecture](https://github.com/rafaelromao/slotmerge/issues/280) under [Wayfinder: Complete SlotMerge MVP web app implementation plan](https://github.com/rafaelromao/slotmerge/issues/271).

This artifact is planning only. The architectural decisions here become binding for the MVP implementation tickets that follow. It is written against the locked decisions in `AGENTS.md`, the screen-coverage audit at `docs/research/mvp-web-screen-and-tracker-coverage.md`, and the browser-acceptance research at `docs/research/browser-acceptance-and-mocked-demo-options.md`. The SlotMerge glossary (`CONTEXT.md`) is authoritative for User, Organizer, Admin, Availability, Availability Window, Calendar Connection, Topic, Topic Proposal, Slot, Search, Search Result, Match, and Discoverability.

## 0. Decision summary

1. **Transport**: every screen-owning page is an RSC. Mutations go through Next.js Server Actions. The only non-page routes are the existing external seams (webhooks, OAuth callback, magic-link verify GET, sign-out, self-delete) and a narrow `/api/v1` read JSON seam.
2. **Modules**: vertical deep workflow modules with 1–3 entry points. They hide repositories, provider adapters, the application clock, and result types. Pages and Server Actions import the module; the module never imports a page.
3. **Search URLs**: `/searches` is the form, `/searches/{id}` is the Search Result, `/searches/history` is the shared history. `POST /searches/run` is the Server Action entry point.
4. **JSON helper**: a narrow `/api/v1` exposes read-only immutable Search Result (`/api/v1/searches/{id}`), shared history (`/api/v1/searches`), and setup status (`/api/v1/me/setup-status`). Every other workflow stays HTML-only.
5. **Authorization**: `requirePageContext(capability, path)` is the single helper. Pages call it; the helper returns the typed session, builds a safe sign-in URL with `returnTo`, and uses `notFound()` on role failure. No experimental `forbidden()`. No `proxy.ts`.
6. **CSRF**: keep the current per-session double-submit token in a `_csrf` hidden field. One `assertCsrfOrThrow` helper. Origin/Host layered on top.
7. **Client islands**: one client component (the existing `SlotDetailsDrawer`/`SlotDetailsIsland`). Every other screen stays RSC + Server Action. New islands are added only with a documented requirement and a progressive-enhancement plan.
8. **Form feedback**: Server Action returns a typed `Result<T, E>`. On validation failure the page re-renders with `fieldErrors` inline; on success the action performs a `303` to the canonical page.
9. **OAuth callback**: keep the collection route `/me/calendar-connections/callback` (GET and POST). The spec/PRD are repaired to declare this an intentional exception.
10. **Migration order**: shell + setup Home → Search → Calendar Connection → Availability → Topics → Discoverability → Admin. Each step keeps the existing e2e suite green via a thin compatibility adapter and lands Playwright coverage before deleting the legacy handler.

## 1. Locked seams the architecture must respect

These facts are binding and were treated as non-negotiable inputs to every design choice below:

- **Single full-stack web app, SSR by default, Next.js 16, React 19** (`AGENTS.md:21-25`).
- **Sealed session cookie via `@hapi/iron` with per-session CSRF, in-memory rate limiter on auth/OAuth endpoints** (`AGENTS.md:21-25`).
- **Internal matching module, DB-backed job queue, encrypted Calendar Connection tokens at rest, immutable Search Result JSON snapshot, no real-time/websocket endpoints** (`AGENTS.md:21-25`).
- **Vitest is the test framework; mocks implement only what tests assert against; the E2E plan calls for rendered HTML and a real-browser harness, gated on issue 273/274** (`AGENTS.md:23-24`, `docs/research/browser-acceptance-and-mocked-demo-options.md`).
- **Local runtime: `pnpm local:up` brings up `web`, `worker`, and `postgres`** (`docs/local-stack.md:5-14`).
- **Out of scope: booking, RSVP, calendar event creation, reservation, notification inbox, copy/share handoff aids** (`PRODUCT.md:17-21`, `docs/mvp-spec.md:355-366`).
- **The audit's "API-only false completion" failure is the binding constraint on what counts as closure evidence** (`docs/research/mvp-web-screen-and-tracker-coverage.md:248-262`).

## 2. Why this design and not the others

Four candidate architectures were evaluated (Server-Actions + RSC, HTTP-first `/api/v1`, Server-Actions + narrow read helpers, current handlers + a new layout). The trade-offs that led to the chosen design:

- **HTTP-first `/api/v1` (with RSC self-fetch)** was rejected because it forces every page to do a loopback HTTP call, re-validates a response schema the same process just serialized, re-runs session authorization, adds an internal-origin config (`APP_INTERNAL_URL`), and creates two callable interfaces per workflow (page and HTTP) that can drift. The audit's only in-progress closure evidence is rendered HTML, not HTTP shape parity.
- **Server-Actions + narrow read helpers** was the close second; the choice was between `helpers/{search,setup-status}/route.ts` and a versioned `/api/v1/{searches,me/setup-status}` namespace. The versioned namespace was preferred so the seam is named, versioned, and matches the official Next.js guidance for "Backend for Frontend" public endpoints (`https://nextjs.org/docs/app/guides/backend-for-frontend`, accessed 2026-07-20).
- **Current handlers + a new layout** was rejected because it preserves the "API-only false completion" shape. Adding `page.tsx` next to current `route.ts` files would also fail the Next.js "page and route at the same segment" constraint (`https://nextjs.org/docs/app/getting-started/route-handlers`, accessed 2026-07-20) for every user-facing screen.
- **Server-Actions + RSC-only** wins because it satisfies the binding decisions (SSR by default, sealed sessions + CSRF, immutable snapshots, no booking surface) and removes the layered false-completion risk.

## 3. The canonical page-and-action URL tree

```
app/
├── layout.tsx                                 root shell; loads role-aware nav
├── page.tsx                                   GET /              setup checklist Home (User/Organizer/Admin)
├── not-found.tsx
├── error.tsx
│
├── (public)/
│   ├── sign-in/page.tsx                        GET /sign-in      email + magic-link request form
│   ├── sign-in/sent/page.tsx                   GET /sign-in/sent  "check your email"
│   └── sign-in/verify/page.tsx                 GET /sign-in/verify?token=…  confirmation
│
├── (auth)/                                    external seams (no app chrome)
│   ├── magic-link/request/route.ts             POST /auth/magic-link/request
│   ├── magic-link/verify/route.ts              GET/POST /auth/magic-link/verify  (external, one-shot)
│   ├── magic-link/resend/route.ts              POST /auth/magic-link/resend
│   └── session/route.ts                        DELETE /auth/session  (sign-out)
│
├── (product)/
│   ├── layout.tsx                             role-aware authenticated shell
│   │
│   ├── me/
│   │   ├── page.tsx                           GET /me           profile + setup overview
│   │   ├── profile/page.tsx                   GET /me/profile   display name, timezone, buffer
│   │   ├── discoverability/page.tsx           GET /me/discoverability
│   │   ├── topics/page.tsx                    GET /me/topics    active Topic + Topic Proposals
│   │   ├── availability/page.tsx              GET /me/availability  weekly windows + overrides
│   │   ├── calendar-connections/page.tsx      GET /me/calendar-connections  list + health
│   │   └── delete/page.tsx                    GET /me/delete    confirm self-delete
│   │
│   ├── searches/
│   │   ├── page.tsx                           GET  /searches          Search form (Organizer/Admin)
│   │   ├── history/page.tsx                   GET  /searches/history  shared history
│   │   ├── [id]/
│   │   │   ├── page.tsx                       GET  /searches/{id}     Search Result (drawer)
│   │   │   └── rerun/page.tsx                 GET  /searches/{id}/rerun confirm page (rare; default is form button)
│   │   └── run/route.ts                      POST /searches/run     Server Action entry (PRG 303 → /searches/{id})
│   │
│   ├── admin/
│   │   ├── layout.tsx                         role guard (admin only)
│   │   ├── page.tsx                           GET /admin            redirect → /admin/users
│   │   ├── users/page.tsx                     GET /admin/users      invites, roles, status
│   │   ├── topics/page.tsx                    GET /admin/topics     Topic Proposals + active Topics
│   │   └── status/page.tsx                    GET /admin/status     provider sync + Email health
│   │
│   └── account/
│       └── delete/page.tsx                    GET /account/delete   confirm self-delete (alias of /me/delete)
│
├── (external)/                                provider-driven seams
│   ├── auth/
│   │   └── magic-link/verify/route.ts         (kept under app/auth/ for provider URL compatibility)
│   ├── me/calendar-connections/
│   │   ├── connect/google/route.ts            POST  provider OAuth start
│   │   ├── connect/microsoft/route.ts         POST  provider OAuth start
│   │   ├── callback/route.ts                 GET/POST  collection callback (intentional exception)
│   │   └── [id]/
│   │       ├── calendars/route.ts             POST  contributing calendars
│   │       ├── refresh/route.ts               POST  manual sync
│   │       └── disconnect/route.ts            POST  disconnect
│   ├── webhooks/google/calendar/route.ts      POST  provider webhook
│   └── webhooks/microsoft/calendar/route.ts   POST  provider webhook
│
├── api/
│   ├── v1/
│   │   ├── searches/route.ts                 GET   /api/v1/searches            shared history (read-only)
│   │   ├── searches/[id]/route.ts            GET   /api/v1/searches/{id}      immutable Search Result
│   │   └── me/setup-status/route.ts          GET   /api/v1/me/setup-status    checklist payload
│   ├── local/                                APP_ENV-gated smoke endpoints (unchanged)
│   └── health/route.ts                        GET /api/health                  liveness (read-only)
│
└── webhooks/                                 alias of (external)/webhooks for back-compat
    └── (symlinks intentionally not used; paths live under (external)/)
```

URL consolidation rules:

- `app/page.tsx` and `app/route.ts` never occupy the same segment. Pages and Server Actions live under `(product)/`; external seams live under `(external)/`; narrow JSON lives under `/api/v1`.
- `route groups` like `(public)`, `(product)`, and `(external)` exist only to scope the layout (`src/app/.../docs/01-app/02-guides/route-groups`); they do not appear in URLs.
- `searches/[id]` becomes the Search Result page. The legacy `searches/[id]/results` is a permanent 308 redirect.
- The legacy `me/topics` standalone HTML handler becomes an RSC page; the route segment is preserved.
- The legacy `admin/invites` and `admin/topic-proposals` are absorbed into `/admin/users` and `/admin/topics` respectively, with a tab anchor (`#invites`, `#proposals`) so existing links survive as 308 redirects.

## 4. The narrow /api/v1 read seam

These three endpoints are the only non-form JSON surface. Each is a thin read-only adapter over the same workflow module the page uses. The serializer is shared with the page's DTO so the wire shape is identical to what the page renders.

| Endpoint | Workflow module | Method | Purpose |
| --- | --- | --- | --- |
| `GET /api/v1/searches/{id}` | `loadSearchResultWorkflow` | `GET` | Immutable Search Result snapshot for the Search history page, browser journeys, and any future non-browser client. |
| `GET /api/v1/searches` | `listSearchHistoryWorkflow` | `GET` | Shared Search history for Organizer/Admin. Same as the `/searches/history` page's DTO. |
| `GET /api/v1/me/setup-status` | `setupHomeWorkflow.loadSetupState` | `GET` | The four required + one optional checklist payload, returned as JSON. The `/` page reads the same workflow directly; this adapter exists so future non-browser clients and the search/calendar banners can read the same payload. |

The `/api/v1` namespace is locked; new entries require a new ticket. `/api/local/**` stays as the local-test smoke surface. Webhook and OAuth endpoints remain outside `/api/v1` because they are not part of the public application contract.

## 5. The deep workflow modules

Each module is the unit that a page, a Server Action, a `/api/v1` adapter, and the test surface all import. Repository and provider adapters stay behind an internal seam inside the module; the module exports only its entry points and their `Result` types. There are 1–3 entry points per module. The audit's primary closure evidence is "the workflow module returns the right Result for the right role and inputs."

```ts
// src/workflow/auth.ts
export type AuthWorkflow = {
  requestMagicLink(input: { email: string; requestContext: RequestContext }): Promise<Result<void, AuthError>>;
  verifyMagicLink(input: { token: string; requestContext: RequestContext }): Promise<Result<{ sessionCookie: string; user: SessionUser }, AuthError>>;
  endSession(input: { sessionId: string }): Promise<Result<void, AuthError>>;
};
```

```ts
// src/workflow/profile.ts (1–3 entry points; setup-availability-topics consolidated)
export type ProfileWorkflow = {
  loadMe(input: { userId: string }): Promise<MeView>;
  updateProfile(input: { userId: string; patch: ProfilePatch }): Promise<Result<MeView, ProfileError>>;
  setTopicsAndAvailability(input: { userId: string; topics?: TopicMutation; availability?: AvailabilityMutation }): Promise<Result<MeView, ProfileError>>;
};
```

```ts
// src/workflow/discoverability.ts
export type DiscoverabilityWorkflow = {
  set(input: { userId: string; granted: boolean }): Promise<Result<{ discoverable: boolean }, ProfileError>>;
};
```

```ts
// src/workflow/availability.ts
export type AvailabilityWorkflow = {
  load(input: { userId: string }): Promise<AvailabilityView>;
  addWindow(input: { userId: string; window: CreateWindow }): Promise<Result<AvailabilityView, AvailabilityError>>;
  removeWindow(input: { userId: string; id: string }): Promise<Result<void, AvailabilityError>>;
};
```

```ts
// src/workflow/topic.ts
export type TopicWorkflow = {
  listActive(): Promise<ActiveTopic[]>;
  listMyProposals(input: { userId: string }): Promise<PendingProposal[]>;
  propose(input: { userId: string; candidateName: string }): Promise<Result<{ proposalId: string }, TopicError>>;
};
```

```ts
// src/workflow/calendar-connection.ts (3 entry points; the lifecycle is one vertical)
export type CalendarConnectionWorkflow = {
  loadPage(input: { userId: string }): Promise<CalendarConnectionPageState>;
  startOAuth(input: { userId: string; provider: "google" | "microsoft" }): Promise<Result<{ authorizeUrl: string }, CalendarError>>;
  mutateConnection(input: { userId: string; connectionId: string; action: "set-calendars" | "disconnect" | "refresh"; payload?: { selectedCalendarIds?: string[] } }): Promise<Result<CalendarConnectionView, CalendarError>>;
};
```

```ts
// src/workflow/search.ts
export type SearchWorkflow = {
  buildForm(actorId: string): Promise<SearchFormModel>;
  run(actorId: string, raw: SearchFormSubmission): Promise<Result<{ searchId: string; snapshotId: string }, SearchError>>;
  listHistory(actorId: string): Promise<HistoryRow[]>;
  openSnapshot(actorId: string, searchId: string): Promise<Result<SearchSnapshotView, SearchError>>;
  rerun(actorId: string, searchId: string): Promise<Result<{ newSearchId: string; snapshotId: string }, SearchError>>;
};
```

```ts
// src/workflow/admin.ts (one module per Admin page; 1–3 entry points each)
export type AdminUsersWorkflow = {
  load(): Promise<AdminUsersPageState>;
  invite(actorId: string, input: { email: string; role: UserRole }): Promise<Result<void, AdminError>>;
  setUser(actorId: string, targetUserId: string, input: { role?: UserRole; status?: UserStatus }): Promise<Result<UserRecord, AdminError>>;
};
export type AdminTopicsWorkflow = {
  load(): Promise<AdminTopicsPageState>;
  decideProposal(actorId: string, proposalId: string, status: "approved" | "rejected"): Promise<Result<void, AdminError>>;
  retireTopic(actorId: string, topicId: string): Promise<Result<void, AdminError>>;
};
export type AdminStatusWorkflow = {
  load(): Promise<AdminStatusPageState>;
};
```

```ts
// src/workflow/account.ts (self-delete; Admin suspend/reinstate remains in admin.ts)
export type AccountWorkflow = {
  selfDelete(actorId: string): Promise<Result<void, AccountError>>;
};
```

The implementation hides:

- `RequestContext` (the locked single global clock, request id, ipHash, userAgent).
- The repository layer (Drizzle vs in-memory).
- The provider adapter (real arctica vs in-memory).
- The email delivery service (Postmark vs mock).
- The rate limiter (in-memory today; pluggable later).
- Sealed cookie/response shaping.

The module never imports `next/navigation`, `next/server`, or `react`. Its only consumer-side knowledge is the typed `RequestContext` and the typed `Result<T, E>`.

## 6. Page and Server Action examples

### 6.1 Setup checklist Home

```tsx
// app/page.tsx
import { setupHomeWorkflow } from "@/workflow/setup-home";
import { requirePageContext } from "@/lib/page-context";
import { SetupChecklistView } from "./_components/SetupChecklistView";

export default async function HomePage() {
  const context = await requirePageContext({ roles: ["user", "organizer", "admin"] });
  const state = await setupHomeWorkflow.load(context);
  return <SetupChecklistView state={state} csrfToken={context.csrfToken} />;
}
```

### 6.2 Search form and runSearchAction

```tsx
// app/(product)/searches/page.tsx
import { requirePageContext } from "@/lib/page-context";
import { searchWorkflow } from "@/workflow/search";
import { topicWorkflow } from "@/workflow/topic";
import { SearchForm } from "./_components/SearchForm";

export default async function SearchPage() {
  const context = await requirePageContext({ roles: ["organizer", "admin"] });
  const [form, activeTopics] = await Promise.all([
    searchWorkflow.buildForm(context.user.id),
    topicWorkflow.listActive(),
  ]);
  return <SearchForm form={form} activeTopics={activeTopics} csrfToken={context.csrfToken} />;
}
```

```ts
// app/(product)/searches/run/route.ts
import { searchWorkflow } from "@/workflow/search";
import { requirePageContext } from "@/lib/page-context";
import { assertCsrfOrThrow } from "@/lib/csrf";
import { parseFormSubmission } from "./_lib/parse-form-submission";
import { redirect } from "next/navigation";

export async function POST(request: Request) {
  const context = await requirePageContext({ roles: ["organizer", "admin"] });
  await assertCsrfOrThrow(request, context.session);
  const formData = await request.formData();
  const parsed = parseFormSubmission(formData);
  if (!parsed.ok) {
    // Re-render the form with field errors: redirect to /searches?feedback=...
    return Response.redirect(new URL(`/searches?feedback=${encodeURIComponent(parsed.feedbackToken)}`, request.url), 303);
  }
  const result = await searchWorkflow.run(context.user.id, parsed.value);
  if (!result.ok) {
    return Response.redirect(new URL(`/searches?feedback=${encodeURIComponent(result.feedbackToken)}`, request.url), 303);
  }
  return Response.redirect(new URL(`/searches/${result.value.searchId}`, request.url), 303);
}
```

The form posts here, the action does the validation and the run, and on success we PRG-redirect to the Search Result page. The Search Result page reads `searchWorkflow.openSnapshot(userId, searchId)` directly — no `fetch("/api/v1/...")` round-trip.

### 6.3 Search Result with single client island

```tsx
// app/(product)/searches/[id]/page.tsx
import { requirePageContext } from "@/lib/page-context";
import { searchWorkflow } from "@/workflow/search";
import { notFound } from "next/navigation";
import { WeeklyGridServer } from "./_components/WeeklyGridServer";
import { SlotDetailsDrawer } from "./_components/SlotDetailsDrawer";

export default async function SearchResultPage({ params }: { params: Promise<{ id: string }> }) {
  const context = await requirePageContext({ roles: ["organizer", "admin"] });
  const { id } = await params;
  const view = await searchWorkflow.openSnapshot(context.user.id, id);
  if (!view.ok) notFound();

  return (
    <>
      <WeeklyGridServer snapshot={view.value.snapshot} />
      <SlotDetailsDrawer slots={view.value.snapshot.slots} />
    </>
  );
}
```

The grid is a server component that renders the entire weekly grid; the drawer is the only client component, with the same `use client` boundary and `data-testid` hooks the current `SlotDetailsDrawer` already exposes.

### 6.4 Calendar Connection page (no client island)

```tsx
// app/(product)/me/calendar-connections/page.tsx
import { requirePageContext } from "@/lib/page-context";
import { calendarConnectionWorkflow } from "@/workflow/calendar-connection";
import { CalendarConnectionsView } from "./_components/CalendarConnectionsView";
import { GoogleConnectAction, MicrosoftConnectAction, DisconnectAction, RefreshAction, SelectCalendarsAction } from "./_actions";

export default async function CalendarConnectionsPage() {
  const context = await requirePageContext({ roles: ["user", "organizer", "admin"] });
  const state = await calendarConnectionWorkflow.loadPage(context.user.id);
  return (
    <CalendarConnectionsView
      state={state}
      csrfToken={context.csrfToken}
      actionBindings={{
        google: GoogleConnectAction,
        microsoft: MicrosoftConnectAction,
        disconnect: DisconnectAction,
        refresh: RefreshAction,
        selectCalendars: SelectCalendarsAction,
      }}
    />
  );
}
```

Every mutation is a Server Action. OAuth is initiated by `POST /me/calendar-connections/connect/google` returning `303` to the provider `authorizeUrl` (because OAuth hand-off cannot be a Server Action without losing provider semantics).

## 7. CSRF and role enforcement

The two helpers below are the only CSRF and role seams the codebase has. Every page, Server Action, and route handler imports one or both.

```ts
// src/lib/page-context.ts
export type Capability = { roles: ReadonlyArray<UserRole> };
export type PageContext = {
  user: SessionUser;
  csrfToken: string;
  isAuthed: true;
  isAdmin: boolean;
  isOrganizerOrAdmin: boolean;
};
export async function requirePageContext(capability: Capability, request: Request): Promise<PageContext>;
```

Behavior:
- Missing or expired session: 303 to `/sign-in?returnTo=<safe-relative-path>`. The `returnTo` is allowlisted (relative paths under `/` only).
- Wrong role: `notFound()` (stable 404, avoids experimental `forbidden()`). Mutation handlers and JSON endpoints return a typed `forbidden` error; the page tree renders a 404 instead of a 403 page.
- Suspended user: treated as unauthenticated.

```ts
// src/lib/csrf.ts
export async function assertCsrfOrThrow(request: Request, session: Session): Promise<void>;
export async function assertCsrfFromFormData(formData: FormData, session: Session): Promise<void>;
```

Both helpers:
- Compare tokens with `timingSafeEqual`.
- Verify `Origin` matches the configured `APP_PUBLIC_URL` for `POST`/`PUT`/`PATCH`/`DELETE`.
- Reject `Sec-Fetch-Site: cross-site` if present.
- Do **not** log tokens.
- Return early on success; throw a typed `CsrfError` (mapped to a generic `403` at the edge) on failure.

Server Actions and form route handlers both use `assertCsrfOrThrow`. The CSRF token is delivered to the page as `csrfToken` on `PageContext` and embedded in every form via `<input type="hidden" name="_csrf" value={csrfToken} />`. Cookies remain `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` is set outside `local`/`test`.

## 8. Form feedback and PRG

Two cases:

1. **Validation failure**: the Server Action returns a structured `Result<T, E>` with `kind: "validation"` and a `fieldErrors` map. The form re-renders with errors next to fields. The action also seals a short feedback token bound to form id, target path, session CSRF hash, and timestamp; the URL becomes `/searches?feedback=<sealed>` so the page re-render carries the structured state across the PRG redirect.
2. **Success**: the action performs `Response.redirect(new URL("/searches/{id}", request.url), 303)`. Cookies and session state are preserved; the browser performs a GET; the next page is fully RSC.

Feedback tokens are short-lived `@hapi/iron` tokens. They are bound to the form id and the session's CSRF hash, and contain only the structured `fieldErrors` and a small `notice` string. They are not logged and contain no implementation details.

## 9. Client island policy

Default: zero client JavaScript. A component is `"use client"` only if it has interactive state or browser-only APIs. Mapping the screen inventory:

| Component | Justified by |
| --- | --- |
| `SlotDetailsDrawer` (existing) | open/close + Escape + focus trap + body scroll lock. |
| (no others for MVP) | — |

Everything else is RSC + Server Action. The CSRF token and session are read server-side; client components receive only the data they need.

The Slot Details Drawer is preserved exactly; its existing `data-testid` hooks (`data-testid="slot-details-drawer"`, `data-testid="slot-details-drawer-overlay"`, `data-testid="drawer-close"`) and the slot buttons (`data-testid="slot-{day}-{slot}"`) are the test surface for Playwright.

## 10. Migration plan

Each step keeps the existing e2e suite green and lands Playwright coverage for the new page before deleting the legacy handler.

1. **Shell + setup Home**: introduce `requirePageContext`, `assertCsrfOrThrow`, the workflow module shells, and `app/page.tsx` as the setup checklist. The compatibility adapter keeps `app/page.tsx` redirecting to itself once. Browser journey: home as signed-in User.
2. **Search**: migrate `/searches/{id}/results` to canonical URL; add `/searches` form; add `runSearchAction`; add `/api/v1/searches/{id}` and `/api/v1/searches` adapters; 301-redirect legacy `/api/searches/{id}` and `/search/{id}/snapshot` to the new paths. Browser journey: form → result → drawer → history reopen.
3. **Calendar Connection**: migrate `/me/calendar-connections` to RSC; keep `/me/calendar-connections/{provider}/connect` and `/me/calendar-connections/callback` and `/me/calendar-connections/{id}/{calendars,refresh,disconnect}` as external route handlers. Repair the spec to declare the callback exception. Browser journey: connect Google → toggle calendars → disconnect → reconnect → see stale.
4. **Availability**: migrate `/me/availability` to RSC; add Server Actions for windows and overrides; URL repair per Section 11. Browser journey: add weekly window, add override, block override, edit buffer.
5. **Topics**: migrate `/me/topics` to RSC; add Server Actions for selection and propose; replace `?error=` round-trip with structured `fieldErrors`. Browser journey: select Topics, propose a Topic, see similarity error, see pending list.
6. **Discoverability**: migrate `/me/discoverability` to RSC; add Server Actions for grant and revoke. Browser journey: grant consent, see eligibility change.
7. **Admin**: replace `renderAdminShell` with a single RSC layout under `(product)/admin/`. Migrate `/admin/invites`, `/admin/users`, `/admin/topic-proposals`, `/admin/topics`, `/admin/status` to RSC + Server Actions. Absorb `/admin/invites` into `/admin/users` (tab anchor) and `/admin/topic-proposals` into `/admin/topics` (tab anchor). 308 redirect the old paths. Browser journey: invite a User, change role, suspend, reinstate, approve/reject/retire Topic.

Compatibility invariant: every existing `tests/e2e/**/*.test.ts` continues to pass at every step, because the workflow module is the new source of truth and the old handlers are adapters over it. Old JSON tests keep their response shape; the test fix is `URL` only.

## 11. URL consolidation decisions for spec/PRD/E2E repair

These are the URL and contract changes the canonical plan implies. Ticket #277 already owns the spec/PRD/E2E repair; this list is what #277 should commit.

| Concern | Current code/spec | Canonical |
| --- | --- | --- |
| Search POST | spec: `POST /searches`; code: none | `POST /searches/run` (Server Action) + `/api/v1/searches` GET (history) |
| Search result read | code: `GET /api/searches/{id}` and `GET /search/{id}/snapshot` | `GET /api/v1/searches/{id}` (only) |
| Search result page | code: `GET /searches/{id}` redirects to `/searches/{id}/results` | `GET /searches/{id}` is the Search Result; `/results` is a permanent 308 alias |
| Search history | code: `GET /searches` JSON and `GET /search/history` JSON | `GET /searches/history` page + `GET /api/v1/searches` JSON |
| Availability windows | spec: `PUT /me/availability/windows`; code: `POST /me/availability-windows` + `PATCH /me/availability-windows/{id}` | RSC page at `/me/availability` + Server Actions; JSON only via `/api/v1/me/setup-status` |
| Calendar Connection callback | spec: `POST /me/calendar-connections/{id}/callback`; code: `POST /me/calendar-connections/callback` | Collection route is canonical; spec is repaired to declare it an intentional exception |
| Admin invites | code: `/admin/invites` standalone | Absorbed into `/admin/users`; `/admin/invites` is a 308 alias with `#invites` anchor |
| Admin Topic curation | code: split across `/admin/topic-proposals` and `/admin/topics` | One `/admin/topics` page with a `#proposals` tab; old paths 308 alias |
| Setup checklist | spec: implicit; code: `app/page.tsx` is a two-line scaffold | `GET /` is the setup checklist Home (User/Organizer/Admin) |

## 12. The role-aware layout

`app/(product)/layout.tsx` reads the session, builds the nav from one source, and applies the role gate once at the segment boundary. Pages still call `requirePageContext` for the data fetch. The nav is rendered server-side; the role is not hidden in a client component. Components:

- `RoleNav` — server component that lists nav items filtered by the session role.
- `Layout` — `<html>`, `<body>`, role-aware nav, page content, role-aware footer, error boundary.
- `error.tsx` and `not-found.tsx` per segment (root, `(product)`, `(public)`).

The nav is rendered once per request and not hidden client-side. Hidden nav is presentation, not authorization.

## 13. What this design explicitly does not do

- Does not change the locked stack: Next 16, React 19, sealed sessions, drizzle, Graphile Worker, pino, arctica, pnpm, Vitest.
- Does not add booking, RSVP, calendar event creation, reservation, notification inbox, copy/share handoff aids (out of scope per `PRODUCT.md:17-21` and `docs/mvp-spec.md:355-366`).
- Does not add Microsoft personal-account support.
- Does not introduce a global client store, a router-level data cache, or client-side data fetching libraries.
- Does not reopen the matching algorithm or Search Result immutability.
- Does not create a `/api/v1` mirror of every workflow. Only the three read-only adapters earn a JSON seam.
- Does not change the persistence shape.
- Does not replace the per-session CSRF mechanism; it only centralizes its enforcement and adds Origin/Host and Sec-Fetch-Site checks.
- Does not introduce an experimental `forbidden()` page; role failure is `notFound()`.

## 14. Closure criteria for ticket #280

When ticket #280 closes, the canonical plan answers "yes" to every one of these:

- [ ] Every screen in `docs/mvp-spec.md` section 4 has a named RSC page (or is explicitly deferred with a reason).
- [ ] Every page has a Server Action file or an external route handler for its mutations, with the canonical URL.
- [ ] Every workflow module exports 1–3 entry points and returns typed `Result<T, E>`.
- [ ] The only non-form non-external routes under `app/` are `/api/v1/searches`, `/api/v1/searches/{id}`, `/api/v1/me/setup-status`, `/api/health`, and `/api/local/*`.
- [ ] Role enforcement has one implementation (`requirePageContext`) and CSRF has one implementation (`assertCsrfOrThrow`).
- [ ] Migration order is shell → Search → Calendar → Availability → Topics → Consent → Admin, with a Playwright journey per step.
- [ ] `app/(product)/layout.tsx` is a role-aware shell; nav links are filtered server-side.
- [ ] `/me/calendar-connections/callback` is declared an intentional exception in `docs/mvp-spec.md` and the E2E plan.
- [ ] Each of the URL changes in Section 11 has a 308 redirect until repository callers and browser journeys are migrated.

## 15. Pointers for the next tickets

- **#276 (role-aware shell + screen hierarchy):** consume `requirePageContext` and the role list; emit the nav from one server component under `app/(product)/layout.tsx`. The shell is the migration step 1 deliverable.
- **#275 (User journey):** consume `profileWorkflow`, `discoverabilityWorkflow`, `topicWorkflow`, `availabilityWorkflow`, `accountWorkflow`; render `app/(product)/me/*` and `app/(product)/account/*` pages. Each page's mutation is a Server Action.
- **#278 (Organizer Search journey):** consume `searchWorkflow`; render `app/(product)/searches/*`; write the Playwright journey for form → result → drawer → history reopen.
- **#281 (Admin journey):** consume `adminUsersWorkflow`, `adminTopicsWorkflow`, `adminStatusWorkflow`; render `app/(product)/admin/*`; write the Playwright journey for invite → magic link → setup → Organizer run Search → Admin sees history → Admin approves Topic Proposal → Admin retires a Topic.
- **#274 / #273 (browser acceptance):** the recommended Playwright Test harness runs against the running web container with per-role `storageState`; the role-aware `requirePageContext` is the seam that lets the test fixture mint an authenticated cookie without a UI flow (for setup) and then drive the UI for the assertion.
- **#279 (completion gates):** every closure requires (a) the RSC page renders in the browser, (b) the Server Action round-trips with CSRF and role, (c) the workflow Vitest passes, (d) the Playwright journey passes.
- **#277 (repair spec):** update `docs/mvp-spec.md` Section 7 API surface, Section 4 routes, and the per-screen text to match this design; explicitly mark mutations as Server Actions; explicitly mark `/me/calendar-connections/callback` as the surviving non-RSC seam; mark `POST /searches/run`, `GET /api/v1/searches`, `GET /api/v1/searches/{id}`, `GET /api/v1/me/setup-status` as the canonical transport.
