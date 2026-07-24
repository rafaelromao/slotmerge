import { requirePageContext } from "../../../../src/lib/page-context";
import {
  DeleteAccountView,
  type DeleteAccountPageError,
} from "../_components/DeleteAccountView";

type SearchParams = Promise<{ error?: string | string[] }>;

const errors = new Set<DeleteAccountPageError>([
  "confirm_required",
  "confirm_mismatch",
  "csrf",
]);

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams?: SearchParams;
} = {}) {
  const context = await requirePageContext({
    roles: ["user", "organizer", "admin"],
  });
  const params = (await searchParams) ?? {};
  const rawError = Array.isArray(params.error) ? params.error[0] : params.error;
  const error =
    rawError && errors.has(rawError as DeleteAccountPageError)
      ? (rawError as DeleteAccountPageError)
      : undefined;

  return <DeleteAccountView csrfToken={context.csrfToken} error={error} />;
}
