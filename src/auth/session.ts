import * as Iron from "@hapi/iron";
import { and, eq, gt } from "drizzle-orm";

import { getDb } from "../db/client";
import { sessions, users, type UserRole, type UserStatus } from "../db/schema";

export type SessionUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  shortBio: string | null;
  role: UserRole;
  status: UserStatus;
  profileTimezone: string | null;
  bufferMinutes: number;
};

export type Session = {
  user: SessionUser;
  csrfToken: string;
};

export type SessionRepository = {
  findById(sessionId: string): Promise<Session | null>;
};

const sessionCookieName = "slotmerge_session";

let repositoryOverride: SessionRepository | null = null;

export function setSessionRepositoryForTests(
  repository: SessionRepository | null,
) {
  repositoryOverride = repository;
}

export async function sealSessionCookie({
  sessionId,
}: {
  sessionId: string;
}): Promise<string> {
  const sealed = await Iron.seal(
    { sessionId },
    getSessionSecret(),
    Iron.defaults,
  );

  return `${sessionCookieName}=${encodeURIComponent(sealed)}; Path=/; HttpOnly; SameSite=Lax`;
}

export async function getSessionFromRequest(
  request: Request,
): Promise<Session | null> {
  return getSessionFromCookieHeader(request.headers.get("cookie"));
}

export async function getSessionFromCookieHeader(
  cookieHeader: string | null,
): Promise<Session | null> {
  const sessionToken = getCookie(cookieHeader, sessionCookieName);

  if (!sessionToken) {
    return null;
  }

  try {
    const payload = (await Iron.unseal(
      decodeURIComponent(sessionToken),
      getSessionSecret(),
      Iron.defaults,
    )) as { sessionId: string };

    return getSessionRepository().findById(payload.sessionId);
  } catch {
    return null;
  }
}

function getSessionRepository(): SessionRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  return databaseSessionRepository;
}

const databaseSessionRepository: SessionRepository = {
  findById: async (sessionId) => {
    const [row] = await getDb()
      .select({
        user: {
          id: users.id,
          email: users.email,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          shortBio: users.shortBio,
          role: users.role,
          status: users.status,
          profileTimezone: users.profileTimezone,
          bufferMinutes: users.bufferMinutes,
        },
        csrfToken: sessions.csrfToken,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(
        and(
          eq(sessions.id, sessionId),
          eq(users.status, "active"),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);

    return row ?? null;
  },
};

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET) {
    return process.env.SESSION_SECRET;
  }

  if (process.env.NODE_ENV === "test") {
    return "test-session-secret-at-least-32-characters";
  }

  throw new Error("SESSION_SECRET is required for sealed sessions.");
}

function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [cookieName, ...valueParts] = part.trim().split("=");

    if (cookieName === name) {
      return valueParts.join("=");
    }
  }

  return null;
}
