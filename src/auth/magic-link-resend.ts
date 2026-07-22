import { eq, sql } from "drizzle-orm";

import { decodeMagicLinkTokenPayload } from "./magic-link";
import { getDb } from "../db/client";
import { invites } from "../db/schema";
import type { Clock } from "../system/clock";
import {
  authWorkflow,
  requestContextFromRequest,
  type AuthWorkflow,
} from "../workflow/auth";
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
  clock: Clock;
  magicLinkSecret?: string;
  inviteRepository?: MagicLinkResendInviteRepository;
  requestMagicLink?: AuthWorkflow["requestMagicLink"];
  rateLimiter?: MagicLinkResendRateLimiter;
};

export function createMagicLinkResendHandlers(
  deps: MagicLinkResendDependencies,
) {
  const clock = deps.clock;
  const inviteRepository = deps.inviteRepository ?? defaultInviteRepository;
  const requestMagicLink =
    deps.requestMagicLink ?? authWorkflow.requestMagicLink.bind(authWorkflow);
  const rateLimiter = deps.rateLimiter ?? createDefaultRateLimiter({ clock });

  return {
    POST: async (request: Request): Promise<Response> => {
      const formData = await request.formData();
      const token = formData.get("token");

      if (typeof token !== "string" || !token) {
        return errorResponse("invalid_token", 400);
      }

      let payload: MagicLinkTokenPayload;
      try {
        payload = decodeMagicLinkTokenPayload(
          token,
          deps.magicLinkSecret ?? getMagicLinkSecret(),
        );
      } catch {
        return errorResponse("invalid_token", 400);
      }

      if (!rateLimiter.allow(payload.inviteId ?? payload.userId ?? token)) {
        return errorResponse("rate_limited", 429);
      }

      const tokenExpiresAt = new Date(payload.expiresAt);
      if (isNaN(tokenExpiresAt.getTime()) || tokenExpiresAt > clock.now()) {
        return errorResponse("token_not_expired", 400);
      }
      if (!payload.inviteId) {
        return errorResponse("invalid_token", 400);
      }

      const invite = await inviteRepository.findById(payload.inviteId);
      const reason = invalidInviteReason(invite, payload, clock.now());
      if (reason) {
        return errorResponse(reason, 400);
      }

      const originalGeneration = invite!.magicLinkGeneration ?? 0;
      const refreshedInvite = await inviteRepository.incrementGeneration(
        invite!.id,
      );
      if (!refreshedInvite) {
        return errorResponse("server_error", 400);
      }

      const result = await requestMagicLink({
        email: refreshedInvite.email,
        requestContext: requestContextFromRequest(request),
      });
      if (!result.ok) {
        await inviteRepository.setMagicLinkGeneration(
          invite!.id,
          originalGeneration,
        );
        return errorResponse(
          result.error,
          result.error === "rate_limited" ? 429 : 400,
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
      <p>We sent a fresh magic link. Open the most recent email from us to sign in.</p>
    </main>
  </body>
</html>`);
    },
  };
}

function invalidInviteReason(
  invite: MagicLinkResendInviteRecord | null,
  payload: MagicLinkTokenPayload,
  now: Date,
): string | null {
  if (!invite) {
    return "invite_not_found";
  }
  if (invite.status === "accepted") {
    return "invite_already_accepted";
  }
  if (invite.status === "revoked") {
    return "invite_revoked";
  }
  if (invite.expiresAt <= now) {
    return "invite_expired";
  }
  if (invite.email !== payload.email) {
    return "email_mismatch";
  }
  if ((invite.magicLinkGeneration ?? 0) !== (payload.generation ?? 0)) {
    return "invalid_token";
  }
  return null;
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

function createDefaultRateLimiter({
  clock,
  limit = 5,
  windowMs = 15 * 60 * 1000,
}: {
  clock: Clock;
  limit?: number;
  windowMs?: number;
}): MagicLinkResendRateLimiter {
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    allow(key: string): boolean {
      const now = clock.now().getTime();
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
    const [row] = await getDb()
      .select()
      .from(invites)
      .where(eq(invites.id, id))
      .limit(1);
    return row ?? null;
  },
  setMagicLinkGeneration: async (id, generation) => {
    const [row] = await getDb()
      .update(invites)
      .set({ magicLinkGeneration: generation })
      .where(eq(invites.id, id))
      .returning();
    return row ?? null;
  },
  incrementGeneration: async (id) => {
    const [row] = await getDb()
      .update(invites)
      .set({ magicLinkGeneration: sql`${invites.magicLinkGeneration} + 1` })
      .where(eq(invites.id, id))
      .returning();
    return row ?? null;
  },
};
