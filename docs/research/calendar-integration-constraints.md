# Calendar Integration Constraints

Research asset for [Research calendar integration constraints](https://github.com/rafaelromao/slotmerge/issues/8).

## Summary

Google Calendar and Microsoft 365 calendars both support MVP-grade availability import without storing event details, but they differ in provider coverage and operational constraints.

Recommended MVP direction: support manual Availability plus Google Calendar and Microsoft work/school calendar connections. Treat Microsoft personal accounts as out of scope for the first integration because Microsoft Graph `getSchedule` does not support delegated personal Microsoft accounts.

Use free/busy-style reads only. Do not request broad event read/write scopes unless later booking decisions require calendar event creation.

## Google Calendar

Primary docs:

- [Freebusy: query](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query)
- [Choose Google Calendar API scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Configure OAuth consent](https://developers.google.com/workspace/guides/configure-oauth-consent)
- [Push notifications](https://developers.google.com/workspace/calendar/api/guides/push)
- [Usage limits](https://developers.google.com/workspace/calendar/api/guides/quota)

Constraints:

- Free/busy is available through `POST https://www.googleapis.com/calendar/v3/freeBusy`.
- Narrow scopes exist for availability-only access: `https://www.googleapis.com/auth/calendar.freebusy` and `https://www.googleapis.com/auth/calendar.events.freebusy`.
- Free/busy request windows require `timeMin` and `timeMax` in RFC3339 format and optional `timeZone`; default response timezone is UTC.
- One free/busy request can include at most 50 calendars via `calendarExpansionMax`.
- Group expansion has a maximum of 100 members via `groupExpansionMax`.
- Responses return busy intervals, not event metadata, which matches the privacy decision to store free/busy only.
- OAuth consent screen setup is required for OAuth apps.
- Google recommends selecting the narrowest scopes; sensitive or restricted scopes can trigger verification and additional review.
- Push notifications require a public HTTPS webhook URL with a valid certificate; self-signed or invalid certificates are not accepted.
- Calendar push notifications can watch event resources, but notification messages do not include changed event details; the app must make follow-up API calls.
- Push notification channels can expire and must be replaced; there is no automatic renewal.
- Notifications are not 100% reliable, so the app must handle dropped notifications with periodic reconciliation.
- Google Calendar API quotas are enforced per project and per user per project.
- Current documented Calendar API limits are 10,000 requests per minute per project and 600 requests per minute per user per project, plus a 1,000,000 requests per day per project threshold before planned billing applies.
- Google recommends exponential backoff, randomized sync timing, and push notifications instead of frequent polling.

MVP implications:

- Google Calendar is viable for MVP availability import.
- Prefer `calendar.freebusy` unless a later booking decision requires event creation.
- A local development environment needs either a tunnel/public HTTPS URL for webhook testing or a polling-only dev mode.
- The product should show a clear consent screen explaining free/busy access only.
- The sync design must include webhook renewal and fallback reconciliation.

## Microsoft Graph Calendar

Primary docs:

- [calendar: getSchedule](https://learn.microsoft.com/en-us/graph/api/calendar-getschedule?view=graph-rest-1.0)
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [Outlook change notifications](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview)
- [Change notifications overview](https://learn.microsoft.com/en-us/graph/change-notifications-overview)
- [Microsoft Graph throttling guidance](https://learn.microsoft.com/en-us/graph/throttling)
- [Microsoft identity platform OAuth authorization code flow](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)

Constraints:

- Free/busy is available through `POST /me/calendar/getSchedule` and `POST /users/{id|userPrincipalName}/calendar/getSchedule`.
- `getSchedule` returns free/busy availability for users, distribution lists, or resources over a specified period.
- Least privileged permission for work/school delegated access is `Calendars.ReadBasic`.
- `getSchedule` delegated personal Microsoft accounts are not supported.
- Application permission is also available with `Calendars.ReadBasic`, but app-only access can require tenant/admin consent and is broader than user-connected OAuth.
- `availabilityViewInterval` defaults to 30 minutes, has a minimum of 5 minutes, and a maximum of 1440 minutes.
- The response can include `availabilityView`, `scheduleItems`, and `workingHours`; the app must avoid storing event subject/location data if returned.
- A user calendar with a slot containing more than 1000 entries can return a `5006` response.
- Change notifications are available for Outlook event resources.
- Outlook event subscriptions have a maximum of 1,000 active subscriptions per mailbox across all applications.
- Outlook event subscriptions without resource data last up to 10,080 minutes, under seven days; rich subscriptions last up to 1440 minutes, under one day.
- Subscriptions must be renewed before expiration.
- Delegated subscriptions can subscribe only to the signed-in user's mailbox; subscribing to other users or shared/delegated folders requires application permissions.
- Microsoft Graph throttles clients with HTTP 429 and a `Retry-After` header; clients should respect that delay and otherwise use exponential backoff.
- Microsoft recommends change notifications and change tracking over polling where available.
- OAuth authorization code flow with PKCE is supported for web/SPAs; server-side web apps can securely store client secrets.
- Refresh token behavior depends on app type. SPA redirect refresh tokens are limited to 24 hours, so a server-side web integration is simpler for durable calendar sync.

MVP implications:

- Microsoft work/school calendars are viable for MVP availability import.
- Microsoft personal calendars should be out of scope for the first Microsoft integration unless a separate API path is chosen later.
- Prefer delegated `Calendars.ReadBasic` per connected user for MVP.
- Do not request rich notifications or event metadata for MVP free/busy sync.
- Sync design must handle subscription renewal, throttling, and `5006` edge failures.

## Cross-provider design constraints

- Calendar OAuth should remain separate from SlotMerge login, matching the earlier user/profile decision.
- Store provider connection state, refresh credentials, selected calendars, sync status, last successful sync, and last sync error.
- Store normalized busy intervals or derived Availability, not event titles, attendees, descriptions, or locations.
- Manual Availability must remain available because provider access can fail, users may lack supported providers, and Microsoft personal accounts are not covered by the recommended Microsoft path.
- Time handling must normalize provider timestamps and preserve enough timezone context for user-facing display.
- The MVP should expose integration status to users: connected, disconnected, needs reconnect, sync delayed, and unsupported provider/account type.
- Webhook-driven sync requires public HTTPS infrastructure in production.
- Local development should support manual refresh or polling because provider webhooks need reachable HTTPS callback URLs.
- Calendar provider failures should degrade to stale/import-disabled Availability plus manual Availability, not break Search globally.

## Decisions this research supports

- Recommended MVP provider scope: manual Availability, Google Calendar, and Microsoft work/school calendars.
- Recommended availability scope: free/busy import only.
- Recommended OAuth model: per-user delegated OAuth connection, separate from login.
- Recommended sync model: webhook/change-notification capable in production, with periodic reconciliation and manual/polling local-dev fallback.

## Open questions for later tickets

- Should the MVP support event creation after booking, which would require broader write scopes?
- How stale can imported Availability be before a user is excluded from Search results?
- Which calendar statuses count as unavailable: busy, tentative, out-of-office, working elsewhere, declined events, and all-day events?
- Should users choose which calendars contribute to Availability, or should the MVP use a default primary calendar only?
