"use server";

import { redirect } from "next/navigation";

import { createMagicLinkRequestHandlers } from "../../../src/auth/magic-link-request";
import { systemDependencies } from "../../../src/system";

const handlers = createMagicLinkRequestHandlers(systemDependencies());

export async function signInRequestMagicLinkAction(
  formData: FormData,
): Promise<void> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    redirect("/sign-in?error=invalid_email");
  }

  const returnTo = formData.get("returnTo");
  const masked = maskEmailForSentPage(email.toString());

  const request = new Request("http://localhost/auth/magic-link/request", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: email.toString() }).toString(),
  });

  const response = await handlers.POST(request);

  let destination = `/sign-in/sent?email=${encodeURIComponent(masked)}`;
  if (response.status === 429) {
    destination = "/sign-in?error=rate_limited";
  } else if (!response.ok) {
    try {
      const body = (await response.json()) as { error?: string };
      destination = `/sign-in?error=${body.error ?? "request_failed"}`;
    } catch {
      destination = "/sign-in?error=request_failed";
    }
  }

  if (typeof returnTo === "string" && returnTo.length > 0) {
    const sep = destination.includes("?") ? "&" : "?";
    destination = `${destination}${sep}returnTo=${encodeURIComponent(returnTo)}`;
  }

  redirect(destination);
}

function maskEmailForSentPage(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) {
    return email;
  }
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 1) {
    return `${local}${domain}`;
  }
  return `${local[0]}${"*".repeat(Math.max(local.length - 1, 3))}${domain}`;
}
