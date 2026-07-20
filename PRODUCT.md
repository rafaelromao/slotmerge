# Product

## Register

product

## Users

Three authenticated roles on one full-stack web app:

- **User**: maintains a profile, discoverability consent, topic associations, manual Availability, and Calendar Connections. Cannot run Searches.
- **Organizer**: a User who can run Searches and review persisted Search Results and Search history.
- **Admin**: an Organizer who can invite users, assign roles, suspend users, curate Topics, and monitor operational status.

Context: organizers are usually small-group conveners (team leads, community organizers, study-group hosts) coordinating among people who already opted into discoverability. The job to be done is the inverse of a normal calendar: instead of finding a free block in your own week, find a block where enough matching peers are free.

## Product Purpose

SlotMerge helps authenticated people find meeting times where enough people are available and share selected topics. The MVP stops at display-only persisted Search Results — there are no in-app invitations, no event creation, no RSVP, no booking reservation, and no notification inbox. The core artifact is an immutable Search Result snapshot: topics selected, a window, an hourly grid of Slots with per-Slot Match counts and stale-data markers.

Success looks like: an Organizer can confidently answer "when can these N people with these topics all meet this week" in one synchronous action, with the result preserved as a snapshot that survives later profile or calendar changes.

## Brand Personality

Quiet utility. Expert confidence. Deliberate, not decorative.

Three words: **deliberate, calm, expert**.

The product is opinionated about one job and ships the smallest surface that does it. Tone is plain, professional, and grounded. No exclamation marks in the UI, no celebration animation, no "Hey there!". Imperative voice for actions: "Run search", "Invite user", "Approve".

References (right lane):

- Linear: tight typography, calm neutral palette, restrained accent use, density without clutter.
- Raycast: terminal-adjacent discipline, predictable focus rings, keyboard-first thinking.
- Stripe Dashboard: dense data tables that still breathe, honest status colors, no decoration pretending to be information.

## Anti-references

What SlotMerge explicitly is not:

- **Not a calendar app.** No day-grid with event blocks, no Cal.com / Google Calendar / Calendly visual language. SlotMerge finds meeting slots; it does not own anyone's schedule.
- **Not a SaaS-cream product.** No light-cream backgrounds, no purple-blue gradient heroes, no identical card grids of icon + heading + text, no big-number hero metrics, no glassmorphism decoration.
- **Not an AI workflow tool.** No neon-on-black, no glow effects, no animated gradient text, no "powered by AI" framing.
- **Not a marketing site.** No hero section, no testimonial carousel, no "Get started free" CTA. Every page is a working surface.

## Design Principles

1. **Show the slot, not the story.** The Match count per cell, the drawer's Match list, the calendar Connection freshness flag — these are the product. Everything else is chrome.
2. **Density without clutter.** Multiple data points per row when they belong together (display name + matched topics + availability indicator + freshness). Use tables where data is tabular, drawers where a single Slot needs deep inspection.
3. **Honest staleness.** When imported data is stale, surface it inline with a visible marker. Never silently drop a User from results because their sync failed — the spec calls this out explicitly, and the UI must honor it.
4. **Snapshots, not streams.** Search Results are immutable. No live updates, no websocket, no "refreshing..." spinner on saved results. The UI should make the snapshot character obvious: a timestamp and the search parameters are part of the artifact.
5. **Organizer-first workflow, User-respectful defaults.** Organizers drive Searches; Users provide Availability and Topics. The UI never makes a User feel surveilled, and never exposes email, event titles, attendees, locations, or descriptions.

## Accessibility & Inclusion

- **WCAG 2.1 AA** as the MVP target.
- Minimum 4.5:1 contrast for body text, 3:1 for large text and non-text UI.
- Full keyboard navigability across all interactive surfaces (drawer, calendar grid, form fields).
- Visible, consistent focus rings on every interactive element.
- Honors `prefers-reduced-motion` for any transition or animation.
- Screen-reader labels on icon-only controls and on the calendar grid (per-cell count announced meaningfully).
- No information conveyed by color alone: stale-data markers and connection freshness combine color with an icon or label.
- Form fields with explicit labels, error messages tied to fields via `aria-describedby`, and never relying on placeholder text as a label.
