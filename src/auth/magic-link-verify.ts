import { createHmac } from "node:crypto";

import { verifyMagicLinkToken, type MagicLinkTokenPayload } from "./magic-link";
import { sealSessionCookie, getSessionSecret } from "./session";
import { loadRuntimeConfig } from "../config/runtime";
import type { UserRole } from "../db/schema";

export type MagicLinkVerifyDependencies = {
  clock?: () => Date;
  magicLinkSecret?: string;
  sessionLifetimeDays?: number;
  inviteRepository?: InviteRepository;
  userRepository?: UserRepository;
  sessionRepository?: SessionRepositoryForMagicLink;
};

export type InviteRepository = {
  findById(id: string): Promise<InviteRecord | null>;
  accept(id: string): Promise<void>;
};

export type UserRepository = {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: { email: string; role: string }): Promise<UserRecord>;
};

export type SessionRepositoryForMagicLink = {
  create(data: {
    userId: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<{ id: string }>;
};

export type InviteRecord = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
};

export type UserRecord = {
  id: string;
  email: string;
  role: string;
  status: string;
};

function getMagicLinkSecret(): string {
  if (process.env.MAGIC_LINK_SECRET) {
    return process.env.MAGIC_LINK_SECRET;
  }
  if (process.env.NODE_ENV === "test") {
    return "test-magic-link-secret";
  }
  const config = loadRuntimeConfig();
  return config.magicLinkSecret;
}

function getSessionLifetimeDays(): number {
  return 30;
}

export function createMagicLinkVerifyHandlers(
  deps: MagicLinkVerifyDependencies = {},
) {
  const clock = deps.clock ?? (() => new Date());
  const magicLinkSecret = deps.magicLinkSecret ?? getMagicLinkSecret();
  const sessionLifetimeDays =
    deps.sessionLifetimeDays ?? getSessionLifetimeDays();

  return {
    GET(request: Request): Response {
      const url = new URL(request.url);
      const token = url.searchParams.get("token");

      const html = renderConfirmPage(token ?? "");
      return new Response(html, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    },

    POST: async (request: Request): Promise<Response> => {
      const formData = await request.formData();
      const token = formData.get("token");

      if (typeof token !== "string" || !token) {
        return errorResponse("invalid_token", 400);
      }

      let payload: MagicLinkTokenPayload;
      try {
        payload = verifyMagicLinkToken(token, magicLinkSecret, clock);
      } catch (err) {
        if (err instanceof Error && err.message === "invalid_token") {
          return errorResponse("invalid_token", 400);
        }
        if (err instanceof Error && err.message === "token_expired") {
          return errorResponse("token_expired", 400);
        }
        return errorResponse("invalid_token", 400);
      }

      const invite = await (
        deps.inviteRepository ?? defaultInviteRepository
      ).findById(payload.inviteId);

      if (!invite) {
        return errorResponse("invite_not_found", 400);
      }

      if (invite.status === "accepted") {
        return errorResponse("invite_already_accepted", 400);
      }

      if (invite.status === "revoked") {
        return errorResponse("invite_revoked", 400);
      }

      if (invite.expiresAt <= clock()) {
        return errorResponse("invite_expired", 400);
      }

      if (invite.email !== payload.email) {
        return errorResponse("email_mismatch", 400);
      }

      const userRepo = deps.userRepository ?? defaultUserRepository;
      let user = await userRepo.findByEmail(invite.email);
      if (!user) {
        user = await userRepo.create({
          email: invite.email,
          role: invite.role,
        });
      }

      const csrfToken = generateCsrfToken();
      const expiresAt = new Date(
        clock().getTime() + sessionLifetimeDays * 24 * 60 * 60 * 1000,
      );

      const session = await (
        deps.sessionRepository ?? defaultSessionRepository
      ).create({
        userId: user.id,
        csrfToken,
        expiresAt,
      });

      await (deps.inviteRepository ?? defaultInviteRepository).accept(
        invite.id,
      );

      const sessionCookie = await sealSessionCookie({ sessionId: session.id });

      const origin = new URL(request.url).origin;
      return new Response(null, {
        status: 302,
        headers: {
          Location: `${origin}/`,
          "Set-Cookie": sessionCookie,
        },
      });
    },
  };
}

function renderConfirmPage(token: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sign in to SlotMerge</title>
  </head>
  <body>
    <p>Signing you in to SlotMerge...</p>
    <form method="POST" action="/auth/magic-link/verify">
      <input type="hidden" name="token" value="${escapeHtml(token)}" />
      <button type="submit">Click here if not redirected automatically</button>
    </form>
    <script>
      document.forms[0].submit();
    </script>
  </body>
</html>`;
}

function errorResponse(reason: string, status: number): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sign in failed</title>
  </head>
  <body>
    <h1>Sign in failed</h1>
    <p>Reason: ${escapeHtml(reason)}</p>
    <p>Please contact an administrator if you believe this is an error.</p>
  </body>
</html>`;

  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function generateCsrfToken(): string {
  return createHmac("sha256", getSessionSecret())
    .update(crypto.randomUUID())
    .digest("base64url");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const defaultInviteRepository: InviteRepository = {
  findById: async (id) => {
    const { getDb } = await import("../db/client");
    const { eq } = await import("drizzle-orm");
    const { invites } = await import("../db/schema");
    const db = getDb();
    const [row] = await db
      .select()
      .from(invites)
      .where(eq(invites.id, id))
      .limit(1);
    return row ?? null;
  },
  accept: async (id) => {
    const { getDb } = await import("../db/client");
    const { eq } = await import("drizzle-orm");
    const { invites } = await import("../db/schema");
    const db = getDb();
    await db
      .update(invites)
      .set({ status: "accepted" })
      .where(eq(invites.id, id));
  },
};

const defaultUserRepository: UserRepository = {
  findByEmail: async (email) => {
    const { getDb } = await import("../db/client");
    const { eq } = await import("drizzle-orm");
    const { users } = await import("../db/schema");
    const db = getDb();
    const [row] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row ?? null;
  },
  create: async (data) => {
    const { getDb } = await import("../db/client");
    const { users } = await import("../db/schema");
    const db = getDb();
    const [row] = await db
      .insert(users)
      .values({
        email: data.email,
        role: data.role as UserRole,
        status: "active",
      })
      .returning();
    return row;
  },
};

const defaultSessionRepository: SessionRepositoryForMagicLink = {
  create: async (data) => {
    const { getDb } = await import("../db/client");
    const { sessions } = await import("../db/schema");
    const db = getDb();
    const [row] = await db
      .insert(sessions)
      .values({
        userId: data.userId,
        csrfToken: data.csrfToken,
        expiresAt: data.expiresAt,
      })
      .returning({ id: sessions.id });
    return row;
  },
};
