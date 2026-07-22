import { createHmac } from "node:crypto";

import {
  decodeMagicLinkTokenPayload,
  verifyMagicLinkToken,
  type MagicLinkTokenPayload,
} from "./magic-link";
import { sealSessionCookie, getSessionSecret } from "./session";
import type { Clock } from "../system/clock";
import type { UserRole } from "../db/schema";
import { loadRuntimeConfig } from "../config/runtime";

export type MagicLinkVerifyDependencies = {
  clock: Clock;
  magicLinkSecret?: string;
  sessionLifetimeDays?: number;
  inviteRepository?: InviteRepository;
  userRepository?: UserRepository;
  sessionRepository?: SessionRepositoryForMagicLink;
  transaction?: (
    fn: (ctx: TransactionContext) => Promise<void>,
  ) => Promise<void>;
};

export type TransactionContext = {
  sessionRepository: SessionRepositoryForMagicLink;
  inviteRepository: InviteRepository;
  userRepository?: UserRepository;
};

export type InviteClaimInput = {
  id: string;
  email: string;
  generation: number;
  now: Date;
};

export type InviteRepository = {
  findById(id: string): Promise<InviteRecord | null>;
  accept(id: string): Promise<boolean>;
  claim?(input: InviteClaimInput): Promise<InviteRecord | null>;
};

export type UserClaimInput = {
  id: string;
  email: string;
  generation: number;
  now: Date;
};

export type UserRepository = {
  findById?(id: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: { email: string; role: string }): Promise<UserRecord>;
  claimMagicLink?(input: UserClaimInput): Promise<UserRecord | null>;
};

export type SessionRepositoryForMagicLink = {
  create(data: {
    userId: string;
    csrfToken: string;
    expiresAt: Date;
  }): Promise<{ id: string }>;
  delete(id: string): Promise<void>;
};

export type InviteRecord = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  magicLinkGeneration?: number;
};

export type UserRecord = {
  id: string;
  email: string;
  role: string;
  status: string;
  magicLinkGeneration?: number;
};

class VerifyError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "VerifyError";
  }
}

function errorLinkStateFor(
  reason: string,
): "link_expired" | "link_used" | "link_invalid" {
  switch (reason) {
    case "token_expired":
    case "invite_expired":
      return "link_expired";
    case "invite_already_accepted":
    case "magic_link_already_used":
      return "link_used";
    default:
      return "link_invalid";
  }
}

function getMagicLinkSecret(): string {
  if (process.env.MAGIC_LINK_SECRET) {
    return process.env.MAGIC_LINK_SECRET;
  }
  if (process.env.NODE_ENV === "test") {
    return "test-magic-link-secret";
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "MAGIC_LINK_SECRET must be set in production. Did you forget to add it to the environment?",
    );
  }
  return "local-magic-link-secret-do-not-use-in-production";
}

function getSessionLifetimeDays(): number {
  return 30;
}

export function createMagicLinkVerifyHandlers(
  deps: MagicLinkVerifyDependencies,
) {
  const clock = deps.clock;
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
        return errorRedirect(request, "invalid_token", "link_invalid");
      }

      const magicLinkSecret = deps.magicLinkSecret ?? getMagicLinkSecret();

      let decodedPayload: MagicLinkTokenPayload | null = null;
      try {
        decodedPayload = decodeMagicLinkTokenPayload(token, magicLinkSecret);
      } catch {
        decodedPayload = null;
      }

      let payload: MagicLinkTokenPayload;
      try {
        payload = verifyMagicLinkToken(token, magicLinkSecret, clock);
      } catch (err) {
        if (err instanceof Error && err.message === "token_expired") {
          return errorRedirect(
            request,
            "token_expired",
            "link_expired",
            decodedPayload?.email,
            token,
          );
        }
        return errorRedirect(request, "invalid_token", "link_invalid");
      }

      const csrfToken = generateCsrfToken();
      const expiresAt = new Date(
        clock.now().getTime() + sessionLifetimeDays * 24 * 60 * 60 * 1000,
      );
      const transaction =
        deps.transaction ??
        (deps.inviteRepository || deps.userRepository || deps.sessionRepository
          ? createDependencyTransaction(deps)
          : defaultTransaction);
      const userRepository = deps.userRepository ?? defaultUserRepository;

      let sessionCookie = "";
      try {
        await transaction(async (ctx) => {
          const transactionalUserRepository =
            ctx.userRepository ?? userRepository;
          let user: UserRecord;
          let inviteToClaim: InviteRecord | null = null;

          if (payload.userId) {
            user = await claimExistingUser(
              transactionalUserRepository,
              payload,
              clock.now(),
            );
          } else if (payload.inviteId) {
            inviteToClaim = await loadInvite(
              ctx.inviteRepository,
              payload,
              clock.now(),
            );
            const existingUser = await transactionalUserRepository.findByEmail(
              inviteToClaim.email,
            );
            if (existingUser && existingUser.status !== "active") {
              throw new VerifyError("user_suspended");
            }
            user =
              existingUser ??
              (await transactionalUserRepository.create({
                email: inviteToClaim.email,
                role: inviteToClaim.role,
              }));
          } else {
            throw new VerifyError("invalid_token");
          }

          const session = await ctx.sessionRepository.create({
            userId: user.id,
            csrfToken,
            expiresAt,
          });
          if (inviteToClaim) {
            await claimInvite(ctx.inviteRepository, payload, clock.now());
          }
          sessionCookie = await sealSessionCookie({ sessionId: session.id });
        });
      } catch (err) {
        if (err instanceof VerifyError) {
          const linkState = errorLinkStateFor(err.reason);
          return errorRedirect(
            request,
            err.reason,
            linkState,
            payload.email,
            linkState === "link_expired" ? token : undefined,
          );
        }
        return errorRedirect(request, "server_error", "link_invalid");
      }

      const origin = loadRuntimeConfig().appBaseUrl;
      return new Response(null, {
        status: 303,
        headers: {
          Location: `${origin}/`,
          "Set-Cookie": sessionCookie,
        },
      });
    },
  };
}

