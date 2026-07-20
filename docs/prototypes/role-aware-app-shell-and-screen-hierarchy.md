# Role-aware App Shell and Screen Hierarchy Prototype

Prototype asset for [Prototype role-aware app shell and screen hierarchy](https://github.com/rafaelromao/slotmerge/issues/276) under [Wayfinder: Complete SlotMerge MVP web app implementation plan](https://github.com/rafaelromao/slotmerge/issues/271).

This artifact is a prototype, not a contract. It is grounded in the canonical architecture at `docs/research/canonical-next-page-api-architecture.md`, the screen-coverage audit at `docs/research/mvp-web-screen-and-tracker-coverage.md`, the MVP prototype wireframe at `docs/prototypes/core-search-workflow.md`, the design system in `app/globals.css`, and the locked decisions in `AGENTS.md`. The SlotMerge glossary in `CONTEXT.md` is authoritative.

## 0. Decision summary

1. **Shell scope**: a single signed-in `(product)` layout owns the top bar, role-aware nav, and per-segment error boundaries. Auth screens (`/sign-in`, `/sign-in/sent`, `/sign-in/verify`) render without any app chrome so the auth flow stays focused.
2. **Top bar**: logo (Home) on the left, role-filtered primary items in the middle, current User avatar + dropdown on the right. The primary items are: Home (always), Search (Organizer/Admin). Search history is a sub-item under Search. Admin items (Users, Topics, Status) are top-nav primary for Admin only.
3. **Setup home**: `/` is the setup checklist. The top nav never duplicates the checklist. A small `Setup status` chip in the top nav (right side, before the avatar) is a permanent reminder that links to `/`. The drawer, search, and admin links remain available even when setup is incomplete.
4. **Role visibility**: nav items render by role. Direct deep links to `/search/*` and `/admin/*` for plain Users still 404 because the page calls `requirePageContext`.
5. **Calendar status badge**: a small dot + tooltip in the top nav sourced from `/api/v1/me/setup-status`. Clicking navigates to `/me/calendar-connections`. Neutral / warning / danger / muted colors match the existing `--success`, `--warning`, `--danger`, and `--text-subtle` tokens.
6. **Responsive shape**: three tiers. `>= 1024px` desktop top bar with full primary nav. `768–1023px` tablet top bar with primary items collapsed into a hamburger drawer. `< 768px` mobile top bar with logo + avatar + hamburger; the drawer holds primary items.
7. **Errors and footer**: no footer. Per-segment `error.tsx` and `not-found.tsx` under `(public)`, `(product)`, and `(product)/admin`. The role-aware layout owns the page-level error boundary for the signed-in app.
8. **Empty states**: every list page renders an inline empty state with a primary action that goes to the next logical setup step. They share the `.empty-state` primitive at `app/globals.css:243-257`.
9. **Avatar dropdown**: My Profile + Sign Out for the MVP. The shape is extensible for My Topics, My Availability, My Calendar Connections, Account, Admin (when Admin), and Delete account.
10. **Search vs Search history**: Search is the top-nav primary item for Organizer/Admin. Search history is a sub-item of Search, accessible from the Search dropdown or as a tab on `/searches`.

## 1. Why these decisions

The prototype wireframe at `docs/prototypes/core-search-workflow.md:7-17` shows one primary shell with role-aware navigation. The audit at `docs/research/mvp-web-screen-and-tracker-coverage.md:21-22` calls out that this shell is missing. The canonical architecture at `docs/research/canonical-next-page-api-architecture.md:3,5` commits to RSC pages with a single signed-in `(product)` layout.

The shape chosen here satisfies all three: the prototype is the user mental model, the audit names the gap, and the architecture pins the file layout. Alternatives rejected:

- A left sidebar would have doubled the chrome surface and the test surface, with no fidelity benefit at the MVP's information density.
- A separate `(public)` shell for sign-in would have leaked marketing chrome into a focused auth flow.
- A persistent setup checklist on every page would have been noisy and would have hidden the `/` page from the prototype's "Continue setup" affordance.

## 2. The route hierarchy

```
/                                         setup checklist Home (User/Organizer/Admin)
├── (public)/
│   ├── /sign-in                          email + magic-link request form
│   ├── /sign-in/sent                     "check your email"
│   └── /sign-in/verify?token=…           confirmation
│
├── (product)/
│   ├── /me                               profile + setup overview
│   │   ├── /me/profile                   display name, timezone, buffer
│   │   ├── /me/topics                    active Topic + Topic Proposals
│   │   ├── /me/availability              weekly windows + overrides
│   │   └── /me/calendar-connections      list + health
│   │
│   ├── /searches                         Search form (Organizer/Admin)
│   │   └── /searches/history             shared history
│   │   └── /searches/{id}                Search Result
│   │
│   ├── /account/delete                   confirm self-delete
│   │
│   └── /admin
│       ├── /admin                        redirect → /admin/users
│       ├── /admin/users                  invites, roles, status
│       ├── /admin/topics                 Topic Proposals + active Topics
│       └── /admin/status                 provider sync + Email health
│
├── /api/v1
│   ├── /api/v1/me/setup-status           setup checklist payload (JSON)
│   ├── /api/v1/searches                  shared history
│   └── /api/v1/searches/{id}             immutable Search Result
│
├── /api/health
├── /api/local/*                          local-only smoke endpoints
│
└── external seams (route groups excluded for URL stability)
    ├── /auth/magic-link/request          POST
    ├── /auth/magic-link/verify           GET/POST
    ├── /auth/magic-link/resend           POST
    ├── /auth/session                     DELETE
    ├── /me/calendar-connections/connect/google         POST
    ├── /me/calendar-connections/connect/microsoft      POST
    ├── /me/calendar-connections/callback                GET/POST (intentional exception)
    ├── /me/calendar-connections/{id}/calendars          POST
    ├── /me/calendar-connections/{id}/refresh            POST
    ├── /me/calendar-connections/{id}/disconnect         POST
    └── /webhooks/{google,microsoft}/calendar             POST
```

`route groups` like `(public)` and `(product)` are layout-scoped only; URLs do not include them. This is consistent with the canonical architecture at `docs/research/canonical-next-page-api-architecture.md:3`.

## 3. The role-aware top bar

The top bar is a single server component. It reads the session from `loadSessionFromCookies()` (the same helper that `requirePageContext` uses internally) and renders only the nav items the session's role is allowed to see. The role check is at the page gate; the nav is presentation.

### 3.1 Desktop (>= 1024px)

```
+----------------------------------------------------------------+
| [SlotMerge]   Home   Search ▾   Admin ▾   [Setup]  [📅]   [👤] |
|                  (User)  (O/A)   (Admin)   (chip)  (cal) (menu) |
+----------------------------------------------------------------+
```

- `[SlotMerge]` links to `/`.
- `Home` is always visible. For an authenticated User with incomplete setup, `Home` is the setup checklist. For an Organizer/Admin, `Home` is the same checklist (rendered identically; the audit calls out that the checklist is universal — `docs/research/mvp-web-screen-and-tracker-coverage.md:116-120`).
- `Search` is visible to Organizer and Admin. Hovering opens a small dropdown: `Run Search` (links to `/searches`) and `Search history` (links to `/searches/history`).
- `Admin` is visible to Admin only. Hovering opens: `Users` (`/admin/users`), `Topics` (`/admin/topics`), `Status` (`/admin/status`).
- `[Setup]` chip is visible when the checklist is incomplete. Click navigates to `/`. When complete, the chip is hidden.
- `[📅]` is the Calendar status badge. Click navigates to `/me/calendar-connections`. Tooltip explains the state in one line.
- `[👤]` is the avatar. Click opens the dropdown.

Avatar dropdown items for MVP:
- **My Profile** (link to `/me/profile`)
- **Sign Out** (small inline `<form action="/auth/session/delete" method="post">` with hidden `_csrf`)

Future (extensible, not in MVP):
- My Topics, My Availability, My Calendar Connections
- Account (Delete)
- Admin (when Admin)

### 3.2 Tablet (768–1023px)

```
+------------------------------------------------------+
| [SlotMerge]   [Search ▾]   [Admin ▾]   [📅]   [👤]  |
+------------------------------------------------------+
```

Same top bar; the `Home` and `Search` items are behind a hamburger drawer. The drawer is a server component that renders the same items filtered by role. Drawer toggle is a single client component (`HeaderMenuToggle`) that toggles `aria-expanded` on the drawer; no other client JavaScript is needed for the drawer chrome.

### 3.3 Mobile (< 768px)

```
+------------------------+
| [SlotMerge]   [📅] [☰] |
+------------------------+
```

Logo, Calendar status badge, hamburger. Hamburger opens a full-height drawer holding `Home`, `Search` (if Organizer/Admin), `Search history`, `Admin` (if Admin), avatar, and the dropdown items.

## 4. Setup checklist on `/`

`/` is rendered by `app/page.tsx`. The page calls `setupHomeWorkflow.load(context)` and renders the `SetupChecklistView` component. The checklist has four required items and one optional:

1. **Profile**: display name is set.
2. **Discoverability consent**: granted.
3. **Topics**: at least one active Topic or pending Topic Proposal.
4. **Availability**: at least one Availability Window or one-off override, plus profile timezone.
5. **Calendar Connection** (optional): at least one connected provider.

The view renders one card per item with a checkmark/dot, the item title, a one-sentence explanation, and a `Continue` button that goes to the corresponding `/me/*` page. The optional Calendar Connection card is collapsed by default and shows a one-liner "Connect (optional)" CTA. A pending Topic Proposal satisfies the Topics item but the card explicitly says "Pending — not yet eligible for matching."

The page also surfaces `searchEligibility.eligible` as a single statement under the title: "You will appear in Organizer Searches only after setup is complete." The wording comes from the prototype at `docs/prototypes/core-search-workflow.md:50-55`.

## 5. The role-aware (product) layout

```tsx
// app/(product)/layout.tsx
import { loadSessionFromCookies } from "@/lib/session-server";
import { setupHomeWorkflow } from "@/workflow/setup-home";
import { calendarConnectionWorkflow } from "@/workflow/calendar-connection";
import { TopBar } from "./_components/TopBar";
import { Footer } from "./_components/Footer";

export default async function ProductLayout({ children }: { children: React.ReactNode }) {
  const session = await loadSessionFromCookies();
  if (!session) {
    // (1) redirect happens inside requirePageContext; pages call it, not the layout.
    return <>{children}</>;
  }
  const [setup, calendar] = await Promise.all([
    setupHomeWorkflow.loadSummary({ userId: session.user.id }),
    calendarConnectionWorkflow.loadBadge({ userId: session.user.id }),
  ]);
  return (
    <>
      <TopBar role={session.user.role} setup={setup} calendar={calendar} user={session.user} csrfToken={session.csrfToken} />
      <main id="content">{children}</main>
    </>
  );
}
```

Two notes:

- The layout does not redirect unauthenticated requests on its own. Pages call `requirePageContext` and decide; the layout is honest about the fact that the auth gate is per-page. This keeps the gate testable in isolation and avoids the "auth check only in the layout" anti-pattern the Next.js authentication guide warns against (`https://nextjs.org/docs/app/guides/authentication`, accessed 2026-07-20).
- The layout's two parallel reads (`setupHomeWorkflow.loadSummary` and `calendarConnectionWorkflow.loadBadge`) are the only top-bar data sources. They return narrow summaries, not the full `SetupState` or full `CalendarConnectionPageState`. The summaries are small and stable; the shell reads them once per request.

## 6. The Calendar status badge

The badge is a small dot next to the avatar, with `aria-label` explaining the state in one line. States come from `calendarConnectionWorkflow.loadBadge({ userId })`:

| Badge | Color | State | Tooltip |
| --- | --- | --- | --- |
| (no badge) | hidden | no connections at all | — |
| Connected | `--success` | at least one connection, last sync < 6h | "Calendar connected" |
| Sync delayed | `--warning` | at least one connection, last sync 6–24h | "Calendar sync delayed" |
| Needs reconnect | `--danger` | at least one connection in `needs_reconnect` | "Calendar needs reconnect" |
| Unsupported | `--text-subtle` | only a Microsoft personal account (rejected) | "Microsoft personal accounts not supported" |

The badge is a server component. The state is computed once per request. The full status surface (per-connection list, contributing calendars, reconnect actions) is on `/me/calendar-connections` and that page is the deep link target.

## 7. Empty states (per page)

Each list page renders an inline empty state using the existing `.empty-state` primitive at `app/globals.css:243-257`. Every empty state has a one-sentence explanation and a single primary action that goes to the next logical setup step.

| Page | Empty title | Primary action |
| --- | --- | --- |
| `/me/topics` | "No active Topics yet" | "Browse the Topic catalogue" → stays on the page (selects Topics) |
| `/me/availability` | "No Availability Windows yet" | "Add your first weekly window" → opens the add form on the same page |
| `/me/calendar-connections` | "No Calendar Connections" | "Connect Google Calendar" or "Connect Microsoft Calendar" (the two providers) |
| `/searches/history` | "No Searches yet" | "Run your first Search" → links to `/searches` |
| `/admin/users` (after invite flow) | "No pending invites" | "Invite a User" → opens the invite form on the same page |
| `/admin/topics` (no proposals) | "No pending Topic Proposals" | — (text only; no action) |

The empty states are server components; the primary action is a normal `<a>` or `<form>` and the page re-renders after the action. No client JavaScript is needed for empty-state behavior.

## 8. Avatar dropdown

The dropdown is the existing top-bar pattern: a server component renders a `<details>` / `<summary>` shell, with the toggle controlled by a tiny client component (`HeaderMenuToggle`) that flips `aria-expanded`. The dropdown is a `<ul>` with two items for the MVP.

```tsx
// app/(product)/_components/AvatarDropdown.tsx
import { HeaderMenuToggle } from "./HeaderMenuToggle";
import { SignOutForm } from "./SignOutForm";

export function AvatarDropdown({ displayName, profileHref, csrfToken }: Props) {
  return (
    <details className="avatar-dropdown">
      <summary aria-label={`Account menu for ${displayName}`}>
        <span className="avatar-initials" aria-hidden="true">{initialsFor(displayName)}</span>
      </summary>
      <ul className="avatar-dropdown-menu" role="menu">
        <li role="none"><a role="menuitem" href={profileHref}>My Profile</a></li>
        <li role="none"><SignOutForm csrfToken={csrfToken} /></li>
      </ul>
    </details>
  );
}
```

```tsx
// app/(product)/_components/SignOutForm.tsx
export function SignOutForm({ csrfToken }: { csrfToken: string }) {
  return (
    <form action="/auth/session/delete" method="post" role="menuitem">
      <input type="hidden" name="_csrf" value={csrfToken} />
      <button type="submit" className="btn btn-link">Sign Out</button>
    </form>
  );
}
```

The dropdown is keyboard-navigable via the native `<details>` behavior: `Tab` opens, `Enter` activates, `Esc` closes. `HeaderMenuToggle` is the only client component introduced by this prototype; it owns no other behavior. The dropdown is the second and last client component in the shell (after the `SlotDetailsDrawer`); no further client islands are needed.

## 9. Responsive behavior

Breakpoints match the existing `app/globals.css:758-794` media queries (640, 900, 1200). The shell uses the same CSS custom properties.

- `>= 1200px` (desktop): full top bar with logo + primary items + setup chip + calendar badge + avatar. The Search Result page renders the full 7-day grid.
- `900–1199px` (small desktop / large tablet): full top bar; Search Result renders the 3-day grid.
- `768–899px` (tablet): top bar with logo + dropdown trigger + setup chip + calendar badge + avatar. Primary nav items collapse into a hamburger drawer.
- `640–767px` (large mobile): same as tablet; Search Result renders 1 day at a time with prev/next day navigation.
- `< 640px` (mobile): same as large mobile; the setup checklist becomes single-column.

The shell's CSS owns only the chrome (top bar, drawer, footer-less layout). The page-level responsive behavior (Search Result grid, Calendar list) is owned by the page component.

## 10. The role-aware nav items (final list)

| Item | Path | Visible to | Notes |
| --- | --- | --- | --- |
| Logo "SlotMerge" | `/` | Everyone | Always visible. |
| Home | `/` | All authenticated roles | Same URL as logo; the logo and Home item are the same link visually. |
| Search | `/searches` | Organizer, Admin | Direct link to the Search form. |
| Search history | `/searches/history` | Organizer, Admin | Sub-item under Search dropdown on desktop, top-nav item on tablet/mobile (or always inside the dropdown — see Section 3). |
| Admin | `/admin/users` | Admin | Default Admin landing page. |
| Admin → Users | `/admin/users` | Admin | |
| Admin → Topics | `/admin/topics` | Admin | Topic Proposals + active Topics on one page (per the canonical architecture). |
| Admin → Status | `/admin/status` | Admin | |
| Setup status chip | `/` | All authenticated, only when checklist incomplete | Links to `/` (the checklist). |
| Calendar status badge | `/me/calendar-connections` | All authenticated with at least one connection or one personal-account rejection | |
| Avatar dropdown | — | All authenticated | My Profile + Sign Out. |

## 11. The auth and public shell

`/sign-in` and `/sign-in/verify` render without the product shell. The `(public)` layout is intentionally minimal:

```tsx
// app/(public)/layout.tsx
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="content" className="public-page">
      {children}
    </main>
  );
}
```

- No top bar.
- No nav.
- No footer.
- The page itself centers the form on a single column.
- The magic-link landing page (`/sign-in/verify?token=…`) is the only "external" page; it shows a confirmation card with a single "Continue" button that submits the form to the verify handler. On success the user is redirected to `/` (the setup checklist). On failure the page shows a generic error and a "Request a new link" link to `/sign-in`.

This matches the prototype at `docs/prototypes/core-search-workflow.md:19-38`. The audit calls out that no request page exists today (`docs/research/mvp-web-screen-and-tracker-coverage.md:50-60`); this is the canonical fix.

## 12. Error and not-found boundaries

Per-segment boundaries are mandatory. They render the same brand chrome so the User is never dropped onto Next's default error page.

```tsx
// app/(product)/error.tsx
"use client";
export default function ProductError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main>
      <h1>Something went wrong</h1>
      <p>Try again. If the problem keeps happening, sign out and back in.</p>
      <button onClick={reset}>Retry</button>
    </main>
  );
}
```

- `app/(public)/error.tsx`, `app/(public)/not-found.tsx`: simple card, "Go to sign in" link.
- `app/(product)/error.tsx`, `app/(product)/not-found.tsx`: same as above with "Go to setup" link.
- `app/(product)/admin/error.tsx`, `app/(product)/admin/not-found.tsx`: same as above with "Go to admin" link.

`notFound()` is the role-failure signal in `requirePageContext`. Per the canonical architecture, role failure renders the per-segment `not-found.tsx` rather than a 403 page (`docs/research/canonical-next-page-api-architecture.md:6`). The page does not include the "Go to sign in" link in admin `not-found.tsx` for non-admins — that would leak the existence of the Admin surface — so it offers "Go to setup" instead.

## 13. Closure criteria for ticket #276

When ticket #276 closes, the prototype answers "yes" to every one of these:

- [ ] `app/(product)/layout.tsx` renders the role-aware top bar with the items in Section 10.
- [ ] `/` is the setup checklist Home, not a dashboard.
- [ ] The Setup status chip and Calendar status badge are sourced from `setupHomeWorkflow.loadSummary` and `calendarConnectionWorkflow.loadBadge` respectively.
- [ ] Auth screens (`/sign-in`, `/sign-in/sent`, `/sign-in/verify`) render without any product chrome.
- [ ] Avatar dropdown items are My Profile + Sign Out, extensible per Section 8.
- [ ] Empty states have primary actions per Section 7.
- [ ] The shell adds exactly two new client components: `HeaderMenuToggle` and the existing `SlotDetailsDrawer` (already in tree). No other client JavaScript is required by the shell.
- [ ] Responsive breakpoints are 640/768/900/1200, matching the existing `app/globals.css` queries.
- [ ] Per-segment `error.tsx` and `not-found.tsx` files exist under `(public)`, `(product)`, and `(product)/admin`.

## 14. Pointers for the next tickets

- **#275 (User journey):** uses the `(product)` shell. Renders `/me/*` and `/account/delete` pages. Calls into `profileWorkflow`, `discoverabilityWorkflow`, `topicWorkflow`, `availabilityWorkflow`, `accountWorkflow`. The shell's per-segment error boundary catches User-side failures.
- **#278 (Organizer Search journey):** uses the `(product)` shell. Renders `/searches` and `/searches/{id}` and `/searches/history`. The top bar's Search dropdown is the navigation entry. The role-aware nav hides Search for plain Users.
- **#281 (Admin journey):** uses the `(product)/admin` shell. Renders `/admin/*` pages. The Admin nav is the entry. Per-segment error boundary keeps Admin failures inside the Admin chrome.
- **#279 (completion gates):** every shell migration step must have a Playwright journey that signs in as a fixture User, opens the page, and asserts the top bar's role-filtered items are present. The shell is the seam that makes role-aware assertions testable in one place.
- **#277 (repair spec):** add the role-aware shell and responsive IA to `docs/mvp-spec.md` Section 5 and Section 12; explicitly note that `/` is the setup checklist Home and that Admin `not-found.tsx` does not leak Admin's existence.
