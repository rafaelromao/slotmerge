# Self-delete screenshots

The Playwright journey at
`tests/e2e-browser/journeys/user/self-delete.spec.ts` captures these full-page
states through the `capture` project:

- `loaded.png` — authenticated server-rendered confirmation at desktop width
- `invalid.png` — exact-match failure with announced inline feedback at mobile width
- `confirmed.png` — exact `DELETE` confirmation with the destructive action enabled
- `deleted.png` — signed-out landing with the retained-audit explanation

The journey also checks tablet and mobile overflow, keyboard focus, the single
heading, labelled input, non-color error copy, and reduced-motion-compatible
shared styles. Capture runs retain WebM video and traces under
`playwright/.artifacts/`; default runs retain video and traces only on failure.
