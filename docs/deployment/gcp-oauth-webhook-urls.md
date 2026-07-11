# GCP OAuth and Webhook URL Configuration

This document records the staging and production HTTPS URLs for Google and Microsoft OAuth callbacks and provider webhook/change-notification endpoints. It follows the Cloud Run service foundation documented in `gcp-foundation.md`.

OAuth callback URLs must be registered with the respective provider when creating OAuth applications. Webhook URLs must be registered in the provider developer console to receive change notifications.

## Cloud Run Service URLs

Before custom domains are attached, Cloud Run services use managed HTTPS URLs. The exact URL for each deployed service is assigned by Cloud Run at deploy time and follows this pattern:

```
https://[service-name].[region].a.run.app
```

For the MVP, use the following Cloud Run web service URLs as `APP_BASE_URL` for OAuth and webhook registration:

| Environment | Web service name | Cloud Run managed URL (before custom domain) |
| --- | --- | --- |
| `staging` | `slotmerge-staging-web` | `https://slotmerge-staging-web.[region].a.run.app` |
| `production` | `slotmerge-production-web` | `https://slotmerge-production-web.[region].a.run.app` |

The `region` is `us-central1` for MVP. After custom domain mapping, replace the Cloud Run managed URL with the custom domain (e.g., `https://staging.slotmerge.app`).

The `worker` service (`slotmerge-staging-worker`, `slotmerge-production-worker`) is not publicly exposed. It is reachable only through Cloud Run invocations from the `web` service or from the GitHub Actions deploy pipeline.

## Google OAuth Callback URLs

Register these URLs as authorized redirect URIs in the Google Cloud project OAuth 2.0 client credentials:

| Environment | Authorized redirect URI |
| --- | --- |
| `staging` | `https://slotmerge-staging-web.[region].a.run.app/me/calendar-connections/callback` |
| `production` | `https://slotmerge-production-web.[region].a.run.app/me/calendar-connections/callback` |

The callback path is the unified `POST /me/calendar-connections/callback` route (per MVP spec §7.4). The provider type (Google vs Microsoft) is determined from the stored Calendar Connection record during callback handling, not from the URL path. The OAuth state parameter encodes the Calendar Connection ID and any CSRF tokens.

When creating the Google OAuth client in the Google Cloud Console:

- Application type: Web application
- Name: SlotMerge (staging) or SlotMerge (production)
- Authorized redirect URI: use the URL from the table above for the target environment

## Microsoft OAuth Callback URLs

Register these URLs as authorized redirect URIs in the Microsoft Azure Active Directory application registration:

| Environment | Authorized redirect URI |
| --- | --- |
| `staging` | `https://slotmerge-staging-web.[region].a.run.app/me/calendar-connections/callback` |
| `production` | `https://slotmerge-production-web.[region].a.run.app/me/calendar-connections/callback` |

The same callback path is used as for Google. The Azure AD application represents the Calendar Connection scope (Calendars.ReadBasic delegated permission).

When creating the Microsoft Azure AD application:

- Platform: Web
- Redirect URI: use the URL from the table above for the target environment
- Supported account types: work or school directory only (Microsoft personal accounts are out of scope per MVP spec)

## Provider Webhook URLs

Register these URLs in the respective provider developer console to receive calendar change notifications:

| Environment | Provider | Webhook URL |
| --- | --- | --- |
| `staging` | Google | `https://slotmerge-staging-web.[region].a.run.app/webhooks/google/calendar` |
| `production` | Google | `https://slotmerge-production-web.[region].a.run.app/webhooks/google/calendar` |
| `staging` | Microsoft | `https://slotmerge-staging-web.[region].a.run.app/webhooks/microsoft/calendar` |
| `production` | Microsoft | `https://slotmerge-production-web.[region].a.run.app/webhooks/microsoft/calendar` |

Webhook requests target the public Cloud Run `web` service only. The `worker` service does not receive direct inbound requests from providers.

## Webhook Verification

Webhook verification secrets are stored in Secret Manager per provider and per environment:

| Environment | Google webhook secret name | Microsoft webhook secret name |
| --- | --- | --- |
| `staging` | `slotmerge-staging-google-webhook-secret` | `slotmerge-staging-microsoft-webhook-secret` |
| `production` | `slotmerge-production-google-webhook-secret` | `slotmerge-production-microsoft-webhook-secret` |

These are injected into the Cloud Run `web` service as `GOOGLE_WEBHOOK_SECRET` and `MICROSOFT_WEBHOOK_SECRET` environment variables at runtime. The application uses these secrets to verify that incoming webhook requests originate from the legitimate provider.

Local development does not require these secrets; the local workflow uses polling and manual refresh instead of live webhook delivery.

## Local Development

Local development does not require public HTTPS webhook endpoints. The local-first requirement (issue #131) means the full stack runs locally with:

- `APP_BASE_URL=http://localhost:3000`
- Local or disposable PostgreSQL
- No Secret Manager dependency
- Provider webhooks replaced by polling, manual refresh, or provider-bound test mocks

This is documented in `gcp-foundation.md` and is not changed by this ticket.
