import {
  createMagicLinkTokenIssuer,
  type MagicLinkTokenIssuer,
} from "./magic-link";
import { and, eq, gt } from "drizzle-orm";
import type { InviteRecord, InviteRepository } from "./magic-link-verify";
import type { UserRecord, UserRepository } from "./magic-link-verify";
import type { EmailDeliveryService } from "../email/service";
import { createEmailDeliveryService } from "../email/service";
import { createPostgresEmailEventRepository } from "../email/repository";
import { enqueueInviteEmailJob } from "../email/invite-jobs";
import { loadRuntimeConfig } from "../config/runtime";
import { getDb } from "../db/client";
import { invites, users, type UserRole } from "../db/schema";

export type MagicLinkRequestDependencies = {
  clock?: () => Date;
  magicLinkSecret?: string;
  inviteRepository?: InviteRepository;
  userRepository?: UserRepository;
  magicLinkTokenIssuer?: MagicLinkTokenIssuer;
  emailDeliveryService?: EmailDeliveryService;
  baseUrl?: string;
  rateLimiter?: MagicLinkRequestRateLimiter;
};

export type MagicLinkRequestRateLimiter = {
  take(request: Request): boolean;
};

const magicLinkLifetimeHours = 1;

export function createMagicLinkRequestHandlers(
  deps: MagicLinkRequestDependencies = {},
) {
  const clock = deps.clock ?? (() => new Date());
  const rateLimiter = deps.rateLimiter ?? createInMemoryRateLimiter();

  return {
    POST: async (request: Request): Promise<Response> => {
      if (!rateLimiter.take(request)) {
        return jsonResponse({ error: "rate_limited" }, 429);
      }

      const formData = await request.formData();
      const email = formData.get("email");

      if (typeof email !== "string" || !email.trim()) {
        return jsonResponse({ error: "invalid_email" }, 400);
      }

      const normalizedEmail = email.trim().toLowerCase();

      const issuer =
        deps.magicLinkTokenIssuer ??
        createMagicLinkTokenIssuer({
          baseUrl: deps.baseUrl ?? loadRuntimeConfig().appBaseUrl,
          secret: deps.magicLinkSecret ?? loadRuntimeConfig().magicLinkSecret,
          clock,
        });

      const inviteRepo =
        deps.inviteRepository ?? createDatabaseInviteRepository(clock);
      const userRepo = deps.userRepository ?? createDatabaseUserRepository();
      const emailService =
        deps.emailDeliveryService ??
        createDefaultEmailDeliveryService({ clock });

      const existingUser = await userRepo.findByEmail(normalizedEmail);
      if (existingUser?.status === "suspended") {
        return jsonResponse({ error: "not_invited" }, 400);
      }

      const pendingInvite =
        await inviteRepo.findPendingByEmail(normalizedEmail);
      if (pendingInvite) {
        return handlePendingInvite({
          invite: pendingInvite,
          issuer,
          emailService,
          clock,
        });
      }

      if (existingUser) {
        return handleExistingUser({
          user: existingUser,
          issuer,
          emailService,
          clock,
        });
      }

      return jsonResponse({ error: "not_invited" }, 400);
    },
  };
}

async function handlePendingInvite({
  invite,
  issuer,
  emailService,
  clock,
}: {
  invite: InviteRecord;
  issuer: MagicLinkTokenIssuer;
  emailService: EmailDeliveryService | undefined;
  clock: () => Date;
}): Promise<Response> {
  const expiresAt = new Date(
    clock().getTime() + magicLinkLifetimeHours * 60 * 60 * 1000,
  );

  const magicLink = issuer.issueMagicLinkToken({
    inviteId: invite.id,
    email: invite.email,
    expiresAt,
  });

  if (emailService) {
    await emailService.sendEmail({
      recipient: invite.email,
      type: "magic-link",
      payload: {
        magicLinkUrl: magicLink.magicLinkUrl,
        magicLinkToken: magicLink.token,
        expiresAt: expiresAt.toISOString(),
      },
    });
  }

  return jsonResponse({ sent: true }, 200);
}

async function handleExistingUser({
  user,
  issuer,
  emailService,
  clock,
}: {
  user: UserRecord;
  issuer: MagicLinkTokenIssuer;
  emailService: EmailDeliveryService | undefined;
  clock: () => Date;
}): Promise<Response> {
  const expiresAt = new Date(
    clock().getTime() + magicLinkLifetimeHours * 60 * 60 * 1000,
  );

  const magicLink = issuer.issueMagicLinkToken({
    userId: user.id,
    email: user.email,
    expiresAt,
  });

  if (emailService) {
    await emailService.sendEmail({
      recipient: user.email,
      type: "magic-link",
      payload: {
        magicLinkUrl: magicLink.magicLinkUrl,
        magicLinkToken: magicLink.token,
        expiresAt: expiresAt.toISOString(),
      },
    });
  }

  return jsonResponse({ sent: true }, 200);
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createInMemoryRateLimiter({
  clock = () => new Date(),
  limit = 5,
  windowMs = 60_000,
}: {
  clock?: () => Date;
  limit?: number;
  windowMs?: number;
} = {}): MagicLinkRequestRateLimiter {
  const state = new Map<string, { windowStart: number; count: number }>();

  return {
    take(request: Request): boolean {
      const now = clock().getTime();
      const key = getRequestKey(request);
      const current = state.get(key);

      if (!current || now - current.windowStart >= windowMs) {
        state.set(key, { windowStart: now, count: 1 });
        return true;
      }

      if (current.count >= limit) {
        return false;
      }

      current.count += 1;
      return true;
    },
  };
}

function getRequestKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "anonymous"
  );
}

function createDefaultEmailDeliveryService({
  clock,
}: {
  clock: () => Date;
}): EmailDeliveryService {
  return createEmailDeliveryService({
    clock,
    eventRepository: createPostgresEmailEventRepository(),
    queueJob: (job) => enqueueInviteEmailJob(job),
  });
}

function createDatabaseInviteRepository(clock: () => Date): InviteRepository {
  return {
    findById: async (id) => {
      const [row] = await getDb()
        .select({
          id: invites.id,
          email: invites.email,
          role: invites.role,
          status: invites.status,
          expiresAt: invites.expiresAt,
        })
        .from(invites)
        .where(eq(invites.id, id))
        .limit(1);

      return row ?? null;
    },
    findPendingByEmail: async (email) => {
      const [row] = await getDb()
        .select({
          id: invites.id,
          email: invites.email,
          role: invites.role,
          status: invites.status,
          expiresAt: invites.expiresAt,
        })
        .from(invites)
        .where(
          and(
            eq(invites.email, email),
            eq(invites.status, "pending"),
            gt(invites.expiresAt, clock()),
          ),
        )
        .limit(1);

      return row ?? null;
    },
    accept: async (id) => {
      await getDb()
        .update(invites)
        .set({ status: "accepted", updatedAt: clock() })
        .where(eq(invites.id, id));
    },
  };
}

function createDatabaseUserRepository(): UserRepository {
  return {
    findById: async (id) => {
      const [row] = await getDb()
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);

      return row ?? null;
    },
    findByEmail: async (email) => {
      const [row] = await getDb()
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      return row ?? null;
    },
    create: async ({ email, role }) => {
      const [row] = await getDb()
        .insert(users)
        .values({
          email,
          role: role as UserRole,
          status: "active",
        })
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
        });

      if (!row) {
        throw new Error("user insert returned no row");
      }

      return row;
    },
  };
}
