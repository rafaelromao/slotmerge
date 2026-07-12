import { createHmac, timingSafeEqual } from "node:crypto";

import {
  createMagicLinkTokenIssuer,
  type MagicLinkTokenPayload,
} from "./magic-link";
import type { InviteRecord } from "./magic-link-verify";
import type { UserRole } from "../db/schema";
import type { EmailType } from "../email/service";

export type MagicLinkResendDependencies = {
  clock?: () => Date;
  magicLinkSecret?: string;
  baseUrl?: string;
  inviteRepository?: InviteRepositoryForResend;
  magicLinkTokenIssuer?: ReturnType<typeof createMagicLinkTokenIssuer>;
  emailDeliveryService?: EmailDeliveryServiceForResend;
  transaction?: (
    fn: (ctx: TransactionContextForResend) => Promise<void>,
  ) => Promise<void>;
};

export type InviteRepositoryForResend = {
  findById(id: string): Promise<InviteRecord | null>;
  resendInvite(
    email: string,
    role: UserRole,
    newExpiresAt: Date,
  ): Promise<InviteRecord>;
};

export type EmailDeliveryServiceForResend = {
  sendEmail(input: {
    recipient: string;
    type: EmailType;
    payload: Record<string, unknown>;
  }): Promise<{ emailEvent: unknown }>;
};

export type TransactionContextForResend = {
  inviteRepository: InviteRepositoryForResend;
};

const MAGIC_LINK_LIFETIME_DAYS = 30;

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

function getDefaultBaseUrl(): string {
  if (process.env.APP_BASE_URL) {
    return process.env.APP_BASE_URL;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_BASE_URL must be set in production. Did you forget to add it to the environment?",
    );
  }
  return "http://localhost:3000";
}

function getDefaultMagicLinkLifetimeDays(): number {
  return MAGIC_LINK_LIFETIME_DAYS;
}

function decodeTokenWithoutExpiry(
  token: string,
  secret: string,
): MagicLinkTokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new ResendTokenError("invalid_token");
  }

  const [payloadEncoded, signature] = parts;

  const expectedSignature = signPayload({ payloadEncoded, secret });
  if (!timingSafeStringEquals(signature, expectedSignature)) {
    throw new ResendTokenError("invalid_token");
  }

  let payloadJson: string;
  try {
    payloadJson = Buffer.from(payloadEncoded, "base64url").toString("utf8");
  } catch {
    throw new ResendTokenError("invalid_token");
  }

  let payload: MagicLinkTokenPayload;
  try {
    payload = JSON.parse(payloadJson) as MagicLinkTokenPayload;
  } catch {
    throw new ResendTokenError("invalid_token");
  }

  if (
    typeof payload.inviteId !== "string" ||
    typeof payload.email !== "string" ||
    typeof payload.expiresAt !== "string"
  ) {
    throw new ResendTokenError("invalid_token");
  }

  return payload;
}

function signPayload({
  payloadEncoded,
  secret,
}: {
  payloadEncoded: string;
  secret: string;
}): string {
  return createHmac("sha256", secret)
    .update(payloadEncoded)
    .digest("base64url");
}

function timingSafeStringEquals(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

export class ResendTokenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendTokenError";
  }
}

