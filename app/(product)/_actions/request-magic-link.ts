"use server";

import { redirect } from "next/navigation";

import { createMagicLinkRequestHandlers } from "../../../src/auth/magic-link-request";
import { systemDependencies } from "../../../src/system";

export type SignInActionResult =
  { status: "sent" } | { status: "error"; code: string };

const handlers = createMagicLinkRequestHandlers(systemDependencies());

export async function requestMagicLinkAction(
  formData: FormData,
): Promise<void> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    redirect("/?error=invalid_email");
  }

  const request = new Request("http://localhost/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: email.toString() }).toString(),
  });

  const response = await handlers.POST(request);

  let destination = "/?sent=1";
  if (response.status === 429) {
    destination = "/?error=rate_limited";
  } else if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: string };
      destination = `/?error=${body.error ?? "request_failed"}`;
    } catch {
      destination = "/?error=request_failed";
    }
  }

  redirect(destination);
}