async function loadInvite(
  repository: InviteRepository,
  payload: MagicLinkTokenPayload,
  now: Date,
): Promise<InviteRecord> {
  const id = payload.inviteId;
  if (!id) {
    throw new VerifyError("invalid_token");
  }
  const invite = await repository.findById(id);
  validateInvite(invite, payload, now);
  return invite;
}

async function claimInvite(
  repository: InviteRepository,
  payload: MagicLinkTokenPayload,
  now: Date,
): Promise<InviteRecord> {
  const id = payload.inviteId;
  if (!id) {
    throw new VerifyError("invalid_token");
  }

  const input: InviteClaimInput = {
    id,
    email: payload.email,
    generation: payload.generation ?? 0,
    now,
  };
  if (repository.claim) {
    const claimed = await repository.claim(input);
    if (claimed) {
      return claimed;
    }
  }

  const invite = await repository.findById(id);
  validateInvite(invite, payload, now);

  if (repository.claim) {
    throw new VerifyError("invite_already_accepted");
  }
  const accepted = await repository.accept(id);
  if (!accepted) {
    throw new VerifyError("invite_already_accepted");
  }
  return invite;
}

function validateInvite(
  invite: InviteRecord | null,
  payload: MagicLinkTokenPayload,
  now: Date,
): asserts invite is InviteRecord {
  if (!invite) {
    throw new VerifyError("not_invited");
  }
  if (invite.status === "accepted") {
    throw new VerifyError("invite_already_accepted");
  }
  if (invite.status === "revoked") {
    throw new VerifyError("invite_revoked");
  }
  if (invite.expiresAt <= now) {
    throw new VerifyError("invite_expired");
  }
  if (invite.email !== payload.email) {
    throw new VerifyError("email_mismatch");
  }
  if ((invite.magicLinkGeneration ?? 0) !== (payload.generation ?? 0)) {
    throw new VerifyError("invalid_token");
  }
}

async function claimExistingUser(
  repository: UserRepository,
  payload: MagicLinkTokenPayload,
  now: Date,
): Promise<UserRecord> {
  const id = payload.userId;
  if (!id || !repository.findById) {
    throw new VerifyError("invalid_token");
  }

  const input: UserClaimInput = {
    id,
    email: payload.email,
    generation: payload.generation ?? 0,
    now,
  };
  if (repository.claimMagicLink) {
    const claimed = await repository.claimMagicLink(input);
    if (claimed) {
      return claimed;
    }
  }

  const user = await repository.findById(id);
  if (!user || user.email !== payload.email || user.status !== "active") {
    throw new VerifyError("invalid_token");
  }
  if (repository.claimMagicLink) {
    throw new VerifyError("magic_link_already_used");
  }
  if ((user.magicLinkGeneration ?? 0) !== (payload.generation ?? 0)) {
    throw new VerifyError("magic_link_already_used");
  }
  return user;
}

