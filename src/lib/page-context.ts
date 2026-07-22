import { notFound } from "next/navigation";

import {
  getSessionFromRequest,
  type Session,
} from "../auth/session";
import type { UserRole } from "../db/schema";

export type Capability = {
  roles: ReadonlyArray<UserRole>;
};

export type PageContext = {
  user: Session["user"];
  csrfToken: string;
  isAuthed: true;
  isAdmin: boolean;
  isOrganizerOrAdmin: boolean;
};

export function assertRole(
  session: Session | null,
  allowed: ReadonlyArray<UserRole>,
): boolean {
  if (!session) {
    return false;
  }
  return allowed.includes(session.user.role);
}

export async function requirePageContext(
  capability: Capability,
  request: Request,
): Promise<PageContext> {
  const session = await getSessionFromRequest(request);

  if (!session) {
    redirectToSignIn(request);
  }

  if (!isAuthedSession(session)) {
    redirectToSignIn(request);
  }

  if (!capability.roles.includes(session.user.role)) {
    notFound();
  }

  return {
    user: session.user,
    csrfToken: session.csrfToken,
    isAuthed: true,
    isAdmin: session.user.role === "admin",
    isOrganizerOrAdmin:
      session.user.role === "organizer" || session.user.role === "admin",
  };
}

function isAuthedSession(session: Session): boolean {
  return session.user.status === "active";
}

function redirectToSignIn(request: Request): never {
  const returnTo = safeReturnTo(new URL(request.url));
  const target = returnTo
    ? `/sign-in?returnTo=${encodeURIComponent(returnTo)}`
    : "/sign-in";
  throw new Response(null, {
    status: 303,
    headers: { Location: target },
  });
}

function safeReturnTo(url: URL): string | null {
  const raw = url.searchParams.get("returnTo");
  if (!raw) {
    return pathFromUrl(url);
  }

  if (!isSafeRelativePath(raw)) {
    return null;
  }

  return raw;
}

function pathFromUrl(url: URL): string {
  return `${url.pathname}${url.search}`;
}

function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/")) {
    return false;
  }
  if (value.startsWith("//")) {
    return false;
  }
  if (value.startsWith("/\\")) {
    return false;
  }
  if (value.includes("..")) {
    return false;
  }
  return true;
}
