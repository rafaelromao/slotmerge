import { requirePageContext } from "../../../../src/lib/page-context";
import { getCalendarConnectionRepository } from "../../../../src/calendar/repository";
import {
  getCalendarProvider,
  listProviderCalendarsForProvider,
} from "../../../../src/calendar/providers";
import { decryptCalendarToken } from "../../../../src/calendar/token-encryption";
import { createProviderFetchImpl } from "../../../../src/lib/fetch-wrapper";
import { systemClock } from "../../../../src/system/clock";
import {
  createCalendarConnectionWorkflow,
  type CalendarConnectionPageState,
} from "../../../../src/workflow/calendar-connection";
import {
  CalendarConnectionsView,
  type CalendarConnectionsViewProps,
} from "../_components/CalendarConnectionsView";
import {
  disconnectConnectionAction,
  refreshConnectionAction,
  saveCalendarsAction,
} from "../_actions/calendar-connections";

type SearchParams = Promise<{
  oauth?: string | string[];
  requestId?: string | string[];
}>;

const VALID_OUTCOMES = new Set([
  "connected",
  "denied",
  "unsupported",
  "failed",
]);

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function isSafeRequestId(value: string | null): string | undefined {
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(value)) return undefined;
  return value;
}

function providerFetchImpl(): typeof fetch {
  const isLocalOrTest =
    process.env.APP_ENV === "local" || process.env.APP_ENV === "test";
  const overrideUrl = process.env.LOCAL_PROVIDER_OVERRIDE_URL;
  return isLocalOrTest && overrideUrl
    ? createProviderFetchImpl(fetch, overrideUrl)
    : fetch;
}

export default async function CalendarConnectionsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });

  const params = (await searchParams) ?? {};
  const outcomeValue = firstString(params.oauth);
  const requestId = firstString(params.requestId);
  const outcome: CalendarConnectionsViewProps["outcome"] =
    outcomeValue && VALID_OUTCOMES.has(outcomeValue)
      ? {
          kind: outcomeValue as
            "connected" | "denied" | "unsupported" | "failed",
          requestId: isSafeRequestId(requestId),
        }
      : { kind: "none" };

  const workflow = createCalendarConnectionWorkflow({
    repository: getCalendarConnectionRepository(),
    clock: systemClock(),
    listProviderCalendars: async (connection) => {
      const tokenEncryptionKey = process.env.CALENDAR_TOKEN_ENCRYPTION_KEY;
      if (!tokenEncryptionKey || !connection.accessTokenEncrypted) {
        throw new Error("Calendar provider token is unavailable");
      }
      const accessToken = decryptCalendarToken({
        ciphertext: connection.accessTokenEncrypted,
        key: tokenEncryptionKey,
      });
      return listProviderCalendarsForProvider(
        getCalendarProvider(connection.provider),
        accessToken,
        providerFetchImpl(),
      );
    },
  });

  let pageState: CalendarConnectionPageState | null = null;
  try {
    const result = await workflow.loadPage({ userId: context.user.id });
    if (result.ok) {
      pageState = result.value;
    }
  } catch {
    pageState = null;
  }

  return (
    <CalendarConnectionsView
      csrfToken={context.csrfToken}
      pageState={pageState}
      outcome={outcome}
      saveAction={saveCalendarsAction}
      refreshAction={refreshConnectionAction}
      disconnectAction={disconnectConnectionAction}
    />
  );
}
