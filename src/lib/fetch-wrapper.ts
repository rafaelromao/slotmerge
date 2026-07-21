export type ProviderFetchImpl = typeof fetch;

const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
const GOOGLE_FREEBUSY_ENDPOINT =
  "https://calendar.googleapis.com/calendar/v3/freeBusy";
const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/token";
const MICROSOFT_LOGOUT_ENDPOINT =
  "https://login.microsoftonline.com/organizations/oauth2/v2.0/v2.0/revoke";

interface ProviderRewriteRule {
  original: string;
  replacement: string;
}

const GOOGLE_REWRITE_RULES: ProviderRewriteRule[] = [
  { original: GOOGLE_TOKEN_ENDPOINT, replacement: "/google/token" },
  { original: GOOGLE_REVOKE_ENDPOINT, replacement: "/google/revoke" },
  {
    original: GOOGLE_FREEBUSY_ENDPOINT,
    replacement: "/google/freebusy",
  },
];

const MICROSOFT_GRAPH_CALENDARS_ENDPOINT =
  "https://graph.microsoft.com/v1.0/me/calendars";
const MICROSOFT_GRAPH_GETSCHEDULE_ENDPOINT =
  "https://graph.microsoft.com/v1.0/me/calendar/getSchedule";

const MICROSOFT_REWRITE_RULES: ProviderRewriteRule[] = [
  {
    original: MICROSOFT_TOKEN_ENDPOINT,
    replacement: "/microsoft/token",
  },
  {
    original: MICROSOFT_LOGOUT_ENDPOINT,
    replacement: "/microsoft/revoke",
  },
];

const MICROSOFT_GRAPH_REWRITE_RULES: ProviderRewriteRule[] = [
  {
    original: MICROSOFT_GRAPH_CALENDARS_ENDPOINT,
    replacement: "/microsoft/calendars",
  },
  {
    original: MICROSOFT_GRAPH_GETSCHEDULE_ENDPOINT,
    replacement: "/microsoft/getSchedule",
  },
];

function rewriteUrl(url: string, rules: ProviderRewriteRule[]): string {
  for (const rule of rules) {
    if (url.startsWith(rule.original)) {
      return rule.replacement + url.slice(rule.original.length);
    }
  }
  return url;
}

export function createProviderFetchImpl(
  baseFetch: typeof fetch,
  overrideUrl: string,
): ProviderFetchImpl {
  return async function providerFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const originalUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    const isGoogleUrl = GOOGLE_REWRITE_RULES.some((r) =>
      originalUrl.startsWith(r.original),
    );
    const isMicrosoftUrl =
      MICROSOFT_REWRITE_RULES.some((r) =>
        originalUrl.startsWith(r.original),
      ) ||
      MICROSOFT_GRAPH_REWRITE_RULES.some((r) =>
        originalUrl.startsWith(r.original),
      );

    if (isGoogleUrl) {
      const rewrittenPath = rewriteUrl(originalUrl, GOOGLE_REWRITE_RULES);
      const rewrittenUrl = new URL(rewrittenPath, overrideUrl).toString();
      return baseFetch(rewrittenUrl, init);
    }

    if (isMicrosoftUrl) {
      const rules = MICROSOFT_REWRITE_RULES.some((r) =>
        originalUrl.startsWith(r.original),
      )
        ? MICROSOFT_REWRITE_RULES
        : MICROSOFT_GRAPH_REWRITE_RULES;
      const rewrittenPath = rewriteUrl(originalUrl, rules);
      const rewrittenUrl = new URL(rewrittenPath, overrideUrl).toString();
      return baseFetch(rewrittenUrl, init);
    }

    return baseFetch(input, init);
  };
}
