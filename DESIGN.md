---
name: SlotMerge
description: Quiet-utility product UI for finding meeting slots across opted-in peers.
colors:
  surface-base-light: oklch(99% 0.005 250)
  surface-base-dark: oklch(16% 0.01 250)
  surface-raised-light: oklch(100% 0 0)
  surface-raised-dark: oklch(20% 0.01 250)
  surface-sunken-light: oklch(96.5% 0.005 250)
  surface-sunken-dark: oklch(13% 0.01 250)
  surface-overlay-light: oklch(100% 0 0)
  surface-overlay-dark: oklch(20% 0.01 250)
  text-primary-light: oklch(20% 0.01 250)
  text-primary-dark: oklch(96% 0.005 250)
  text-muted-light: oklch(50% 0.01 250)
  text-muted-dark: oklch(65% 0.005 250)
  accent-light: oklch(45% 0.18 260)
  accent-dark: oklch(70% 0.16 260)
  accent-text-light: oklch(99% 0 0)
  accent-text-dark: oklch(15% 0.01 250)
  success-light: oklch(45% 0.14 155)
  warning-light: oklch(70% 0.16 75)
  danger-light: oklch(50% 0.2 25)
  border-subtle-light: oklch(92% 0.005 250)
  border-strong-light: oklch(82% 0.005 250)
typography:
  display:
    fontFamily: var(--font-sans)
    fontSize: var(--text-2xl)
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-.025em"
  headline:
    fontFamily: var(--font-sans)
    fontSize: var(--text-xl)
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-.015em"
  title:
    fontFamily: var(--font-sans)
    fontSize: var(--text-lg)
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-.01em"
  body:
    fontFamily: var(--font-sans)
    fontSize: var(--text-base)
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: var(--font-sans)
    fontSize: var(--text-sm)
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: var(--font-mono)
    fontSize: var(--text-sm)
    fontWeight: 400
rounded:
  sm: "0.25rem"
  md: "0.375rem"
  lg: "0.5rem"
  xl: "0.75rem"
  pill: "9999px"
spacing:
  0: "0"
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.5rem"
  6: "2rem"
  7: "3rem"
  8: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.accent-light}"
    textColor: "{colors.accent-text-light}"
    rounded: "{rounded.md}"
    padding: "0 var(--space-3)"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-dark}"
  button-secondary:
    backgroundColor: "{colors.surface-raised-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.md}"
    borderColor: "{colors.border-strong-light}"
    padding: "0 var(--space-3)"
    height: "36px"
  button-danger:
    backgroundColor: "{colors.danger-light}"
    textColor: "{colors.accent-text-light}"
    rounded: "{rounded.md}"
    height: "36px"
  card-raised:
    backgroundColor: "{colors.surface-raised-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.lg}"
    padding: "var(--space-5)"
  card-sunken:
    backgroundColor: "{colors.surface-sunken-light}"
    textColor: "{colors.text-primary-light}"
    rounded: "{rounded.md}"
    padding: "var(--space-4)"
  status-pill-ok:
    backgroundColor: "var(--success-soft)"
    textColor: "var(--success)"
    rounded: "{rounded.pill}"
  status-pill-warn:
    backgroundColor: "var(--warning-soft)"
    textColor: "var(--warning)"
    rounded: "{rounded.pill}"
  status-pill-danger:
    backgroundColor: "var(--danger-soft)"
    textColor: "var(--danger)"
    rounded: "{rounded.pill}"
---

# Design System: SlotMerge

## 1. Overview

**Creative North Star: "The Quiet Confidence System."**

SlotMerge is a product UI, not a marketing surface. The design language is restrained, technical, and deliberately plain: type does most of the work, color appears only where it carries information, and every component exists to disappear into the task. The interface must read as a working tool the user trusts, not a brand showcase. Density without clutter, honest state, no celebration.

This system explicitly rejects SaaS-cream hero treatments, identical icon-card grids, gradient text, glassmorphism decoration, neon-on-black "AI workflow" aesthetics, and any pattern that has the user pausing to wonder whether something is decorative. Buttons, lists, fields, and tables should feel familiar from Linear, Raycast, and Stripe Dashboard: compact, dense, opinionated.

**Key Characteristics:**
- Single accent color used only for primary actions and state.
- Two-tone neutral palette tinted with a faint cool hue, never pure `#000`/`#fff`.
- Sans-only typography with a working-scale ratio and one monospace family for IDs and time codes.
- Elevation carried by full borders and subtle shadows; never by colored side stripes.
- Light and dark themes are first-class; both share the same semantic tokens.

## 2. Colors

The palette is restrained: a tinted neutral system in cool grayscale with a single saturated accent. State colors (success, warning, danger) are reserved for status only and never used decoratively.

### Primary
- **Slate Blue** (`oklch(45% 0.18 260)` light / `oklch(70% 0.16 260)` dark): The accent. Used only on primary buttons, current selection, focus rings, and the match-count highlight in the search grid. Never used as a background fill for non-interactive surfaces.

### Secondary
- None. SlotMerge uses one accent.

