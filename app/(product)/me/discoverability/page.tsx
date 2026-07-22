import { getDiscoverabilityConsent } from "../../../../src/profile/discoverability-consent";
import { requirePageContext } from "../../../../src/lib/page-context";
import {
  DiscoverabilityView,
  toConsentView,
} from "../_components/DiscoverabilityView";
import { setDiscoverabilityAction } from "../_actions/set-discoverability";
import type { SetDiscoverabilityFormErrorCode } from "../_actions/set-discoverability-handler";

type SearchParams = Promise<{
  error?: string | string[];
}>;

const VALID_ERROR_CODES = new Set<SetDiscoverabilityFormErrorCode>([
  "consent_required",
  "consent_already_granted",
  "consent_already_revoked",
  "invalid_submission",
]);

function firstString(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function parseErrorCode(
  value: string | null,
): SetDiscoverabilityFormErrorCode | undefined {
  if (
    value &&
    VALID_ERROR_CODES.has(value as SetDiscoverabilityFormErrorCode)
  ) {
    return value as SetDiscoverabilityFormErrorCode;
  }
  return undefined;
}

export default async function DiscoverabilityPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });
  const params = (await searchParams) ?? {};
  const errorCode = parseErrorCode(firstString(params.error));

  const consent = await getDiscoverabilityConsent(context.user.id);
  const view = toConsentView(consent);

  return (
    <DiscoverabilityView
      view={view}
      csrfToken={context.csrfToken}
      errorCode={errorCode}
      setDiscoverabilityAction={setDiscoverabilityAction}
    />
  );
}
