"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { CsrfError } from "../../../../src/lib/csrf";
import { listActiveTopics } from "../../../../src/topics/repository";
import { getSearchResultRepository } from "../../../../src/search/search-result-repository";
import { getDiscoverableUserRepository } from "../../../../src/search/discoverable-user-repository";
import { getProfileByUserId } from "../../../../src/profile/repository";
import { systemClock } from "../../../../src/system/clock";
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

function handleResult(result: SearchActionResult): never {
  switch (result.kind) {
    case "redirect":
      redirect(result.to);
      break;
    case "csrf-error":
      throw new CsrfError();
      break;
    case "form-error": {
      const params = new URLSearchParams({
        error: result.code,
        field: result.field,
        minimumMatchingUsers: result.values.minimumMatchingUsers,
        durationMinutes: result.values.durationMinutes,
        dateRangeStart: result.values.dateRangeStart,
        dateRangeEnd: result.values.dateRangeEnd,
        organizerTimezone: result.values.organizerTimezone,
      });
      for (const topicId of result.values.selectedTopicIds) {
        params.append("topicIds", topicId);
      }
      redirect(`/searches?${params.toString()}`);
      break;
    }
  }
}

export async function runSearchAction(formData: FormData): Promise<never> {
  const workflow = buildWorkflow();
  const handler = buildSearchActionHandler({
    workflow,
    loadSession: async (request) => getSessionFromRequest(request),
  });

  const request = await buildRequest("http://localhost/searches/run");
  const result = await handler.runSearch({ formData, request });
  handleResult(result);
}

export { buildSearchActionHandler };
