"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { CsrfError } from "../../../../src/lib/csrf";
import { createPostgresDiscoverabilityConsentRepository } from "../../../../src/profile/discoverability-consent";
import { systemClock } from "../../../../src/system/clock";
import {
  createSetDiscoverabilityActionHandler,
  type SetDiscoverabilityActionResult,
} from "./set-discoverability-handler";

const handler = createSetDiscoverabilityActionHandler({
  repository: createPostgresDiscoverabilityConsentRepository(systemClock()),
  loadSession: async (request) => {
    const session = await getSessionFromRequest(request);
    return session;
  },
});

export async function setDiscoverabilityAction(
  formData: FormData,
): Promise<never> {
  const headersList = await headers();
  const built = new Request("http://localhost/me/discoverability", {
    method: "POST",
    headers: headersList,
  });

  const result: SetDiscoverabilityActionResult = await handler({
    formData,
    request: built,
  });

  switch (result.kind) {
    case "redirect":
      redirect(result.to);
      break;
    case "csrf-error":
      throw new CsrfError();
      break;
    case "form-error":
      redirect(`/me/discoverability?error=${encodeURIComponent(result.code)}`);
      break;
  }
}