function createDependencyTransaction(
  deps: MagicLinkVerifyDependencies,
): (fn: (ctx: TransactionContext) => Promise<void>) => Promise<void> {
  return async (fn) => {
    await fn({
      sessionRepository: deps.sessionRepository ?? defaultSessionRepository,
      inviteRepository: deps.inviteRepository ?? defaultInviteRepository,
      userRepository: deps.userRepository ?? defaultUserRepository,
    });
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

function errorRedirect(
  request: Request,
  reason: string,
  linkState: "link_expired" | "link_used" | "link_invalid",
  email?: string,
  resendToken?: string,
): Response {
  const destination = new URL("/sign-in/verify", request.url);
  destination.searchParams.set("error", linkState);
  destination.searchParams.set("reason", reason);
  if (email) {
    destination.searchParams.set("email", email);
  }
  if (resendToken) {
    destination.searchParams.set("token", resendToken);
  }
  return new Response(null, {
    status: 303,
    headers: { Location: destination.toString() },
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

async function defaultTransaction(
  fn: (ctx: TransactionContext) => Promise<void>,
): Promise<void> {
  const { getDb } = await import("../db/client");
  const { sessions, invites, users } = await import("../db/schema");
  const { and, eq, gt, sql } = await import("drizzle-orm");
  const db = getDb();

  await db.transaction(async (tx) => {
    await fn({
      sessionRepository: {
        create: async (data) => {
          const [row] = await tx
            .insert(sessions)
            .values({
              userId: data.userId,
              csrfToken: data.csrfToken,
              expiresAt: data.expiresAt,
            })
            .returning({ id: sessions.id });
          return row;
        },
        delete: async (id: string) => {
          await tx.delete(sessions).where(eq(sessions.id, id));
        },
      },
      inviteRepository: {
        findById: async (id) => {
          const [row] = await tx
            .select()
            .from(invites)
            .where(eq(invites.id, id))
            .limit(1);
          return row ?? null;
        },
        accept: async (id) => {
          const result = await tx
            .update(invites)
            .set({ status: "accepted" })
            .where(and(eq(invites.id, id), eq(invites.status, "pending")))
            .returning({ id: invites.id });
          return result.length > 0;
        },
        claim: async ({ id, email, generation, now }) => {
          const [row] = await tx
            .update(invites)
            .set({ status: "accepted", updatedAt: now })
            .where(
              and(
                eq(invites.id, id),
                eq(invites.email, email),
                eq(invites.status, "pending"),
                eq(invites.magicLinkGeneration, generation),
                gt(invites.expiresAt, now),
              ),
            )
            .returning();
          return row ?? null;
        },
      },
      userRepository: {
        findById: async (id) => {
          const [row] = await tx
            .select()
            .from(users)
            .where(eq(users.id, id))
            .limit(1);
          return row ?? null;
        },
        findByEmail: async (email) => {
          const [row] = await tx
            .select()
            .from(users)
            .where(eq(users.email, email))
            .limit(1);
          return row ?? null;
        },
        create: async (data) => {
          const [row] = await tx
            .insert(users)
            .values({
              email: data.email,
              role: data.role as UserRole,
              status: "active",
            })
            .returning();
          return row;
        },
        claimMagicLink: async ({ id, email, generation, now }) => {
          const [row] = await tx
            .update(users)
            .set({
              magicLinkGeneration: sql`${users.magicLinkGeneration} + 1`,
              updatedAt: now,
            })
            .where(
              and(
                eq(users.id, id),
                eq(users.email, email),
                eq(users.status, "active"),
                eq(users.magicLinkGeneration, generation),
              ),
            )
            .returning();
          return row ?? null;
        },
      },
    });
  });
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
    const { and, eq } = await import("drizzle-orm");
    const { invites } = await import("../db/schema");
    const db = getDb();
    const result = await db
      .update(invites)
      .set({ status: "accepted" })
      .where(and(eq(invites.id, id), eq(invites.status, "pending")))
      .returning({ id: invites.id });
    return result.length > 0;
  },
  claim: async ({ id, email, generation, now }) => {
    const { getDb } = await import("../db/client");
    const { and, eq, gt } = await import("drizzle-orm");
    const { invites } = await import("../db/schema");
    const [row] = await getDb()
      .update(invites)
      .set({ status: "accepted", updatedAt: now })
      .where(
        and(
          eq(invites.id, id),
          eq(invites.email, email),
          eq(invites.status, "pending"),
          eq(invites.magicLinkGeneration, generation),
          gt(invites.expiresAt, now),
        ),
      )
      .returning();
    return row ?? null;
  },
};

const defaultUserRepository: UserRepository = {
  findById: async (id) => {
    const { getDb } = await import("../db/client");
    const { eq } = await import("drizzle-orm");
    const { users } = await import("../db/schema");
    const [row] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return row ?? null;
  },
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
  claimMagicLink: async ({ id, email, generation, now }) => {
    const { getDb } = await import("../db/client");
    const { and, eq, sql } = await import("drizzle-orm");
    const { users } = await import("../db/schema");
    const [row] = await getDb()
      .update(users)
      .set({
        magicLinkGeneration: sql`${users.magicLinkGeneration} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(users.id, id),
          eq(users.email, email),
          eq(users.status, "active"),
          eq(users.magicLinkGeneration, generation),
        ),
      )
      .returning();
    return row ?? null;
  },
};

const defaultSessionRepository: SessionRepositoryForMagicLink = {
  create: async (data) => {
    const { getDb } = await import("../db/client");
    const { sessions } = await import("../db/schema");
    const [row] = await getDb()
      .insert(sessions)
      .values({
        userId: data.userId,
        csrfToken: data.csrfToken,
        expiresAt: data.expiresAt,
      })
      .returning({ id: sessions.id });
    return row;
  },
  delete: async (id) => {
    const { getDb } = await import("../db/client");
    const { eq } = await import("drizzle-orm");
    const { sessions } = await import("../db/schema");
    await getDb().delete(sessions).where(eq(sessions.id, id));
  },
};
