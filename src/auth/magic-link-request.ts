import {
  createMagicLinkTokenIssuer,
  type MagicLinkTokenIssuer,
} from "./magic-link";
import { and, eq, gt, sql } from "drizzle-orm";
import { z } from "zod";
import type { EmailDeliveryService } from "../email/service";
import { createEmailDeliveryService } from "../email/service";
import { createPostgresEmailEventRepository } from "../email/repository";
import { enqueueInviteEmailJob } from "../email/invite-jobs";
import { loadRuntimeConfig } from "../config/runtime";
import { getDb } from "../db/client";
import type { Clock } from "../system/clock";
import { systemClock } from "../system/clock";
import { invites, users, type UserRole } from "../db/schema";

export type MagicLinkRequestInviteRecord = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "revoked";
  expiresAt: Date;
  magicLinkGeneration?: number;
};

export type MagicLinkRequestUserRecord = {
  id: string;
  email: string;
  role: string;
  status: string;
  magicLinkGeneration?: number;
};

export type MagicLinkRequestInviteRepository = {
  findById(id: string): Promise<MagicLinkRequestInviteRecord | null>;
  findPendingByEmail(
    email: string,
  ): Promise<MagicLinkRequestInviteRecord | null>;
  accept(id: string): Promise<void>;
};

export type MagicLinkRequestUserRepository = {
  findById(id: string): Promise<MagicLinkRequestUserRecord | null>;
  findByEmail(email: string): Promise<MagicLinkRequestUserRecord | null>;
  create(data: {
    email: string;
    role: string;
  }): Promise<MagicLinkRequestUserRecord>;
  incrementMagicLinkGeneration?(
    id: string,
  ): Promise<MagicLinkRequestUserRecord | null>;
};

export type MagicLinkRequestDependencies = {
  clock: Clock;
  magicLinkSecret?: string;
  inviteRepository?: MagicLinkRequestInviteRepository;
  userRepository?: MagicLinkRequestUserRepository;
  magicLinkTokenIssuer?: MagicLinkTokenIssuer;
  emailDeliveryService?: EmailDeliveryService;
  baseUrl?: string;
  rateLimiter?: MagicLinkRequestRateLimiter;
};

export type MagicLinkRequestRateLimiter = {
  take(request: Request): boolean;
};

const magicLinkLifetimeHours = 1;
const emailSchema = z.string().trim().email();

export function createMagicLinkRequestHandlers(
  deps: MagicLinkRequestDependencies,
) {
  const clock = deps.clock;
  const rateLimiter = deps.rateLimiter ?? createInMemoryRateLimiter({ clock });

  return {
    POST: async (request: Request): Promise<Response> => {
      if (!rateLimiter.take(request)) {
        return jsonResponse({ error: "rate_limited" }, 429);
      }

      const formData = await request.formData();
      const email = formData.get("email");

      if (typeof email !== "string") {
        return jsonResponse({ error: "invalid_email" }, 400);
      }
      const parsedEmail = emailSchema.safeParse(email);
      if (!parsedEmail.success) {
        return jsonResponse({ error: "invalid_email" }, 400);
      }

      const normalizedEmail = parsedEmail.data.toLowerCase();

      const issuer =
        deps.magicLinkTokenIssuer ??
        createMagicLinkTokenIssuer({
          baseUrl: deps.baseUrl ?? loadRuntimeConfig().appBaseUrl,
          secret: deps.magicLinkSecret ?? loadRuntimeConfig().magicLinkSecret,
          clock,
        });

      const inviteRepo =
        deps.inviteRepository ?? createDatabaseInviteRepository(clock);
      const userRepo =
        deps.userRepository ?? createDatabaseUserRepository(clock);
      const emailService =
        deps.emailDeliveryService ??
        createDefaultEmailDeliveryService({ clock });

      const existingUser = await userRepo.findByEmail(normalizedEmail);
      if (existingUser?.status === "suspended") {
        return jsonResponse({ sent: true }, 202);
      }
      if (existingUser) {
        try {
          await handleExistingUser({
            user: existingUser,
            userRepository: userRepo,
            issuer,
            emailService,
            clock,
          });
        } catch {
          return jsonResponse({ sent: true }, 202);
        }
        return jsonResponse({ sent: true }, 202);
      }

      const pendingInvite =
        await inviteRepo.findPendingByEmail(normalizedEmail);
      if (pendingInvite) {
        try {
          await handlePendingInvite({
            invite: pendingInvite,
            issuer,
            emailService,
            clock,
          });
        } catch {
          return jsonResponse({ sent: true }, 202);
        }
        return jsonResponse({ sent: true }, 202);
      }

      return jsonResponse({ sent: true }, 202);
    },
  };
}

