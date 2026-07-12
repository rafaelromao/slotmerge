import {
  createMagicLinkTokenIssuer,
  type MagicLinkTokenIssuer,
} from "./magic-link";
import type { InviteRecord, InviteRepository } from "./magic-link-verify";
import type { UserRecord, UserRepository } from "./magic-link-verify";
import type { EmailDeliveryService } from "../email/service";

export type MagicLinkRequestDependencies = {
  clock?: () => Date;
  magicLinkSecret?: string;
  inviteRepository?: InviteRepository;
  userRepository?: UserRepository;
  magicLinkTokenIssuer?: MagicLinkTokenIssuer;
  emailDeliveryService?: EmailDeliveryService;
  baseUrl?: string;
};

const magicLinkLifetimeHours = 1;

export function createMagicLinkRequestHandlers(
  deps: MagicLinkRequestDependencies = {},
) {
  const clock = deps.clock ?? (() => new Date());
  const baseUrl = deps.baseUrl ?? "http://localhost";

  const issuer =
    deps.magicLinkTokenIssuer ??
    createMagicLinkTokenIssuer({
      baseUrl,
      secret: deps.magicLinkSecret ?? getMagicLinkSecret(),
      clock,
    });

  return {
    POST: async (request: Request): Promise<Response> => {
      const formData = await request.formData();
      const email = formData.get("email");

      if (typeof email !== "string" || !email.trim()) {
        return jsonResponse({ error: "invalid_email" }, 400);
      }

      const normalizedEmail = email.trim().toLowerCase();

      const inviteRepo = deps.inviteRepository ?? defaultInviteRepository;
      const userRepo = deps.userRepository ?? defaultUserRepository;

      const pendingInvite =
        await inviteRepo.findPendingByEmail(normalizedEmail);
      if (pendingInvite) {
        return handlePendingInvite({
          invite: pendingInvite,
          issuer,
          emailService: deps.emailDeliveryService,
          clock,
        });
      }

      const existingUser = await userRepo.findByEmail(normalizedEmail);
      if (existingUser) {
        if (existingUser.status === "suspended") {
          return jsonResponse({ error: "not_invited" }, 400);
        }
        return handleExistingUser({
          user: existingUser,
          issuer,
          emailService: deps.emailDeliveryService,
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

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const defaultInviteRepository: InviteRepository = {
  findById: () => Promise.resolve(null),
  findPendingByEmail: () => Promise.resolve(null),
  accept: () => Promise.resolve(),
};

const defaultUserRepository: UserRepository = {
  findById: () => Promise.resolve(null),
  findByEmail: () => Promise.resolve(null),
  create: () => Promise.reject(new Error("not implemented")),
};
