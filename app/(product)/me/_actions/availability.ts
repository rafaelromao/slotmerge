"use server";

import { headers } from "next/headers";
import { systemClock } from "../../../../src/system/clock";
import { redirect } from "next/navigation";

import { getSessionFromRequest } from "../../../../src/auth/session";
import { CsrfError } from "../../../../src/lib/csrf";
import { buildAvailabilityPageRepositories } from "../../../../src/profile/availability-page-repositories";
import { createAvailabilityWorkflow } from "../../../../src/workflow/availability";
import {
  buildAvailabilityActionHandler,
  buildErrorSearchParams,
  type AvailabilityActionResult,
} from "./availability-handler";

const clock = systemClock();
const repositories = buildAvailabilityPageRepositories(clock);
const handler = buildAvailabilityActionHandler({
  workflow: createAvailabilityWorkflow({
    clock,
    listWindows: (userId) => repositories.windows.listByUserId(userId),
    addWindow: (userId, request, profileTimezone) =>
      repositories.windows.add(userId, request, profileTimezone),
    findWindow: (id, userId) => repositories.windows.findById(id, userId),
    removeWindowById: (id, userId) =>
      repositories.windows.removeById(id, userId),
    listOverrides: (userId) => repositories.overrides.listByUserId(userId),
    addOverride: (userId, request, profileTimezone) =>
      repositories.overrides.add(userId, request, profileTimezone),
    removeOverrideById: (id, userId) =>
      repositories.overrides.removeById(id, userId),
    getProfile: (userId) => repositories.profile.findByUserId(userId),
  }),
  loadSession: async (request) => getSessionFromRequest(request, { clock }),
});

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

function handleResult(result: AvailabilityActionResult, source: string): never {
  switch (result.kind) {
    case "redirect":
      redirect(result.to);
      break;
    case "csrf-error":
      throw new CsrfError();
      break;
    case "form-error": {
      const searchParams = buildErrorSearchParams(
        result.code,
        result.field,
        result.target,
      );
      redirect(
        `/me/availability?${new URLSearchParams(searchParams).toString()}&source=${source}`,
      );
      break;
    }
  }
}

export async function addWindowAction(formData: FormData): Promise<never> {
  const request = await buildRequest("http://localhost/me/availability");
  const result = await handler.addWindow({ formData, request });
  handleResult(result, "window");
}

export async function removeWindowAction(formData: FormData): Promise<never> {
  const request = await buildRequest("http://localhost/me/availability");
  const result = await handler.removeWindow({ formData, request });
  handleResult(result, "window");
}

export async function addOverrideAction(formData: FormData): Promise<never> {
  const request = await buildRequest("http://localhost/me/availability");
  const result = await handler.addOverride({ formData, request });
  handleResult(result, "override");
}

export async function removeOverrideAction(formData: FormData): Promise<never> {
  const request = await buildRequest("http://localhost/me/availability");
  const result = await handler.removeOverride({ formData, request });
  handleResult(result, "override");
}