async function handlePendingInvite({
  invite,
  issuer,
  emailService,
  clock,
}: {
  invite: MagicLinkRequestInviteRecord;
  issuer: MagicLinkTokenIssuer;
  emailService: EmailDeliveryService | undefined;
  clock: Clock;
}): Promise<void> {
  const expiresAt = new Date(
    clock.now().getTime() + magicLinkLifetimeHours * 60 * 60 * 1000,
  );

  const magicLink = issuer.issueMagicLinkToken({
    inviteId: invite.id,
    email: invite.email,
    expiresAt,
    generation: invite.magicLinkGeneration ?? 0,
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
}

async function handleExistingUser({
  user,
  userRepository,
  issuer,
  emailService,
  clock,
}: {
  user: MagicLinkRequestUserRecord;
  userRepository: MagicLinkRequestUserRepository;
  issuer: MagicLinkTokenIssuer;
  emailService: EmailDeliveryService | undefined;
  clock: Clock;
}): Promise<void> {
  const expiresAt = new Date(
    clock.now().getTime() + magicLinkLifetimeHours * 60 * 60 * 1000,
  );
  const refreshedUser = userRepository.incrementMagicLinkGeneration
    ? await userRepository.incrementMagicLinkGeneration(user.id)
    : user;
  if (!refreshedUser) {
    return;
  }

  const magicLink = issuer.issueMagicLinkToken({
    userId: refreshedUser.id,
    email: refreshedUser.email,
    expiresAt,
    generation: refreshedUser.magicLinkGeneration ?? 0,
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
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function createInMemoryRateLimiter(
  {
    clock,
    limit = 5,
    windowMs = 60_000,
  }: {
    clock: Clock;
    limit?: number;
    windowMs?: number;
  } = { clock: systemClock() },
): MagicLinkRequestRateLimiter {
  const state = new Map<string, { windowStart: number; count: number }>();

  return {
    take(request: Request): boolean {
      const now = clock.now().getTime();
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
  clock: Clock;
}): EmailDeliveryService {
  return createEmailDeliveryService({
    clock,
    eventRepository: createPostgresEmailEventRepository(),
    queueJob: (job) => enqueueInviteEmailJob(job),
  });
}

function createDatabaseInviteRepository(
  clock: Clock,
): MagicLinkRequestInviteRepository {
  return {
    findById: async (id) => {
      const [row] = await getDb()
        .select({
          id: invites.id,
          email: invites.email,
          role: invites.role,
          status: invites.status,
          expiresAt: invites.expiresAt,
          magicLinkGeneration: invites.magicLinkGeneration,
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
          magicLinkGeneration: invites.magicLinkGeneration,
        })
        .from(invites)
        .where(
          and(
            eq(invites.email, email),
            eq(invites.status, "pending"),
            gt(invites.expiresAt, clock.now()),
          ),
        )
        .limit(1);

      return row ?? null;
    },
    accept: async (id) => {
      await getDb()
        .update(invites)
        .set({ status: "accepted", updatedAt: clock.now() })
        .where(eq(invites.id, id));
    },
  };
}

function createDatabaseUserRepository(
  clock: Clock,
): MagicLinkRequestUserRepository {
  return {
    findById: async (id) => {
      const [row] = await getDb()
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          magicLinkGeneration: users.magicLinkGeneration,
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
          magicLinkGeneration: users.magicLinkGeneration,
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
          magicLinkGeneration: users.magicLinkGeneration,
        });

      if (!row) {
        throw new Error("user insert returned no row");
      }

      return row;
    },
    incrementMagicLinkGeneration: async (id) => {
      const [row] = await getDb()
        .update(users)
        .set({
          magicLinkGeneration: sql`${users.magicLinkGeneration} + 1`,
          updatedAt: clock.now(),
        })
        .where(and(eq(users.id, id), eq(users.status, "active")))
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          status: users.status,
          magicLinkGeneration: users.magicLinkGeneration,
        });
      return row ?? null;
    },
  };
}
