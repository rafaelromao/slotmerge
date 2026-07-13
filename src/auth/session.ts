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
  delete?(sessionId: string): Promise<void>;
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

export function clearSessionCookie(): string {
  return `${sessionCookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function getSessionFromRequest(
  request: Request,
): Promise<Session | null> {
  const sessionToken = getCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );

  if (!sessionToken) {
    return null;
  }

  try {
    const payload = (await Iron.unseal(
      decodeURIComponent(sessionToken),
      getSessionSecret(),
      Iron.defaults,
    )) as { sessionId: string };

    const session = await getSessionRepository().findById(payload.sessionId);
    return session;
  } catch {
    return null;
  }
}

export async function extractSessionIdFromRequest(
  request: Request,
): Promise<string | null> {
  const sessionToken = getCookie(
    request.headers.get("cookie"),
    sessionCookieName,
  );

  if (!sessionToken) {
    return null;
  }

  try {
    const payload = (await Iron.unseal(
      decodeURIComponent(sessionToken),
      getSessionSecret(),
      Iron.defaults,
    )) as { sessionId: string };

    return payload.sessionId;
  } catch {
    return null;
  }
}

export function getSessionRepository(): SessionRepository {
  if (repositoryOverride) {
    return repositoryOverride;
  }

  return databaseSessionRepository;
}

const databaseSessionRepository: SessionRepository = {
  delete: async (sessionId) => {
    await getDb().delete(sessions).where(eq(sessions.id, sessionId));
  },

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

export function getSessionSecret(): string {
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

export function isOrganizerOrAdmin(session: Session | null): session is Session {
  return session?.user.role === "organizer" || session?.user.role === "admin";
}
