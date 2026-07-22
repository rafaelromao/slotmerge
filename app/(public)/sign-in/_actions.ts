"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  authWorkflow,
  requestContextFromRequest,
} from "../../../src/workflow/auth";

export async function signInRequestMagicLinkAction(
  formData: FormData,
): Promise<void> {
  const email = formData.get("email");
  if (typeof email !== "string" || email.trim().length === 0) {
    redirect("/sign-in?error=invalid_email");
  }

  const returnTo = formData.get("returnTo");
  const masked = maskEmailForSentPage(email.toString());

  const headerStore = await headers();
  const requestHeaders = new Headers();
  headerStore.forEach((value, key) => requestHeaders.set(key, value));
  const result = await authWorkflow.requestMagicLink({
    email: email.toString(),
    requestContext: requestContextFromRequest(
      new Request("http://localhost/sign-in", { headers: requestHeaders }),
    ),
  });

  let destination = `/sign-in/sent?email=${encodeURIComponent(masked)}`;
  if (!result.ok && result.error === "rate_limited") {
    destination = "/sign-in?error=rate_limited";
  } else if (!result.ok) {
    destination = `/sign-in?error=${result.error}`;
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
