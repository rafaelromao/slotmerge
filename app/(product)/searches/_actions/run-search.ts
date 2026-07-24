"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { CsrfError } from "../../../../src/lib/csrf";
import { listActiveTopics } from "../../../../src/topics/repository";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { getDiscoverableUserRepository } from "../../../../src/search/discoverable-user-repository";
import { getProfileByUserId } from "../../../../src/profile/repository";
import { systemClock } from "../../../../src/system/clock";
import {
  SEARCH_FORM_ID,
  sealSearchFeedbackToken,
} from "../../../../src/workflow/search-feedback";
import { createSearchWorkflow } from "../../../../src/workflow/search";
import {
  buildSearchActionHandler,
  type SearchActionResult,
} from "./run-search-handler";

function buildWorkflow() {
  return createSearchWorkflow({
    clock: systemClock(),
    profileRepository: {
      findByUserId: getProfileByUserId,
    },
    activeTopicsRepository: {
      async listActive() {
        const entries = await listActiveTopics();
        return entries.map((entry) => ({
          id: entry.id,
          name: entry.name,
          status: "active" as const,
        }));
      },
    },
    discoverableUserRepository: getDiscoverableUserRepository(),
    searchResultRepository: getSearchResultRepository(),
  });
}

async function buildRequest(url: string): Promise<Request> {
  const headerList = await headers();
  const headersObject: Record<string, string> = {};
  headerList.forEach((value, key) => {
    headersObject[key] = value;
  });
  return new Request(url, {
    method: "POST",
    headers: headersObject,
  });
}

async function handleResult(
  result: SearchActionResult,
  context: { csrfToken: string; path: string },
): Promise<never> {
  if (result.kind === "redirect") {
    redirect(result.to);
    throw new Error("redirect() should not return");
  }
  if (result.kind === "csrf-error") {
    throw new CsrfError();
  }
  const sealed = await sealSearchFeedbackToken({
    fieldErrors: result.fieldErrors,
    values: result.values,
    formId: SEARCH_FORM_ID,
    path: context.path,
    csrfTokenHash: createHash("sha256").update(context.csrfToken).digest("hex"),
    issuedAt: Date.now(),
  });
  redirect(`/searches?feedback=${encodeURIComponent(sealed)}`);
  throw new Error("redirect() should not return");
}

export async function runSearchAction(formData: FormData): Promise<void> {
  const workflow = buildWorkflow();
  const handler = buildSearchActionHandler({
    workflow,
    loadSession: async (request) => getSessionFromRequest(request),
  });

  const headerList = await headers();
  const csrfToken = headerList.get("x-csrf-token") ?? "";
  const path = headerList.get("x-pathname") ?? "/searches";
  const request = await buildRequest("http://localhost/searches/run");
  const result = await handler.runSearch({ formData, request });
  await handleResult(result, { csrfToken, path });
  throw new Error("runSearchAction should not reach this line");
}
export { buildSearchActionHandler };