### Neutral
- **Surface Base** (`oklch(99% 0.005 250)` / `oklch(16% 0.01 250)`): The page background.
- **Surface Raised** (`oklch(100% 0 0)` / `oklch(20% 0.01 250)`): Cards, panels, the Slot Details drawer.
- **Surface Sunken** (`oklch(96.5% 0.005 250)` / `oklch(13% 0.01 250)`): Inset fields, muted summary strips, banner backdrops.
- **Surface Overlay** (`oklch(100% 0 0)` / `oklch(20% 0.01 250)`): Drawer body above the scrim.
- **Border Subtle** (`oklch(92% 0.005 250)` / `oklch(28% 0.005 250)`): Default row and card outlines.
- **Border Strong** (`oklch(82% 0.005 250)` / `oklch(38% 0.005 250)`): Form-control borders, emphasized dividers.
- **Border Focus** (`oklch(55% 0.18 260)` / `oklch(75% 0.15 260)`): Keyboard focus rings.
- **Text Primary** (`oklch(20% 0.01 250)` / `oklch(96% 0.005 250)`): Body and headings.
- **Text Secondary** (`oklch(35% 0.01 250)` / `oklch(82% 0.005 250)`): Helper, captions.
- **Text Muted** (`oklch(50% 0.01 250)` / `oklch(65% 0.005 250)`): Labels, metadata.

### State
- **Success** (`oklch(45% 0.14 155)` / soft variants): Saved banners, fresh snapshot pill, available calendars.
- **Warning** (`oklch(70% 0.16 75)` / soft variants): Stale calendar data, pending topic proposals, in-progress operations.
- **Danger** (`oklch(50% 0.2 25)` / soft variants): Suspended users, retire-topic confirm, rate-limit errors.

## 3. Typography

One sans family carries everything from headings to data cells; one mono family is used for identifiers and timestamps. The scale is compact and product-oriented: a 1.125–1.2 ratio between steps, with body copy at `0.875rem`. Density, not decoration.

| Role | Size | Weight | Use |
| --- | --- | --- | --- |
| Display | `1.5rem` | 600 | Page headings (h1) |
| Headline | `1.25rem` | 600 | Section headings, drawer title |
| Title | `1.125rem` | 600 | Card titles, settings groups |
| Body | `0.875rem` | 400 | Default text, table cells |
| Label | `0.8125rem` | 500 | Form labels, helper text |
| Eyebrow | `0.75rem` | 600 uppercase | Section kicker (`Organizer workspace`) |

Mono (`JetBrains Mono`, `--font-mono`) is reserved for IDs, time codes (e.g. `01:00`), and shell/trace copy.

Body text caps at 65–75ch where prose appears; tables and dense UI may run wider.

## 4. Elevation

Elevation is structural and subtle, not decorative. Two shadow tokens are in active use, both low-saturation black on light surfaces, deeper on dark.

- `--shadow-sm` (`0 1px 2px oklch(0% 0 0 / 0.06)`): Static cards, page headers.
- `--shadow-md` (`0 4px 12px oklch(0% 0 0 / 0.08)`): Interactive cards on hover, dropdowns.
- `--shadow-overlay` (`-4px 0 24px oklch(0% 0 0 / 0.12)`): Slot Details drawer.

Cards never use colored side-stripe borders; status distinction comes from full borders, background tints, leading icons/numbers, or pills.

## 5. Components

### Buttons
- `button-primary`: `--accent` fill, accent text. Sole action in a context.
- `button-secondary`: Surface raised, strong border. Default secondary.
- `button-ghost`: Transparent, secondary text. Tertiary actions only.
- `button-danger`: `--danger` fill, inverse text. Suspend, retire, delete.
- All buttons share `36px` minimum height and `36px` target padding; 44px tap target on touch.

### Cards
- `card-raised`: Default working surface; used for setup cards, topic catalogue tiles, search history rows.
- `card-sunken`: Inset summary strips and inner banners.
- No nested cards. `rounded-lg` is the largest radius used on cards.

### Form fields
- Label always above input; errors via `aria-describedby`; invalid state uses `--danger` border plus inline message.
- Inputs share `42px` height and the same focus ring as the rest of the interface.

### Status pills
- `status-pill-ok`, `status-pill-warn`, `status-pill-danger`: rounded pill chips used inline next to subjects (search freshness, invite state, connection state).
- Color is never the only carrier of state: every pill pairs with a text label.

### Slot Details drawer
- Right-aligned, full-height drawer; 440px desktop, full-width below 640px.
- 44px close control.
- `role="dialog"` + `aria-modal="true"` + labelledby + focus trap; Escape closes.

### Search Result grid
- Hourly rows × seven day columns; match counts highlighted in the accent; stale cells marked with ⚠ glyph plus the stale note line above the grid.

### Theme toggle
- Visible in the top bar; switches `data-theme` between light and dark; persisted in `localStorage`.

## 6. Do's and Don'ts

**Do**
- Use the accent only on primary buttons, current selection, focus rings, and the search match-count highlight.
- Keep cards flat: full borders, subtle shadow, no colored stripes.
- Pair every state color with a label or icon. Never rely on color alone.
- Use `prefers-reduced-motion` to suppress transitions and skeleton shimmer.
- Render the SSR content as the first paint; no client-side data fetching.

**Don't**
- Use `border-left`/`border-right` greater than 1px as a colored accent on cards or alerts.
- Use gradient text, glassmorphism, or hero metric blocks.
- Use display fonts in UI labels, buttons, or data cells.
- Reinvent standard affordances for flavor: keep buttons, form controls, and dialogs predictable.
- Use full-saturation accent on inactive states.
- Add decorative motion that doesn't convey state.