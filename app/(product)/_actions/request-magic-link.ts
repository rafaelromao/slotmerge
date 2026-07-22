"use server";

import { redirect } from "next/navigation";

import { createMagicLinkRequestHandlers } from "../../../src/auth/magic-link-request";
import { systemDependencies } from "../../../src/system";

export type SignInActionResult =
  { status: "sent" } | { status: "error"; code: string };

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

  const handlers = createMagicLinkRequestHandlers(systemDependencies());
  const response = await handlers.POST(request);

  if (response.status === 429) {
    redirect("/?error=rate_limited");
  }

  if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: string };
      redirect(`/?error=${body.error ?? "request_failed"}`);
    } catch {
      redirect("/?error=request_failed");
    }
  }

  redirect("/?sent=1");
}
