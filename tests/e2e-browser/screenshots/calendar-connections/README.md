# Calendar Connections screenshots

Per-state full-page PNG baselines are captured at the path above by the
Playwright `capture` project with `CAPTURE=true`. The journey spec at
`tests/e2e-browser/journeys/user/calendar-connection.spec.ts` records the
following states:

- `loaded`
- `connected`
- `after-save`
- `after-refresh`
- `after-disconnect`
- `needs-reconnect`
- `reconnected-expired`
- `unsupported`
- `denied`
- `empty`
