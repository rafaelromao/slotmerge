import { eq, sql } from "drizzle-orm";

import {
  createMagicLinkTokenIssuer,
  decodeMagicLinkTokenPayload,
} from "./magic-link";
import { loadRuntimeConfig } from "../config/runtime";
import { getDb } from "../db/client";
import { invites } from "../db/schema";
import { createEmailDeliveryService } from "../email/service";
import { createPostgresEmailEventRepository } from "../email/repository";
import { enqueueInviteEmailJob } from "../email/invite-jobs";
import type { MagicLinkTokenPayload } from "./magic-link";

export type MagicLinkResendInviteRecord = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  magicLinkGeneration?: number;
};

export type MagicLinkResendInviteRepository = {
  findById(id: string): Promise<MagicLinkResendInviteRecord | null>;
  setMagicLinkGeneration(
    id: string,
    generation: number,
  ): Promise<MagicLinkResendInviteRecord | null>;
  incrementGeneration(id: string): Promise<MagicLinkResendInviteRecord | null>;
};

export type MagicLinkResendRateLimiter = {
  allow(key: string): boolean;
};

export type MagicLinkResendDependencies = {
  clock?: () => Date;
  magicLinkSecret?: string;
  inviteRepository?: MagicLinkResendInviteRepository;
  emailDeliveryService?: ReturnType<typeof createEmailDeliveryService>;
  magicLinkTokenIssuer?: ReturnType<typeof createMagicLinkTokenIssuer>;
  rateLimiter?: MagicLinkResendRateLimiter;
};

export function createMagicLinkResendHandlers(
  deps: MagicLinkResendDependencies = {},
) {
  const clock = deps.clock ?? (() => new Date());
  const inviteRepository = deps.inviteRepository ?? defaultInviteRepository;
  const emailDeliveryService =
    deps.emailDeliveryService ?? loadDefaultEmailDeliveryService({ clock });
  const magicLinkTokenIssuer =
    deps.magicLinkTokenIssuer ?? createDefaultMagicLinkTokenIssuer();
  const rateLimiter = deps.rateLimiter ?? createDefaultRateLimiter({ clock });

  return {
    POST: async (request: Request): Promise<Response> => {
      const formData = await request.formData();
      const token = formData.get("token");

      if (typeof token !== "string" || !token) {
        return errorResponse("invalid_token", 400);
      }

      const magicLinkSecret = deps.magicLinkSecret ?? getMagicLinkSecret();

      let payload: MagicLinkTokenPayload;
      try {
        payload = decodeMagicLinkTokenPayload(token, magicLinkSecret);
      } catch {
        return errorResponse("invalid_token", 400);
      }

      if (!rateLimiter.allow(payload.inviteId ?? payload.userId ?? token)) {
        return errorResponse("rate_limited", 429);
      }

      const tokenExpiresAt = new Date(payload.expiresAt);
      if (isNaN(tokenExpiresAt.getTime()) || tokenExpiresAt > clock()) {
        return errorResponse("token_not_expired", 400);
      }

      if (!payload.inviteId) {
        return errorResponse("invalid_token", 400);
      }

      const invite = await inviteRepository.findById(payload.inviteId);
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

      const originalGeneration = invite.magicLinkGeneration ?? 0;
      const refreshedInvite = await inviteRepository.incrementGeneration(
        invite.id,
      );

      if (!refreshedInvite) {
        return errorResponse("server_error", 500);
      }

      const magicLink = magicLinkTokenIssuer.issueMagicLinkToken({
        inviteId: refreshedInvite.id,
        email: refreshedInvite.email,
        expiresAt: refreshedInvite.expiresAt,
        generation: refreshedInvite.magicLinkGeneration ?? 0,
      });

      try {
        await emailDeliveryService.sendEmail({
          recipient: refreshedInvite.email,
          type: "magic-link",
          payload: {
            inviteId: refreshedInvite.id,
            email: refreshedInvite.email,
            role: refreshedInvite.role,
            magicLinkUrl: magicLink.magicLinkUrl,
            magicLinkToken: magicLink.token,
            generation: refreshedInvite.magicLinkGeneration ?? 0,
            expiresAt: magicLink.expiresAt.toISOString(),
          },
        });
      } catch (error) {
        await inviteRepository.setMagicLinkGeneration(
          invite.id,
          originalGeneration,
        );
        return errorResponse(
          `magic_link_delivery_failed: ${error instanceof Error ? error.message : "unknown"}`,
          502,
        );
      }

      return htmlResponse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Check your email</title>
  </head>
  <body>
    <main>
      <h1>Check your email</h1>
      <p>We sent a fresh magic link to ${escapeHtml(refreshedInvite.email)}.</p>
    </main>
  </body>
</html>`);
    },
  };
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

function createDefaultMagicLinkTokenIssuer(): ReturnType<
  typeof createMagicLinkTokenIssuer
> {
  const config = loadRuntimeConfig();
  return createMagicLinkTokenIssuer({
    baseUrl: config.appBaseUrl,
    secret: config.magicLinkSecret,
  });
}

function loadDefaultEmailDeliveryService({
  clock,
}: {
  clock: () => Date;
}): ReturnType<typeof createEmailDeliveryService> {
  return createEmailDeliveryService({
    clock,
    eventRepository: createPostgresEmailEventRepository(),
    queueJob: (job) => enqueueInviteEmailJob(job),
  });
}

function createDefaultRateLimiter({
  clock,
  limit = 5,
  windowMs = 15 * 60 * 1000,
}: {
  clock: () => Date;
  limit?: number;
  windowMs?: number;
}): MagicLinkResendRateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    allow(key: string): boolean {
      const now = clock().getTime();
      const bucket = buckets.get(key);

      if (!bucket || now >= bucket.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }

      if (bucket.count >= limit) {
        return false;
      }

      bucket.count += 1;
      return true;
    },
  };
}

function errorResponse(reason: string, status: number): Response {
  return htmlResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Magic link request failed</title>
  </head>
  <body>
    <h1>Magic link request failed</h1>
    <p>Reason: ${escapeHtml(reason)}</p>
  </body>
</html>`,
    status,
  );
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(body, {
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

const defaultInviteRepository: MagicLinkResendInviteRepository = {
  findById: async (id) => {
    const db = getDb();
    const [row] = await db
      .select()
      .from(invites)
      .where(eq(invites.id, id))
      .limit(1);
    return row
      ? {
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          expiresAt: row.expiresAt,
          magicLinkGeneration: row.magicLinkGeneration,
        }
      : null;
  },
  setMagicLinkGeneration: async (id, generation) => {
    const db = getDb();
    const [row] = await db
      .update(invites)
      .set({ magicLinkGeneration: generation })
      .where(eq(invites.id, id))
      .returning();

    return row
      ? {
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          expiresAt: row.expiresAt,
          magicLinkGeneration: row.magicLinkGeneration,
        }
      : null;
  },
  incrementGeneration: async (id) => {
    const db = getDb();
    const [row] = await db
      .update(invites)
      .set({ magicLinkGeneration: sql`${invites.magicLinkGeneration} + 1` })
      .where(eq(invites.id, id))
      .returning();

    return row
      ? {
          id: row.id,
          email: row.email,
          role: row.role,
          status: row.status,
          expiresAt: row.expiresAt,
          magicLinkGeneration: row.magicLinkGeneration,
        }
      : null;
  },
};