export function createMagicLinkResendHandler(
  deps: MagicLinkResendDependencies = {},
) {
  const clock = deps.clock ?? (() => new Date());
  const magicLinkSecret = deps.magicLinkSecret ?? getMagicLinkSecret();
  const baseUrl = deps.baseUrl ?? getDefaultBaseUrl();
  const magicLinkLifetimeDays =
    getDefaultMagicLinkLifetimeDays();

  return {
    POST: async (request: Request): Promise<Response> => {
      const formData = await request.formData();
      const token = formData.get("token");

      if (typeof token !== "string" || !token) {
        return errorResponse("invalid_token", 400);
      }

      let payload: MagicLinkTokenPayload;
      try {
        payload = decodeTokenWithoutExpiry(token, magicLinkSecret);
      } catch (err) {
        if (err instanceof ResendTokenError) {
          return errorResponse("invalid_token", 400);
        }
        return errorResponse("invalid_token", 400);
      }

      const inviteRepo = deps.inviteRepository ?? defaultInviteRepository;
      const invite = await inviteRepo.findById(payload.inviteId);

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

      const newExpiresAt = new Date(
        clock().getTime() + magicLinkLifetimeDays * 24 * 60 * 60 * 1000,
      );

      const tx = deps.transaction ?? defaultTransaction;
      let newInvite: InviteRecord | undefined;
      try {
        await tx(async (ctx) => {
          newInvite = await ctx.inviteRepository.resendInvite(
            invite.email,
            invite.role as UserRole,
            newExpiresAt,
          );
        });
      } catch {
        return errorResponse("server_error", 500);
      }

      if (!newInvite) {
        return errorResponse("server_error", 500);
      }

      const issuer =
        deps.magicLinkTokenIssuer ??
        createMagicLinkTokenIssuer({ baseUrl, secret: magicLinkSecret });

      const magicLink = issuer.issueMagicLinkToken({
        inviteId: newInvite.id,
        email: newInvite.email,
        expiresAt: newInvite.expiresAt,
      });

      const emailService =
        deps.emailDeliveryService ?? defaultEmailDeliveryService;

      try {
        await emailService.sendEmail({
          recipient: newInvite.email,
          type: "invite",
          payload: {
            inviteId: newInvite.id,
            email: newInvite.email,
            role: newInvite.role,
            invitedByAdminId: null,
            magicLinkUrl: magicLink.magicLinkUrl,
            magicLinkToken: magicLink.token,
            expiresAt: magicLink.expiresAt.toISOString(),
          },
        });
      } catch {
        return errorResponse("server_error", 500);
      }

      return successResponse(newInvite.email);
    },
  };
}

function successResponse(email: string): Response {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Check your email</title>
  </head>
  <body>
    <h1>Check your email</h1>
    <p>A new sign-in link has been sent to ${escapeHtml(email)}.</p>
  </body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function defaultTransaction(
  fn: (ctx: TransactionContextForResend) => Promise<void>,
): Promise<void> {
  const { getDb } = await import("../db/client");
  const { eq } = await import("drizzle-orm");
  const { invites } = await import("../db/schema");
  const db = getDb();

  await db.transaction(async (tx) => {
    await fn({
      inviteRepository: {
        findById: async (id) => {
          const [row] = await tx
            .select()
            .from(invites)
            .where(eq(invites.id, id))
            .limit(1);
          return row ?? null;
        },
        resendInvite: async (email, role, newExpiresAt) => {
          await tx
            .update(invites)
            .set({ status: "revoked", updatedAt: new Date() })
            .where(eq(invites.email, email));

          const [row] = await tx
            .insert(invites)
            .values({
              email,
              role,
              status: "pending",
              invitedByAdminId: null,
              expiresAt: newExpiresAt,
            })
            .returning();
          return row;
        },
      },
    });
  });
}

const defaultInviteRepository: InviteRepositoryForResend = {
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
  resendInvite: async (email, role, newExpiresAt) => {
    const { getDb } = await import("../db/client");
    const { eq } = await import("drizzle-orm");
    const { invites } = await import("../db/schema");
    const db = getDb();

    return db.transaction(async (tx) => {
      await tx
        .update(invites)
        .set({ status: "revoked", updatedAt: new Date() })
        .where(eq(invites.email, email));

      const [row] = await tx
        .insert(invites)
        .values({
          email,
          role,
          status: "pending",
          invitedByAdminId: null,
          expiresAt: newExpiresAt,
        })
        .returning();
      return row;
    });
  },
};

const defaultEmailDeliveryService: EmailDeliveryServiceForResend = {
  sendEmail: async (input) => {
    const { createEmailDeliveryService } = await import("../email/service");
    const { createPostgresEmailEventRepository } = await import(
      "../email/repository"
    );
    const { enqueueInviteEmailJob } = await import("../email/invite-jobs");
    const service = createEmailDeliveryService({
      clock: () => new Date(),
      eventRepository: createPostgresEmailEventRepository(),
      queueJob: (job) => enqueueInviteEmailJob(job),
    });
    return service.sendEmail({
      recipient: input.recipient,
      type: input.type,
      payload: input.payload,
    });
  },
};