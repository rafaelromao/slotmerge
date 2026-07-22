import { getDiscoverabilityConsent } from "../../../../src/profile/discoverability-consent";
import { requirePageContext } from "../../../../src/lib/page-context";
import {
  DiscoverabilityView,
  toConsentView,
} from "../_components/DiscoverabilityView";
import { setDiscoverabilityAction } from "../_actions/set-discoverability";

type SearchParams = Promise<{
  error?: string | string[];
}>;

type ErrorCode =
  | "consent_required"
  | "consent_already_granted"
  | "consent_already_revoked"
  | "invalid_submission";

const VALID_ERROR_CODES = new Set<ErrorCode>([
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

function parseErrorCode(value: string | null): ErrorCode | undefined {
  if (value && VALID_ERROR_CODES.has(value as ErrorCode)) {
    return value as ErrorCode;
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
